#!/usr/bin/env node
'use strict';
// Contract tests for the opt-in Spotify module (spotify.js), its sign-in callback page and how the shipped files wire it.
// Everything is mocked: no network, no Spotify account or app, no real window or storage, no real sign-in.
// A real Spotify sign-in can only be proven by the player in a real browser (see SPOTIFY.md).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const Spotify = require(path.join(root, 'spotify.js'));
const Diagnostics = require(path.join(root, 'diagnostics.js'));
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const unhandled = [];
process.on('unhandledRejection', error => unhandled.push(error));

const ID = '0123456789abcdef0123456789abcdef';
const TRACK = '4uLU6hMCjMI75M1A2tKUQC';
const PLAYLIST = '37i9dQZF1DXcBWIGoYBM5M';
const SIGNED = { starfighterSpotify: JSON.stringify({ v: 1, clientId: ID, refresh: 'REFRESH-1' }), starfighterSpotifyOn: '1' };
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

function mockStorage(initial = {}) {
  const map = new Map(Object.entries(initial)); let writes = 0;
  return { map, get writes() { return writes; }, getItem: key => map.has(key) ? map.get(key) : null, setItem(key, value) { writes++; map.set(key, String(value)); }, removeItem(key) { map.delete(key); } };
}
function fakeTimers() {
  let id = 0; const pending = new Map();
  return { pending, set(fn, ms) { pending.set(++id, { fn, ms }); return id; }, clear(i) { pending.delete(i); }, count: () => pending.size,
    // Run (and remove) every pending timer whose delay equals `ms`, or all of them when `ms` is omitted.
    fire(ms) { for (const [i, timer] of [...pending]) if ((ms === undefined || timer.ms === ms) && pending.delete(i)) timer.fn(); } };
}
function makeWindow(extra = {}) {
  const listeners = {}, opened = [], channels = [];
  class Channel { constructor(name) { this.name = name; channels.push(this); } postMessage(data) { for (const other of channels) if (other !== this && !other.closed && other.name === this.name) other.onmessage?.({ data }); } close() { this.closed = true; } }
  const win = {
    location: { href: 'http://127.0.0.1:8765/index.html?hostKey=abc', origin: 'http://127.0.0.1:8765' },
    open(url, name, features) { if (extra.blockPopups) return null; const popup = { url, name, features, closed: false, location: { href: '' }, close() { this.closed = true; } }; opened.push(popup); return popup; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }, removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(item => item !== fn); },
    dispatch(type, event) { for (const fn of [...(listeners[type] || [])]) fn(event); },
    BroadcastChannel: Channel, crypto: webcrypto, navigator: { clipboard: { writeText: async text => { win.copied = text; } } }, ...extra,
  };
  return { win, opened, listeners, channels, Channel };
}
function fakeEl(id) {
  const handlers = {}; return { id, hidden: false, textContent: '', value: '', src: '', href: '', disabled: false, handlers,
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); }, click() { for (const fn of handlers.click || []) fn({}); } };
}
function fakeDocument() {
  const appended = [], elements = new Map();
  return { appended, elements, head: { append(el) { appended.push(el); } }, createElement: tag => ({ tag }), activeElement: null,
    getElementById(id) { if (!elements.has(id)) elements.set(id, fakeEl(id)); return elements.get(id); } };
}
function makeSdk() {
  const players = []; const state = { connectResult: true };
  class Player {
    constructor(options) { this.options = options; this.listeners = {}; this.calls = []; players.push(this); }
    addListener(event, fn) { (this.listeners[event] ||= []).push(fn); return true; }
    connect() { this.calls.push('connect'); return Promise.resolve(state.connectResult); }
    disconnect() { this.calls.push('disconnect'); }
    pause() { this.calls.push('pause'); return Promise.resolve(); } resume() { this.calls.push('resume'); return Promise.resolve(); }
    togglePlay() { this.calls.push('togglePlay'); return Promise.resolve(); } nextTrack() { this.calls.push('nextTrack'); return Promise.resolve(); } previousTrack() { this.calls.push('previousTrack'); return Promise.resolve(); }
    activateElement() { this.calls.push('activateElement'); return Promise.resolve(); }
    setVolume(value) { this.calls.push(['setVolume', value]); return Promise.resolve(); }
    emit(event, payload) { for (const fn of this.listeners[event] || []) fn(payload); }
  }
  return { Player, players, state };
}
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body }; calls.push(call);
    const answer = await routes(call, calls); if (answer instanceof Error) throw answer;
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body ?? {} };
  };
  fn.calls = calls; return fn;
}
const tokenAnswer = (extra = {}) => ({ status: 200, body: { access_token: 'ACCESS-1', refresh_token: 'REFRESH-2', expires_in: 3600, ...extra } });
const defaultRoutes = call => call.url.startsWith('https://accounts.spotify.com/api/token') ? tokenAnswer() : { status: 204 };
function rig(options = {}) {
  const storage = mockStorage(options.stored || {}), timers = fakeTimers(), w = makeWindow(options.window || {}), doc = fakeDocument(), sdk = makeSdk(), changes = [], clock = { t: 1e6 };
  if (options.sdk !== false) w.win.Spotify = { Player: sdk.Player };
  const fetch = options.fetch || fakeFetch(defaultRoutes);
  const ctl = Spotify.create({ window: w.win, document: doc, storage, fetch, timers, crypto: webcrypto, now: () => clock.t, sandbox: options.sandbox, onChange: s => changes.push(s) });
  return { ctl, storage, timers, doc, sdk, fetch, changes, clock, ...w };
}
// Sign in using a stored refresh token and bring the player up to "ready".
async function ready(options = {}) {
  const r = rig({ stored: SIGNED, ...options }); r.ctl.restore(); await flush();
  const player = r.sdk.players[0]; player.emit('ready', { device_id: 'DEV' }); return { ...r, player };
}
const song = (paused, id = TRACK) => ({ paused, track_window: { current_track: { id, name: 'Test Song', artists: [{ name: 'Test Artist' }], album: { name: 'Test Album', images: [{ url: 'https://i.scdn.co/image/abc', width: 64, height: 64 }] } } } });
const volumes = player => player.calls.filter(c => Array.isArray(c) && c[0] === 'setVolume').map(c => c[1]);
const message = r => r.ctl.snapshot().message;

test('off by default: no network, popup, script or storage write until the player acts', async () => {
  const r = rig(); await flush();
  r.ctl.setLevel(.5, false); r.ctl.setAway(true); r.ctl.setAway(false); r.ctl.restore(); r.ctl.cancel();
  assert.equal(r.fetch.calls.length, 0); assert.equal(r.opened.length, 0); assert.equal(r.doc.appended.length, 0); assert.equal(r.storage.writes, 0);
  assert.equal(r.ctl.status, 'idle'); assert.equal(r.ctl.takesMusic, false); assert.equal(r.ctl.signedIn, false);
  assert.match(message(r), /Nothing is contacted until you press CONNECT SPOTIFY/);
});

test('a refresh token is only used when the earlier sign-in flag is also present', async () => {
  const r = rig({ stored: { starfighterSpotify: SIGNED.starfighterSpotify } }); r.ctl.restore(); await flush();
  assert.equal(r.fetch.calls.length, 0); assert.equal(r.ctl.signedIn, false, 'Without the flag the stored token is ignored');
});

test('Flight School practice: the module is inert, hides its controls and ignores a stored sign-in', async () => {
  const r = rig({ stored: SIGNED, sandbox: true }), group = r.doc.getElementById('spotify-group'), mini = r.doc.getElementById('spotify-mini');
  assert.equal(r.ctl.bind(r.doc), false); assert.equal(group.hidden, true); assert.equal(mini.hidden, true);
  assert.equal(r.ctl.connect(), false); r.ctl.restore(); r.ctl.setClientId(ID); r.ctl.setLevel(.4, false); r.ctl.setAway(true);
  assert.equal(await r.ctl.playLink(`https://open.spotify.com/track/${TRACK}`), false); assert.equal(await r.ctl.bringHere(), false);
  await flush();
  assert.equal(r.fetch.calls.length, 0); assert.equal(r.opened.length, 0); assert.equal(r.doc.appended.length, 0); assert.equal(r.storage.writes, 0);
  assert.equal(r.ctl.takesMusic, false); assert.equal(r.ctl.signedIn, false);
});

test('PKCE: verifier is random 64 URL-safe characters and the challenge matches the RFC 7636 test vector', async () => {
  const a = Spotify.randomString(64, webcrypto), b = Spotify.randomString(64, webcrypto);
  assert.match(a, /^[A-Za-z0-9_-]{64}$/); assert.notEqual(a, b);
  assert.equal(await Spotify.challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', webcrypto), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('authorize URL: code flow with S256, the exact redirect URI, the documented scopes and no secret', () => {
  const url = new URL(Spotify.authorizeUrl({ clientId: ID, redirectUri: 'http://127.0.0.1:8765/spotify-callback.html', challenge: 'CHAL', state: 'STATE' })), q = url.searchParams;
  assert.equal(url.origin + url.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(q.get('response_type'), 'code'); assert.equal(q.get('client_id'), ID); assert.equal(q.get('redirect_uri'), 'http://127.0.0.1:8765/spotify-callback.html');
  assert.equal(q.get('code_challenge_method'), 'S256'); assert.equal(q.get('code_challenge'), 'CHAL'); assert.equal(q.get('state'), 'STATE');
  assert.deepEqual(q.get('scope').split(' ').sort(), ['streaming', 'user-modify-playback-state', 'user-read-email', 'user-read-private']);
  assert.ok(!url.search.includes('secret')); assert.ok(!q.has('show_dialog'));
});

test('redirect rules: https or http://127.0.0.1 only; localhost and other http addresses get a plain explanation', () => {
  for (const ok of ['http://127.0.0.1:8765/spotify-callback.html', 'http://127.0.0.1:18765/spotify-callback.html', 'http://[::1]:8765/x', 'https://game.example/spotify-callback.html'])assert.equal(Spotify.redirectProblem(ok), '', ok);
  assert.match(Spotify.redirectProblem('http://localhost:8765/spotify-callback.html'), /does not accept "localhost".*http:\/\/127\.0\.0\.1:8765/);
  assert.match(Spotify.redirectProblem('http://192.168.1.4:8765/'), /only accepts https addresses or http:\/\/127\.0\.0\.1/);
  assert.match(Spotify.redirectProblem('file:///G:/starfighter/index.html'), /web address/); assert.match(Spotify.redirectProblem(''), /web address/);
});

test('Client IDs are 32 hex characters; links accept only real Spotify playlist, album, artist and song addresses', () => {
  assert.ok(Spotify.validClientId(ID)); assert.ok(Spotify.validClientId(' ' + ID.toUpperCase() + ' '));
  for (const bad of ['', 'abc', ID + '0', ID.slice(1) + 'g', null, undefined])assert.equal(Spotify.validClientId(bad), false);
  const ok = Spotify.parseLink(`https://open.spotify.com/intl-de/playlist/${PLAYLIST}?si=abc`);
  assert.deepEqual(ok.body, { context_uri: `spotify:playlist:${PLAYLIST}` });
  assert.deepEqual(Spotify.parseLink(`https://open.spotify.com/track/${TRACK}`).body, { uris: [`spotify:track:${TRACK}`] });
  assert.equal(Spotify.parseLink(`spotify:album:${PLAYLIST}`).kind, 'album'); assert.equal(Spotify.parseLink(`https://open.spotify.com/embed/artist/${TRACK}`).kind, 'artist');
  for (const bad of ['', 'hello', 'javascript:alert(1)', `http://open.spotify.com/track/${TRACK}`, `https://open.spotify.com.evil.example/track/${TRACK}`, `https://evil.example/open.spotify.com/track/${TRACK}`,
    `https://open.spotify.com/track/short`, `https://open.spotify.com/episode/${TRACK}`, `spotify:track:short`, `https://open.spotify.com/track/${TRACK}`.padEnd(400, 'x'), 42, null])assert.equal(Spotify.parseLink(bad), null, String(bad));
});

test('track details keep only Spotify-hosted artwork and real song ids', () => {
  const t = Spotify.cleanTrack({ id: TRACK, name: 'N', artists: [{ name: 'A' }, { name: 'B' }], album: { name: 'Al', images: [{ url: 'https://evil.example/x.png', width: 64 }, { url: 'http://i.scdn.co/x.png', width: 64 }, { url: 'https://i.scdn.co/big', width: 640 }, { url: 'https://i.scdn.co/mid', width: 300 }] } });
  assert.equal(t.artist, 'A, B'); assert.equal(t.image, 'https://i.scdn.co/mid'); assert.equal(t.url, `https://open.spotify.com/track/${TRACK}`);
  assert.equal(Spotify.cleanTrack({ id: 'bad id', name: 'x', album: { images: [{ url: 'javascript:1' }] } }).url, ''); assert.equal(Spotify.cleanTrack({ id: 'x', name: 'x', album: { images: [{ url: 'javascript:1' }] } }).image, '');
  assert.equal(Spotify.cleanTrack(null), null);
});

test('sign-in needs an app ID and a loopback or https page before it opens anything', async () => {
  let r = rig(); assert.equal(r.ctl.connect(), false); assert.match(message(r), /Paste the Client ID/); assert.equal(r.opened.length, 0);
  r.ctl.setClientId('not-an-id'); assert.match(message(r), /does not look like a Client ID/); assert.equal(r.ctl.connect(), false); assert.match(message(r), /Paste the Client ID/); assert.equal(r.opened.length, 0);
  r = rig({ window: { location: { href: 'http://localhost:8765/index.html', origin: 'http://localhost:8765' } } }); r.ctl.setClientId(ID);
  assert.equal(r.ctl.connect(), false); assert.match(message(r), /does not accept "localhost"/); assert.equal(r.opened.length, 0); assert.equal(r.fetch.calls.length, 0);
});

test('sign-in popup: opens synchronously from the click, sends the PKCE request, and finishes only for the matching state', async () => {
  const r = rig(); r.ctl.setClientId(ID);
  assert.equal(r.ctl.connect(), true); assert.equal(r.opened.length, 1, 'The popup must open before any await so the browser allows it');
  assert.equal(r.ctl.status, 'waiting'); assert.equal(r.fetch.calls.length, 0, 'Nothing is requested until Spotify answers');
  await flush();
  const popup = r.opened[0], auth = new URL(popup.location.href), state = auth.searchParams.get('state');
  assert.equal(auth.origin + auth.pathname, 'https://accounts.spotify.com/authorize'); assert.equal(auth.searchParams.get('redirect_uri'), 'http://127.0.0.1:8765/spotify-callback.html');
  const sender = new r.Channel('starfighter-spotify');
  sender.postMessage({ type: 'starfighter-spotify-callback', code: 'FORGED', state: 'WRONG' }); sender.postMessage({ type: 'other', code: 'X', state }); sender.postMessage(null); sender.postMessage('text');
  await flush(); assert.equal(r.fetch.calls.length, 0, 'A message with the wrong state or type is ignored'); assert.equal(r.ctl.status, 'waiting');
  sender.postMessage({ type: 'starfighter-spotify-callback', code: 'CODE-1', state });
  await flush();
  const token = r.fetch.calls[0], body = new URLSearchParams(token.body);
  assert.equal(token.url, 'https://accounts.spotify.com/api/token'); assert.equal(token.method, 'POST'); assert.equal(token.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(body.get('grant_type'), 'authorization_code'); assert.equal(body.get('code'), 'CODE-1'); assert.equal(body.get('client_id'), ID);
  assert.equal(body.get('redirect_uri'), 'http://127.0.0.1:8765/spotify-callback.html'); assert.match(body.get('code_verifier'), /^[A-Za-z0-9_-]{64}$/);
  assert.equal(await Spotify.challengeFor(body.get('code_verifier'), webcrypto), auth.searchParams.get('code_challenge'), 'The verifier matches the challenge that was sent');
  assert.ok(!token.body.includes('secret')); assert.equal(popup.closed, true);
  assert.equal(r.storage.map.get('starfighterSpotifyOn'), '1'); assert.equal(JSON.parse(r.storage.map.get('starfighterSpotify')).refresh, 'REFRESH-2');
  const everything = JSON.stringify([...r.storage.map]) + JSON.stringify(r.ctl.snapshot());
  assert.ok(!everything.includes('ACCESS-1'), 'The access token lives in memory only'); assert.ok(!JSON.stringify(r.ctl.snapshot()).includes('REFRESH'), 'No token ever appears in the public state');
  r.sdk.players[0].emit('ready', { device_id: 'DEV' }); assert.equal(r.ctl.status, 'ready'); assert.equal(r.ctl.takesMusic, false, 'Connected but not playing leaves the game soundtrack alone');
});

test('sign-in popup: a callback delivered by opener message or storage event works, and listeners are removed afterwards', async () => {
  for (const route of ['message', 'storage']) {
    const r = rig(); r.ctl.setClientId(ID); r.ctl.connect(); await flush();
    const state = new URL(r.opened[0].location.href).searchParams.get('state'), msg = { type: 'starfighter-spotify-callback', code: 'C', state };
    if (route === 'message') { r.win.dispatch('message', { origin: 'https://evil.example', data: msg }); await flush(); assert.equal(r.fetch.calls.length, 0, 'Messages from other origins are ignored'); r.win.dispatch('message', { origin: r.win.location.origin, data: msg }); }
    else r.win.dispatch('storage', { key: 'starfighterSpotifyCallback', newValue: JSON.stringify(msg) });
    await flush(); assert.equal(r.fetch.calls[0].url, 'https://accounts.spotify.com/api/token', route);
    assert.equal((r.listeners.message || []).length + (r.listeners.storage || []).length, 0, 'Sign-in listeners are removed');
  }
});

test('sign-in can be cancelled, declined, blocked, or time out without side effects', async () => {
  let r = rig(); r.ctl.setClientId(ID); r.ctl.connect(); await flush(); r.ctl.cancel();
  assert.equal(r.ctl.status, 'idle'); assert.equal(r.opened[0].closed, true); assert.match(message(r), /cancelled/);
  let r2 = rig(); r2.ctl.setClientId(ID); r2.ctl.connect(); await flush();
  new r2.Channel('starfighter-spotify').postMessage({ type: 'starfighter-spotify-callback', state: new URL(r2.opened[0].location.href).searchParams.get('state'), error: 'access_denied' });
  assert.match(message(r2), /cancelled/); assert.equal(r2.fetch.calls.length, 0); assert.equal(r2.storage.map.has('starfighterSpotifyOn'), false);
  r = rig({ window: { blockPopups: true } }); r.ctl.setClientId(ID);
  assert.equal(r.ctl.connect(), false); assert.match(message(r), /blocked the Spotify window/); assert.equal(r.ctl.status, 'idle');
  r = rig(); r.ctl.setClientId(ID); r.ctl.connect(); await flush(); r.timers.fire(300000);
  assert.match(message(r), /timed out/); assert.equal(r.opened[0].closed, true);
  const late = new URL(r.opened[0].location.href).searchParams.get('state'); new r.Channel('starfighter-spotify').postMessage({ type: 'starfighter-spotify-callback', code: 'LATE', state: late });
  await flush(); assert.equal(r.fetch.calls.length, 0, 'A late answer after the timeout is ignored');
});

test('failed sign-in exchanges explain the likely cause and keep no token', async () => {
  const cases = [[{ status: 400, body: { error: 'invalid_client' } }, /does not recognise that Client ID/], [{ status: 400, body: { error: 'invalid_grant' } }, /Redirect URI shown here/], [{ status: 500, body: {} }, /error 500/], [new Error('offline'), /Cannot reach Spotify/]];
  for (const [answer, pattern] of cases) {
    const r = rig({ fetch: fakeFetch(() => answer) }); r.ctl.setClientId(ID); r.ctl.connect(); await flush();
    new r.Channel('starfighter-spotify').postMessage({ type: 'starfighter-spotify-callback', code: 'C', state: new URL(r.opened[0].location.href).searchParams.get('state') }); await flush();
    assert.match(message(r), pattern); assert.equal(r.ctl.signedIn, false); assert.equal(r.storage.map.has('starfighterSpotifyOn'), false); assert.equal(r.ctl.takesMusic, false);
  }
});

test('the SDK script is fetched only after sign-in, from Spotify, once; a missing or blocked SDK is explained kindly', async () => {
  let r = rig({ stored: SIGNED, sdk: false }); assert.equal(r.doc.appended.length, 0);
  r.ctl.restore(); await flush();
  assert.equal(r.doc.appended.length, 1); assert.equal(r.doc.appended[0].src, 'https://sdk.scdn.co/spotify-player.js');
  r.win.Spotify = { Player: r.sdk.Player }; r.win.onSpotifyWebPlaybackSDKReady(); await flush();
  assert.equal(r.sdk.players.length, 1); assert.equal(r.sdk.players[0].options.name, 'Starfighter: Last Signal'); assert.equal(r.doc.appended.length, 1);
  r = rig({ stored: SIGNED, sdk: false }); r.ctl.restore(); await flush(); r.doc.appended[0].onerror(); await flush();
  assert.equal(r.ctl.status, 'problem'); assert.match(message(r), /Could not load Spotify's player.*game music keeps playing/); assert.equal(r.ctl.takesMusic, false);
  r = rig({ stored: SIGNED, sdk: false }); r.ctl.restore(); await flush(); r.timers.fire(15000); await flush();
  assert.match(message(r), /Could not load Spotify's player/);
  r.ctl.connect(); await flush(); assert.equal(r.doc.appended.length, 2, 'A retry loads the script again');
});

test('restoring after an earlier sign-in refreshes quietly and handles offline, rotation and revoked tokens', async () => {
  let r = rig({ stored: SIGNED }); r.ctl.restore(); await flush();
  const refresh = new URLSearchParams(r.fetch.calls[0].body);
  assert.equal(refresh.get('grant_type'), 'refresh_token'); assert.equal(refresh.get('refresh_token'), 'REFRESH-1'); assert.equal(refresh.get('client_id'), ID); assert.ok(!r.fetch.calls[0].body.includes('secret'));
  assert.equal(JSON.parse(r.storage.map.get('starfighterSpotify')).refresh, 'REFRESH-2', 'A rotated refresh token is stored');
  r = rig({ stored: SIGNED, fetch: fakeFetch(() => tokenAnswer({ refresh_token: undefined })) }); r.ctl.restore(); await flush();
  assert.equal(JSON.parse(r.storage.map.get('starfighterSpotify')).refresh, 'REFRESH-1', 'The old refresh token is kept when none is returned');
  r = rig({ stored: SIGNED, fetch: fakeFetch(() => new Error('network down')) }); r.ctl.restore(); await flush();
  assert.equal(r.ctl.status, 'problem'); assert.match(message(r), /Cannot reach Spotify/); assert.equal(r.ctl.takesMusic, false); assert.equal(r.ctl.signedIn, true, 'Offline never signs the player out');
  r = rig({ stored: SIGNED, fetch: fakeFetch(() => ({ status: 400, body: { error: 'invalid_grant' } })) }); r.ctl.restore(); await flush();
  assert.equal(r.ctl.status, 'idle'); assert.match(message(r), /sign-in expired/); assert.equal(r.ctl.signedIn, false); assert.equal(r.storage.map.has('starfighterSpotifyOn'), false);
  assert.equal(JSON.parse(r.storage.map.get('starfighterSpotify')).refresh, '', 'A rejected refresh token is deleted'); assert.equal(r.sdk.players.length, 0);
});

test('the game soundtrack yields only while Spotify really plays, and steps back after a short debounce', async () => {
  const r = await ready(), { player, ctl, timers } = r;
  assert.equal(ctl.status, 'ready'); assert.equal(ctl.takesMusic, false);
  player.emit('player_state_changed', song(false)); assert.equal(ctl.takesMusic, true, 'Yields at once'); assert.equal(ctl.status, 'playing');
  assert.equal(ctl.snapshot().track.name, 'Test Song'); assert.equal(ctl.snapshot().track.url, `https://open.spotify.com/track/${TRACK}`);
  player.emit('player_state_changed', song(true)); assert.equal(ctl.takesMusic, true, 'A brief pause (track change) does not hand music back yet');
  player.emit('player_state_changed', song(false)); timers.fire(1500); assert.equal(ctl.takesMusic, true, 'Resuming inside the debounce keeps Spotify in charge');
  player.emit('player_state_changed', song(true)); timers.fire(1500);
  assert.equal(ctl.takesMusic, false); assert.equal(ctl.status, 'paused'); assert.equal(r.changes.at(-1).takesMusic, false, 'The game is told');
  player.emit('player_state_changed', null); assert.equal(ctl.takesMusic, false);
});

test('a lost player hands music back immediately and reconnects a few times before giving up', async () => {
  const r = await ready(), { player, ctl, timers } = r; player.emit('player_state_changed', song(false));
  player.emit('not_ready', { device_id: 'DEV' }); assert.equal(ctl.takesMusic, false); assert.match(message(r), /connection dropped/);
  timers.fire(2000); assert.equal(player.calls.filter(c => c === 'connect').length, 2); player.emit('ready', { device_id: 'DEV2' }); assert.equal(ctl.status, 'ready');
  for (const wait of [2000, 5000, 12000]) { player.emit('not_ready', {}); timers.fire(wait); }
  player.emit('not_ready', {}); assert.equal(ctl.status, 'problem'); assert.match(message(r), /game music is back/); assert.ok(player.calls.includes('disconnect'));
});

test('Spotify errors become plain messages and always leave the game music alone', async () => {
  for (const [event, pattern] of [['initialization_error', /Microsoft Edge or Google Chrome/], ['account_error', /Premium/]]) {
    const r = await ready(); r.player.emit('player_state_changed', song(false)); r.player.emit(event, { message: 'x' });
    assert.equal(r.ctl.status, 'problem'); assert.match(message(r), pattern); assert.equal(r.ctl.takesMusic, false); assert.ok(r.player.calls.includes('disconnect'));
  }
  let r = await ready(); r.player.emit('playback_error', {}); assert.equal(r.ctl.status, 'ready'); assert.match(message(r), /could not play that track/);
  r.player.emit('autoplay_failed'); assert.match(message(r), /Press PLAY/);
  r = await ready(); const before = r.fetch.calls.length; r.player.emit('authentication_error', {}); await flush();
  assert.ok(r.fetch.calls.length > before, 'First authentication error refreshes the token and reconnects'); assert.equal(r.player.calls.filter(c => c === 'connect').length, 2);
  r.player.emit('authentication_error', {}); await flush(); assert.equal(r.ctl.status, 'idle'); assert.match(message(r), /sign-in expired/); assert.equal(r.ctl.takesMusic, false);
  const refused = rig({ stored: SIGNED }); refused.sdk.state.connectResult = false; refused.ctl.restore(); await flush();
  assert.equal(refused.ctl.status, 'problem'); assert.match(message(refused), /Premium and is listed under Users Management/);
});

test('MUSIC volume and SOUND mute drive the Spotify player, with throttling that still sends the last value', async () => {
  const r = await ready(), { player, ctl, timers, clock } = r;
  assert.deepEqual(volumes(player), [.3], 'The saved MUSIC level is applied when the player is ready');
  ctl.setLevel(.5, false); assert.deepEqual(volumes(player), [.3], 'Rapid changes are held back'); ctl.setLevel(.6, false); clock.t += 150; timers.fire(); assert.deepEqual(volumes(player), [.3, .6], 'The last value wins');
  clock.t += 500; ctl.setLevel(.6, true); assert.deepEqual(volumes(player).at(-1), 0, 'SOUND: OFF silences Spotify too');
  clock.t += 500; ctl.setLevel(.6, false); assert.equal(volumes(player).at(-1), .6);
  clock.t += 500; ctl.setLevel(.6, false); assert.equal(volumes(player).length, 4, 'An unchanged level sends nothing'); ctl.setLevel(7, false); assert.ok(Math.max(...volumes(player)) <= 1);
});

test('hidden page or Flight School pauses Spotify and resumes only what it paused', async () => {
  let r = await ready(); r.player.emit('player_state_changed', song(false));
  r.ctl.setAway(true); assert.ok(r.player.calls.includes('pause')); r.player.emit('player_state_changed', song(true)); assert.equal(r.ctl.takesMusic, true, 'An automatic pause is not a hand-back'); r.timers.fire(1500); assert.equal(r.ctl.takesMusic, true);
  r.ctl.setAway(false); assert.ok(r.player.calls.includes('resume'));
  r = await ready(); r.player.emit('player_state_changed', song(true)); r.ctl.setAway(true); r.ctl.setAway(false);
  assert.ok(!r.player.calls.includes('pause') && !r.player.calls.includes('resume'), 'A player the user already paused is left alone');
  r = await ready(); r.player.emit('player_state_changed', song(false)); r.ctl.setAway(true); assert.equal(r.ctl.toggle(), false, 'Controls do nothing while the game has it paused');
});

test('PLAY LINK and PLAY MY SPOTIFY HERE call the documented endpoints with the player device', async () => {
  const r = await ready(); r.fetch.calls.length = 0;
  assert.equal(await r.ctl.playLink('nonsense'), false); assert.match(message(r), /not a Spotify playlist, album, artist or song link/); assert.equal(r.fetch.calls.length, 0);
  assert.equal(await r.ctl.playLink(`https://open.spotify.com/playlist/${PLAYLIST}`), true);
  const play = r.fetch.calls[0]; assert.equal(play.method, 'PUT'); assert.equal(play.url, 'https://api.spotify.com/v1/me/player/play?device_id=DEV');
  assert.equal(play.headers.Authorization, 'Bearer ACCESS-1'); assert.deepEqual(JSON.parse(play.body), { context_uri: `spotify:playlist:${PLAYLIST}` }); assert.ok(r.player.calls.includes('activateElement'));
  await r.ctl.playLink(`https://open.spotify.com/track/${TRACK}`); assert.deepEqual(JSON.parse(r.fetch.calls[1].body), { uris: [`spotify:track:${TRACK}`] });
  await r.ctl.bringHere(); const bring = r.fetch.calls[2]; assert.equal(bring.url, 'https://api.spotify.com/v1/me/player'); assert.equal(bring.method, 'PUT'); assert.deepEqual(JSON.parse(bring.body), { device_ids: ['DEV'], play: true });
  assert.equal(await rig().ctl.playLink(`https://open.spotify.com/track/${TRACK}`), false);
});

test('playback request failures: expired access retries once; 403, 404, 429, offline and a revoked sign-in each get their own message', async () => {
  const link = `https://open.spotify.com/playlist/${PLAYLIST}`;
  let plays = 0; let r = await ready({ fetch: fakeFetch(call => call.url.includes('/api/token') ? tokenAnswer({ access_token: 'ACCESS-2' }) : (++plays === 1 ? { status: 401 } : { status: 204 })) });
  assert.equal(await r.ctl.playLink(link), true); assert.equal(r.fetch.calls.filter(c => c.url.includes('/me/player/play')).length, 2);
  assert.equal(r.fetch.calls.filter(c => c.url.includes('/me/player/play')).at(-1).headers.Authorization, 'Bearer ACCESS-2');
  for (const [answer, pattern] of [[{ status: 403 }, /Premium and listed under Users Management/], [{ status: 404, body: { error: { reason: 'NO_ACTIVE_DEVICE' } } }, /nothing playing/], [{ status: 404 }, /could not find that/], [{ status: 429 }, /too many requests/], [{ status: 500 }, /error \(500\)/], [new Error('down'), /Cannot reach Spotify/]]) {
    r = await ready({ fetch: fakeFetch(call => call.url.includes('/api/token') ? tokenAnswer() : answer) });
    assert.equal(await r.ctl.playLink(link), false); assert.match(message(r), pattern); assert.notEqual(r.ctl.status, 'problem', 'A refused request does not tear the player down');
  }
  let revoked = false; r = await ready({ fetch: fakeFetch(call => call.url.includes('/api/token') ? (revoked ? { status: 400, body: { error: 'invalid_grant' } } : tokenAnswer()) : { status: 401 }) });
  revoked = true; r.clock.t += 7200000; assert.equal(await r.ctl.bringHere(), false); assert.equal(r.ctl.status, 'idle'); assert.match(message(r), /sign-in expired/);
});

test('transport buttons control the player; nothing happens before it is ready', async () => {
  const idle = rig(); assert.equal(idle.ctl.toggle(), false); assert.equal(idle.ctl.next(), false); assert.equal(idle.ctl.previous(), false);
  const r = await ready(); assert.equal(r.ctl.toggle(), true); r.ctl.next(); r.ctl.previous();
  assert.deepEqual(r.player.calls.filter(c => ['togglePlay', 'nextTrack', 'previousTrack'].includes(c)), ['togglePlay', 'nextTrack', 'previousTrack']);
});

test('disconnect removes the sign-in from this computer, stops the player and returns the music to the game', async () => {
  const r = await ready(); r.player.emit('player_state_changed', song(false)); assert.equal(r.ctl.takesMusic, true);
  r.ctl.disconnect(); assert.equal(r.ctl.takesMusic, false); assert.equal(r.ctl.signedIn, false); assert.ok(r.player.calls.includes('disconnect')); assert.equal(r.ctl.status, 'idle');
  const text = JSON.stringify([...r.storage.map]); assert.ok(!text.includes('REFRESH') && !text.includes('ACCESS'), 'No token remains'); assert.equal(r.storage.map.has('starfighterSpotifyOn'), false);
  assert.equal(r.ctl.snapshot().track, null); assert.match(message(r), /sign-in was removed from this computer/);
  assert.equal(JSON.parse(r.storage.map.get('starfighterSpotify')).clientId, ID, 'The public app ID is kept for convenience');
});

test('changing the app ID signs out the old app; the ID is checked and saved', async () => {
  const r = await ready(); r.ctl.setClientId('fedcba9876543210fedcba9876543210');
  assert.equal(r.ctl.signedIn, false); assert.equal(r.storage.map.has('starfighterSpotifyOn'), false); assert.equal(JSON.parse(r.storage.map.get('starfighterSpotify')).clientId, 'fedcba9876543210fedcba9876543210');
  r.ctl.setClientId('typo'); assert.match(message(r), /does not look like a Client ID/); assert.equal(JSON.parse(r.storage.map.get('starfighterSpotify')).clientId, '');
});

test('buttons: connect, cancel, copy address and play link are wired and the page reflects each state', async () => {
  const r = rig(); assert.equal(r.ctl.bind(r.doc), true); assert.equal(r.ctl.bind(r.doc), true);
  const el = id => r.doc.getElementById('spotify-' + id);
  assert.equal(el('redirect').textContent, 'http://127.0.0.1:8765/spotify-callback.html'); assert.equal(el('player').hidden, true); assert.equal(el('mini').hidden, true); assert.equal(el('connect').textContent, 'CONNECT SPOTIFY');
  el('connect').click(); assert.match(el('status').textContent, /Paste the Client ID/);
  el('client-id').value = ID; for (const fn of el('client-id').handlers.change) fn({}); el('connect').click(); assert.equal(el('connect').textContent, 'CANCEL SIGN-IN'); assert.equal(r.opened.length, 1);
  el('connect').click(); assert.equal(el('connect').textContent, 'CONNECT SPOTIFY'); assert.equal(r.opened[0].closed, true);
  el('copy').click(); await flush(); assert.equal(r.win.copied, 'http://127.0.0.1:8765/spotify-callback.html'); assert.match(el('status').textContent, /copied/i);
  const g = await ready(); g.ctl.bind(g.doc); const e = id => g.doc.getElementById('spotify-' + id);
  g.player.emit('player_state_changed', song(false)); assert.equal(e('player').hidden, false); assert.equal(e('mini').hidden, false); assert.equal(e('connect').textContent, 'CONNECTED'); assert.equal(e('disconnect').hidden, false);
  assert.equal(e('title').textContent, 'Test Song'); assert.equal(e('mini-title').textContent, 'Test Song — Test Artist'); assert.equal(e('art').src, 'https://i.scdn.co/image/abc'); assert.equal(e('open').href, `https://open.spotify.com/track/${TRACK}`); assert.equal(e('toggle').textContent, 'PAUSE');
  g.fetch.calls.length = 0; e('link').value = `https://open.spotify.com/album/${PLAYLIST}`; e('play-link').click(); await flush(); assert.match(g.fetch.calls[0].url, /\/me\/player\/play\?device_id=DEV/);
  e('mini-next').click(); assert.ok(g.player.calls.includes('nextTrack')); e('disconnect').click(); assert.equal(e('player').hidden, true);
});

test('an app ID typed before the module loads still counts, and COPY works from the first press', async () => {
  const r = rig(), el = id => r.doc.getElementById('spotify-' + id);
  el('client-id').value = '  ' + ID + '  '; assert.equal(r.ctl.bind(r.doc), true);
  assert.equal(el('client-id').value.trim(), ID, 'The typed ID is kept, not overwritten by the empty saved one');
  assert.equal(r.ctl.connect(), true); assert.equal(r.opened.length, 1, 'CONNECT works straight after the first load, with no second press');
  const typo = rig(), field = typo.doc.getElementById('spotify-client-id'); field.value = 'abc'; typo.ctl.bind(typo.doc);
  assert.equal(field.value, 'abc', 'A mistyped ID is left in the box for the player to fix'); assert.match(typo.doc.getElementById('spotify-status').textContent, /does not look like a Client ID/);
  await r.ctl.copyRedirect(); assert.equal(r.win.copied, 'http://127.0.0.1:8765/spotify-callback.html');
});

test('the callback page relays only code, state and a cleaned error, removes them from the address bar, and closes itself', () => {
  const html = read('spotify-callback.html'), script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.ok(!/innerHTML|document\.write|eval\(/.test(script), 'Only textContent is used'); assert.ok(!/<script[^>]+src=|<link/i.test(html), 'The page loads nothing');
  const run = (search, { opener = true, channel = true } = {}) => {
    const sent = { channel: [], opener: [], stored: [], url: [], closed: 0, text: '' }, timeouts = [];
    vm.runInNewContext(script, { URLSearchParams, location: { search, pathname: '/spotify-callback.html', origin: 'http://127.0.0.1:8765' }, history: { replaceState: (a, b, url) => sent.url.push(url) },
      BroadcastChannel: channel ? class { postMessage(m) { sent.channel.push(m); } close() {} } : undefined, window: { opener: opener ? { postMessage: (m, origin) => sent.opener.push([m, origin]) } : null, close: () => sent.closed++ },
      localStorage: { setItem: (k, v) => sent.stored.push([k, v]), removeItem() {} }, document: { getElementById: () => ({ set textContent(v) { sent.text = v; } }) }, setTimeout: fn => timeouts.push(fn) });
    timeouts.forEach(fn => fn()); return sent;
  };
  let s = run('?code=AQD123&state=abc-DEF_1'); assert.deepEqual({ ...s.channel[0] }, { type: 'starfighter-spotify-callback', code: 'AQD123', state: 'abc-DEF_1', error: '' });
  assert.equal(s.opener[0][1], 'http://127.0.0.1:8765', 'The opener message is restricted to this origin'); assert.equal(s.stored[0][0], 'starfighterSpotifyCallback'); assert.deepEqual(s.url, ['/spotify-callback.html']); assert.equal(s.closed, 1);
  s = run('?error=access_denied%3Cb%3E&state=x'); assert.ok(!/[<>%]/.test(s.channel[0].error) && s.channel[0].error.startsWith('access_denied'), 'Markup characters are stripped from the error'); assert.match(s.text, /not completed/);
  s = run('?code=' + 'x'.repeat(5000) + '&state=' + 'y'.repeat(500)); assert.equal(s.channel[0].code.length, 2048); assert.equal(s.channel[0].state.length, 128);
  s = run('?code=A&state=B', { opener: false, channel: false }); assert.equal(s.stored.length, 1, 'Storage is the fallback route');
});

test('the performance log never records Spotify errors, tokens or settings', async () => {
  const r = await ready(), store = r.storage, listeners = {};
  const win = { performance: {}, navigator: { userAgent: 'x' }, screen: {}, addEventListener(type, fn) { (listeners[type] ||= []).push(fn); } };
  const diag = Diagnostics.create({ window: win, storage: store, now: () => 1000, version: 'v171' }); diag.setEnabled(true);
  r.player.emit('player_state_changed', song(false));
  for (const event of [{ message: 'Spotify SDK failed: ACCESS-1' }, { filename: 'https://sdk.scdn.co/spotify-player.js', message: 'Script error.' }, { reason: { message: 'fetch https://api.spotify.com/v1/me/player failed' } }, { reason: 'spotify refused' }])for (const fn of listeners.error || []) fn(event);
  for (const fn of listeners.unhandledrejection || []) fn({ reason: new Error('Spotify rejected REFRESH-1') });
  for (const fn of listeners.error || []) fn({ message: 'a real game error' });
  const snap = diag.snapshot(), text = diag.exportText();
  assert.equal(snap.sessions.at(-1).errorCount, 1, 'Only the real game error is counted'); assert.equal(snap.sessions.at(-1).errors[0].message, 'a real game error');
  for (const word of ['spotify', 'scdn', 'REFRESH', 'ACCESS', ID])assert.ok(!text.toLowerCase().includes(word.toLowerCase()), 'Export must not contain ' + word);
  const diagSource = read('diagnostics.js'); assert.ok(!/starfighterSpotify/.test(diagSource), 'The log module never reads Spotify storage');
  assert.ok(!Object.values(Diagnostics.keys).some(k => /spotify/i.test(k)));
});

test('shipping files: Spotify hosts appear only in spotify.js and its callback page; nothing loads Spotify at page start', () => {
  const offenders = [];
  for (const file of fs.readdirSync(root).filter(f => /\.(js|html|css)$/.test(f) && !['spotify.js', 'spotify-callback.html'].includes(f)))
    if (/sdk\.scdn\.co|accounts\.spotify\.com|api\.spotify\.com/.test(read(file))) offenders.push(file);
  assert.deepEqual(offenders, [], 'Only spotify.js may know Spotify addresses');
  for (const file of ['index.html', 'flight-school.html']) { const html = read(file); assert.ok(!/<script[^>]+(spotify|scdn)/i.test(html), file + ' must not load Spotify at start'); assert.ok(!/<link[^>]+spotify/i.test(html)); assert.equal((html.match(/<!-- spotify:start -->/g) || []).length, 2); assert.equal((html.match(/<!-- spotify:end -->/g) || []).length, 2); }
  const game = read('game.js'); assert.ok(!/sdk\.scdn\.co|accounts\.spotify\.com|api\.spotify\.com/.test(game)); assert.match(game, /script\.src='spotify\.js'\+tag/);
  assert.ok(!/spotify/i.test(game.match(/diagnostics\.setSettings\([\s\S]*?\)\);/)[0]), 'The performance log settings never mention Spotify');
});

test('every control the module looks for exists in the Flight Manual or AUDIO MIX markup', () => {
  const wanted = new Set(), doc = { getElementById(id) { wanted.add(id); return null; } };
  Spotify.create({ window: makeWindow().win, document: doc, storage: mockStorage(), timers: fakeTimers() }).bind(doc);
  const html = read('index.html'); assert.ok(wanted.size >= 20);
  for (const id of wanted) assert.ok(new RegExp(`id="${id}"`).test(html), `index.html needs #${id}`);
  assert.equal(read('flight-school.html').includes('id="spotify-group"'), true, 'The practice page is built from the same markup and hides it');
});

test('Windows playtest builds leave Spotify out unless asked with --with-spotify', () => {
  const build = read('tools/build-windows-playtest.py'), entry = build.match(/^entry=\[(.*?)\]$/m)[1];
  assert.ok(!/spotify/i.test(entry), 'The default file list has no Spotify files'); assert.match(build, /--with-spotify/);
  assert.ok(fs.existsSync(path.join(root, 'tools', 'spotify_strip.py')));
});

test('no promise rejection escaped any test', async () => { await flush(); assert.deepEqual(unhandled.map(String), []); });

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
  }
  console.log(`${tests.length - failed} Spotify checks passed, ${failed} failed`);
  console.log('Scope: mocked window, storage, fetch and Spotify player. A real sign-in, real audio and the EXE browser need a human check (see SPOTIFY.md).');
  process.exit(failed ? 1 : 0);
})();
