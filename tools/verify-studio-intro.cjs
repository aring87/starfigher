#!/usr/bin/env node
'use strict';
// Contract tests for the One Ring Productions card (studio-intro.js) and how the shipped files wire it.
// Mock window, document, canvas, audio and clock only. How it LOOKS and SOUNDS needs a human (see the notes at the end).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const Intro = require(path.join(root, 'studio-intro.js'));
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const T = Intro.timeline;
const tests = [], unhandled = [];
const test = (name, fn) => tests.push({ name, fn });
process.on('unhandledRejection', error => unhandled.push(error));
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };

// A canvas context that records every call and every number it is given.
function recordingContext() {
  const calls = [], gradients = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key === 'calls') return calls;
      if (key === 'createRadialGradient') return (...args) => { calls.push([key, ...args]); const g = { stops: [], addColorStop(offset, color) { g.stops.push([offset, color]); calls.push(['addColorStop', offset, color]); } }; gradients.push(g); return g; };
      if (key in target) return target[key];
      return (...args) => { calls.push([String(key), ...args]); };
    },
    set(target, key, value) { target[key] = value; calls.push(['set:' + String(key), value]); return true; },
  });
  return ctx;
}
const numbersIn = calls => calls.flatMap(call => call.slice(1).filter(v => typeof v === 'number'));
const RING = { width: 1254, height: 1254 }, WORD = { width: 2172, height: 724 }, images = { ring: RING, word: WORD };
const drawAt = (scene, t, extra) => { scene.t = t; const ctx = recordingContext(); scene.draw(ctx, images); return ctx; };
const drawImageCalls = ctx => ctx.calls.filter(c => c[0] === 'drawImage');

test('timeline: the ring spins three turns, eases to a stop facing front, and the card fades by 6.2 s', () => {
  assert.equal(Intro.spin(0), 0); assert.equal(Intro.spin(T.STREAK_END - .5), 0);
  assert.ok(Math.abs(Intro.spin(T.SETTLE) - Math.PI * 6) < 1e-9); assert.ok(Math.abs(Math.cos(Intro.spin(T.SETTLE)) - 1) < 1e-9, 'Faces front when it settles');
  let previous = -1, step = 0; for (let t = 0; t <= 4; t += .01) { const s = Intro.spin(t); assert.ok(s >= previous - 1e-12, 'Spin never runs backwards'); step = s - previous; previous = s; }
  assert.ok(Intro.spin(T.SETTLE) - Intro.spin(T.SETTLE - .05) < .6, 'It is nearly still at the end (ease-out)');
  assert.equal(Intro.ringAlpha(1.2), 0); assert.equal(Intro.ringAlpha(T.STREAK_END), 1);
  assert.equal(Intro.nameAlpha(T.NAME_IN), 0); assert.equal(Intro.nameAlpha(T.NAME_FULL), 1); assert.ok(Intro.nameAlpha(3.8) > 0 && Intro.nameAlpha(3.8) < 1);
  assert.equal(Intro.fadeOut(T.OUT), 1); assert.ok(Intro.fadeOut(T.DONE - .1) < 1e-9); assert.ok(T.DONE > T.OUT && T.DONE < 7, 'About six seconds');
});

test('scene: the same seed gives the same sparks, and the spark count does not depend on the display refresh rate', () => {
  const run = hz => { const scene = Intro.createScene(); let samples = []; for (let t = 0; t < T.SETTLE - .05; t += 1 / hz) { scene.step(1 / hz); if (t > 2.3 && t < 2.35) samples.push(scene.sparks); } return { scene, count: scene.sparks }; };
  const a = run(60), b = run(60); assert.equal(a.count, b.count); assert.ok(a.count > 100, 'A busy swirl of sparks before the ring settles');
  const fast = run(144), slow = run(30); assert.ok(Math.abs(fast.count - a.count) / a.count < .2, `144 Hz ${fast.count} vs 60 Hz ${a.count}`); assert.ok(Math.abs(slow.count - a.count) / a.count < .2, `30 Hz ${slow.count} vs 60 Hz ${a.count}`);
  const burst = Intro.createScene(); for (let i = 0; i < Math.round((T.SETTLE + .02) * 60); i++) burst.step(1 / 60); assert.ok(burst.puffs >= 10, 'A puff of dust settles with the ring');
  const done = Intro.createScene(); for (let i = 0; i < 600; i++) done.step(1 / 60); assert.equal(done.sparks, 0); assert.equal(done.puffs, 0, 'Everything has faded and been removed by the end');
  const big = Intro.createScene(); big.step(5); assert.ok(big.t <= .1 + 1e-9, 'A stalled frame cannot jump the timeline');
});

test('drawing: every number handed to the canvas is finite at every moment, and the right pieces appear in order', () => {
  const scene = Intro.createScene();
  for (let t = 0; t <= T.DONE + .2; t += .05) { const ctx = drawAt(scene, t); for (const n of numbersIn(ctx.calls)) assert.ok(Number.isFinite(n), `t=${t.toFixed(2)} gave ${n}`); }
  assert.equal(drawImageCalls(drawAt(scene, .5)).length, 0, 'Only a spark at first'); assert.equal(drawImageCalls(drawAt(scene, 1.0)).length, 0);
  const ring = drawImageCalls(drawAt(scene, 3.2)); assert.equal(ring.length, 2, 'The ring and its reflection'); assert.deepEqual(ring[0].slice(2), [-235, -235, 470, 470]);
  assert.ok(!drawImageCalls(drawAt(scene, 3.2)).some(c => c[1] === WORD), 'The name has not appeared yet');
  const word = drawImageCalls(drawAt(scene, 4.5)).filter(c => c[1] === WORD); assert.equal(word.length, 1); assert.equal(word[0][4], 860); assert.ok(Math.abs(word[0][5] - 860 * 724 / 2172) < 1e-9, 'Keeps its proportions');
  const late = drawAt(scene, T.DONE - .1), alphas = late.calls.filter(c => c[0] === 'set:globalAlpha').map(c => c[1]); assert.ok(alphas.every(a => a < .01), 'Faded out at the end');
  assert.ok(drawAt(scene, 2.5).calls.some(c => c[0] === 'lineTo'), 'Streaks swirl in');
});

test('calm mode (reduced motion): no spin, streaks, sparks or puffs, but the ring and name still appear', () => {
  const scene = Intro.createScene({ calm: true }); for (let i = 0; i < 400; i++) { scene.step(1 / 60); assert.equal(scene.sparks + scene.puffs, 0); }
  const ctx = drawAt(scene, 3.0); assert.ok(!ctx.calls.some(c => c[0] === 'lineTo'), 'No streaks'); assert.ok(ctx.calls.filter(c => c[0] === 'rotate').every(c => c[1] === 0), 'No tilt'); assert.ok(ctx.calls.filter(c => c[0] === 'scale').some(c => c[1] === 1), 'The ring faces front');
  assert.equal(drawImageCalls(drawAt(scene, 4.6)).filter(c => c[1] === WORD).length, 1);
});

// ---- the controller, with a fake browser ----
function rig(options = {}) {
  const queue = [], winListeners = {}, docListeners = {}, timers = [], audio = [], pads = options.pads || [];
  const canvas = { width: 0, height: 0, removed: false, attrs: {}, getContext: () => options.noContext ? null : (canvas.ctx ||= recordingContext()), setAttribute(k, v) { canvas.attrs[k] = v; }, remove() { canvas.removed = true; } };
  const cover = { hidden: true, children: [], append(node) { cover.children.push(node); } };
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, navigator: { getGamepads: () => pads },
    requestAnimationFrame: fn => { queue.push(fn); return queue.length; }, cancelAnimationFrame() {},
    addEventListener(type, fn, capture) { (winListeners[type] ||= []).push({ fn, capture }); }, removeEventListener(type, fn) { winListeners[type] = (winListeners[type] || []).filter(l => l.fn !== fn); },
  };
  const doc = { hidden: false, createElement: () => canvas, addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); }, removeEventListener(type, fn) { docListeners[type] = (docListeners[type] || []).filter(f => f !== fn); } };
  const done = []; let volume = options.volume === undefined ? .4 : options.volume;
  const intro = Intro.create({ window: win, document: doc, cover, base: 'assets/studio/', onDone: () => done.push(1), calm: options.calm, volume: () => volume,
    timers: { set: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clear: id => { if (timers[id - 1]) timers[id - 1].fn = null; } },
    loadImage: name => options.failImages ? Promise.reject(new Error('missing')) : options.hangImages ? new Promise(() => {}) : Promise.resolve(name.includes('wordmark') ? WORD : RING),
    makeAudio: src => { const a = { src, volume: 0, plays: 0, paused: false, play() { a.plays++; return options.blockAudio ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); }, pause() { a.paused = true; } }; audio.push(a); return a; } });
  // Run frames of 1/60 s until `until()` is true or `limit` frames have passed.
  let now = 1000; const frames = (n) => { for (let i = 0; i < n && queue.length; i++) { now += 1000 / 60; queue.shift()(now); } };
  const fire = (type, extra = {}) => { const event = { type, stopped: false, stopImmediatePropagation() { event.stopped = true; }, ...extra }; for (const l of [...(winListeners[type] || [])]) l.fn(event); return event; };
  return { intro, cover, canvas, win, doc, winListeners, docListeners, queue, timers, audio, done, frames, fire, now: () => now, setVolume: v => { volume = v; }, pads };
}

test('it needs a canvas and a cover to run, and stays out of the way otherwise', () => {
  assert.equal(Intro.create({}), null); assert.equal(Intro.create({ window: {}, document: {}, cover: null }), null);
  const r = rig({ noContext: true }); assert.equal(r.intro, null, 'No 2D canvas support: no card, no error');
});

test('it waits for the pictures, then plays about six seconds and ends exactly once', async () => {
  const r = rig(); assert.equal(r.cover.hidden, true); r.intro.start(); assert.equal(r.cover.children[0], r.canvas); assert.equal(r.canvas.attrs['aria-hidden'], 'true'); assert.equal(r.cover.hidden, false, 'The cover is up straight away');
  assert.equal(r.queue.length, 0, 'The timeline has not started: the pictures are still loading'); await flush(); assert.equal(r.intro.running, true);
  r.frames(60); assert.ok(r.intro.time > .9 && r.intro.time < 1.1);
  r.frames(600); assert.equal(r.intro.finished, true); assert.equal(r.done.length, 1); assert.ok(r.intro.time >= T.DONE);
  assert.equal(r.cover.hidden, true); assert.equal(r.canvas.removed, true); assert.equal(r.queue.length, 0, 'No more frames are requested');
  assert.equal(Object.values(r.winListeners).flat().length + Object.values(r.docListeners).flat().length, 0, 'Every listener is removed'); r.intro.finish(); assert.equal(r.done.length, 1);
});

test('any key, click or touch belongs to the card: it is kept from the menu behind and skips after 0.3 s', async () => {
  const r = rig(); r.intro.start(); await flush();
  for (const type of ['keydown', 'pointerdown', 'mousedown', 'touchstart', 'click']) assert.ok((r.winListeners[type] || []).some(l => l.capture), type + ' is caught before the game sees it');
  r.frames(6); const early = r.fire('keydown'); assert.equal(early.stopped, true, 'Swallowed even this early'); assert.ok(r.intro.time < T.OUT, 'Too early to skip (the first 0.3 s)');
  r.frames(30); r.fire('pointerdown'); assert.ok(r.intro.time >= T.OUT, 'The card jumps to its fade-out'); r.frames(60);
  assert.equal(r.intro.finished, true); assert.equal(r.done.length, 1); assert.ok(r.intro.time < T.DONE + .1);
  assert.equal(r.fire('keydown').stopped, false, 'After it ends, keys go to the game again');
});

test('a press while the pictures are still loading skips straight to the game', async () => {
  const r = rig({ hangImages: true }); r.intro.start(); r.fire('keydown'); assert.equal(r.intro.finished, true); assert.equal(r.done.length, 1); assert.equal(r.cover.hidden, true);
});

test('a controller button skips, but a button already held when the card appears must be released first', async () => {
  const pad = { buttons: [{ pressed: true, value: 1 }] }, r = rig({ pads: [pad] }); r.intro.start(); await flush(); r.frames(60);
  assert.ok(r.intro.time < T.OUT, 'A held button does not skip'); pad.buttons[0] = { pressed: false, value: 0 }; r.frames(3); pad.buttons[0] = { pressed: true, value: 1 }; r.frames(2);
  assert.ok(r.intro.time >= T.OUT, 'A fresh press skips');
});

test('if the pictures are missing or slow it just ends: the player is never held behind a black screen', async () => {
  let r = rig({ failImages: true }); r.intro.start(); await flush(); assert.equal(r.done.length, 1); assert.equal(r.intro.running, false); assert.equal(r.cover.hidden, true);
  r = rig({ hangImages: true }); r.intro.start(); await flush(); assert.equal(r.done.length, 0); assert.equal(r.timers[0].ms, 4000, 'Gives up after 4 seconds'); r.timers[0].fn(); assert.equal(r.done.length, 1);
  r = rig(); r.intro.start(); await flush(); r.frames(3); const wall = r.timers.find(t => t.fn && t.ms > 10000); assert.ok(wall && wall.ms < 20000, 'A wall-clock limit ends the card even if frames arrive very slowly'); wall.fn(); assert.equal(r.done.length, 1); assert.equal(r.intro.finished, true);
  r = rig(); r.intro.start(); await flush(); r.frames(10); r.canvas.ctx.fillRect = () => { throw new Error('broken canvas'); }; r.frames(2); assert.equal(r.done.length, 1, 'An error while drawing ends the card'); assert.equal(r.intro.finished, true);
});

test('the sting starts as the ring is about to land, respects SFX volume and mute, and fades with the picture', async () => {
  const r = rig(); r.intro.start(); await flush(); r.frames(50); assert.equal(r.audio.length, 0, 'Not before 1.0 s');
  r.frames(20); assert.equal(r.audio.length, 1); assert.equal(r.audio[0].src, 'assets/studio/sting_one_ring.ogg'); assert.equal(r.audio[0].plays, 1); assert.ok(Math.abs(r.audio[0].volume - .4) < 1e-9); assert.ok(r.intro.time >= T.SETTLE - T.STING_LAND);
  r.frames(60); assert.equal(r.audio.length, 1, 'Started once'); const before = r.audio[0].volume; r.frames(400); assert.ok(r.audio[0].volume < before, 'It fades out with the picture'); assert.equal(r.audio[0].paused, true, 'Stopped at the end');
  const muted = rig({ volume: 0 }); muted.intro.start(); await flush(); muted.frames(400); assert.equal(muted.audio.length, 0, 'SOUND: OFF means no sting'); assert.equal(muted.done.length, 1);
  const early = rig(); early.intro.start(); await flush(); early.frames(35); early.fire('keydown'); early.frames(300); assert.equal(early.audio.length, 0, 'A card skipped before 1.0 s never plays the sting');
  const blocked = rig({ blockAudio: true }); blocked.intro.start(); await flush(); blocked.frames(400); assert.equal(blocked.done.length, 1, 'A browser that blocks autoplay just plays the card silently'); assert.deepEqual(unhandled, []);
});

test('hiding the page pauses the sting and a long gap cannot jump the card ahead', async () => {
  const r = rig(); r.intro.start(); await flush(); r.frames(80); const t = r.intro.time; r.doc.hidden = true; for (const fn of r.docListeners.visibilitychange || []) fn(); assert.equal(r.audio[0].paused, true);
  r.frames(5); assert.ok(r.intro.time - t < .01, 'The card holds still while hidden'); r.doc.hidden = false; for (const fn of r.docListeners.visibilitychange || []) fn(); r.queue.shift()?.(r.now() + 5000); assert.ok(r.intro.time - t <= .11, 'Five seconds away adds at most a tenth of a second');
});

test('reduced motion plays the calm card', async () => {
  const r = rig({ calm: true }); r.intro.start(); await flush(); r.frames(200); assert.equal(r.canvas.ctx.calls.some(c => c[0] === 'lineTo'), false);
});

test('files: the card sits first in the page, loads before the game, ships its assets, and contacts nothing', () => {
  for (const file of ['index.html', 'flight-school.html']) {
    const html = read(file); assert.match(html, /<body>\s*(<script[^>]*flight-school-boot[^>]*><\/script>\s*)?<div id="studio-intro" class="studio-intro" aria-hidden="true"><\/div>/, file + ': the black cover is the first thing in the page');
    assert.ok(html.indexOf('studio-intro.js') > 0 && html.indexOf('studio-intro.js') < html.indexOf('game.js?v='), file + ': studio-intro.js loads before game.js');
  }
  assert.match(read('style.css'), /\.studio-intro[^}]*animation:studio-intro-failsafe 0s linear 12s forwards/, 'A CSS fail-safe lifts the cover if the script never runs');
  const png = file => fs.readFileSync(path.join(root, 'assets/studio', file)), isPng = b => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.ok(isPng(png('one_ring.png')) && isPng(png('one_ring_wordmark.png'))); assert.equal(png('sting_one_ring.ogg').subarray(0, 4).toString(), 'OggS');
  assert.equal(png('one_ring.png').readUInt32BE(16), 1254); assert.equal(png('one_ring_wordmark.png').readUInt32BE(16), 2172); assert.ok(fs.existsSync(path.join(root, 'assets/studio/README.txt')));
  const source = read('studio-intro.js'); assert.ok(!/https?:\/\/|fetch\(|XMLHttpRequest|localStorage|sessionStorage|eval\(/.test(source), 'No network, storage or eval');
  const build = read('tools/build-windows-playtest.py'); assert.match(build, /'studio-intro\.js'/); assert.match(build, /'\.ogg'/, 'The Windows build packs the .ogg sting');
  const original = "G:/brayden-malia's-wonder-worlds/godot47/assets/title/one_ring.png";
  if (fs.existsSync(original)) assert.equal(crypto.createHash('sha256').update(png('one_ring.png')).digest('hex'), crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex'), 'The ring is the unchanged original');
});

test('the game only starts it from one place and holds its menu music, gamepad and the Flight School practice out of it', () => {
  const game = read('game.js');
  assert.match(game, /function initStudioIntro\(\)/); assert.match(game, /initializeFlightSchool\(\);initStudioIntro\(\);if\(!trainingSession\)resumeMusic\(\)/);
  assert.match(game, /musicPlaybackAllowed\(\)\{return!trainingFrame&&!spotifyHeld&&!introActive&&/); assert.match(game, /if\(trainingFrame\|\|introActive\|\|document\.hidden\|\|!inputFocused\)/);
  assert.match(game, /STARFIGHTER_TRAINING_SANDBOX\|\|!module\|\|\/\[\?&\]nointro/);
});

test('no promise rejection escaped any test', async () => { await flush(); assert.deepEqual(unhandled.map(String), []); });

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) { try { await fn(); console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); } }
  console.log(`${tests.length - failed} studio intro checks passed, ${failed} failed`);
  console.log('Scope: mocked canvas, audio and clock. How the card looks and sounds, and that a real browser plays the sting, need a human check.');
  process.exit(failed ? 1 : 0);
})();
