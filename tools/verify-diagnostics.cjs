#!/usr/bin/env node
'use strict';
// Contract tests for the opt-in local diagnostics module (diagnostics.js).
// Mock clock, window, storage and DOM only; no real profile or save is touched.
const assert = require('node:assert/strict');
const path = require('node:path');
const Diagnostics = require(path.resolve(__dirname, '..', 'diagnostics.js'));
const results = [];
function check(name, fn) {
  try { const details = fn(); results.push({ name, passed: true, details }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); console.error('FAIL ' + name + '\n' + error.stack); }
}
async function checkAsync(name, fn) {
  try { const details = await fn(); results.push({ name, passed: true, details }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); console.error('FAIL ' + name + '\n' + error.stack); }
}

function mockStorage(initial = {}, options = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem(key, value) { if (options.throwOnSet) throw new Error('QuotaExceededError'); map.set(key, String(value)); },
    removeItem: key => map.delete(key),
  };
}
function mockWindow(extra = {}) {
  const listeners = {};
  const win = {
    performance: { memory: { usedJSHeapSize: 50 * 1048576, totalJSHeapSize: 80 * 1048576 } },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/156', hardwareConcurrency: 8, deviceMemory: 8 },
    screen: { width: 1920, height: 1080 }, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatch(type, event) { for (const fn of listeners[type] || []) fn(event); },
    listeners, ...extra,
  };
  return win;
}
function make(options = {}) {
  const clock = { t: 1000 };
  const storage = options.storage || mockStorage(options.stored || {});
  const window_ = options.window || mockWindow();
  const instance = Diagnostics.create({ window: window_, document: options.document || null, storage, now: () => clock.t, version: options.version || 'v168', sandbox: options.sandbox, download: options.download });
  return { clock, storage, window: window_, d: instance };
}
// Feed `count` frames of a fixed interval; the first call only establishes the previous-frame time.
function feed(h, count, interval, update = 1, draw = 1, key = 'boss:5:p2') {
  h.d.setKey(() => key);
  for (let i = 0; i < count; i++) { h.clock.t += interval; h.d.frame(h.clock.t, update, draw); }
}

check('disabled by default: frames, marks and exports record nothing and storage is untouched', () => {
  const h = make();
  assert.equal(h.d.active, false);
  h.d.frame(1016, 1, 1); h.d.frame(1033, 1, 1); h.d.mark('part-break');
  const snap = h.d.snapshot();
  assert.equal(snap.recording, false); assert.deepEqual(snap.sessions, []);
  assert.equal(h.storage.map.size, 0, 'Nothing may be written while the log is off');
  return { sessions: snap.sessions.length };
});

check('enabling counts frames; the first frame, idle resumes and long gaps are not measured', () => {
  const h = make(); h.d.setEnabled(true);
  h.d.frame(1000, 1, 1);                               // establishes the previous frame only
  h.d.frame(1016.7, 1, 1); h.d.frame(1033.4, 1, 1);    // two measured frames
  h.d.idle(); h.d.frame(5000, 1, 1);                   // after idle: re-establish, not measured
  h.d.frame(5016.7, 1, 1);                             // measured
  h.d.frame(20000, 1, 1);                              // 15 s gap (sleep or debugger): ignored
  const s = h.d.snapshot().sessions.at(-1);
  assert.equal(s.frames, 3); assert.equal(s.interval.count, 3);
  assert.equal(h.storage.getItem(Diagnostics.keys.enabled), '1');
  return { frames: s.frames };
});

check('a multi-second freeze is recorded as a hitch, while hidden pages reset the clock instead', () => {
  const listeners = {}, doc = { visibilityState: 'visible', addEventListener(type, fn) { listeners[type] = fn; } };
  const h = make({ document: doc }); h.d.setEnabled(true); h.d.frame(1000, 1, 1); feed(h, 10, 16.7);
  h.clock.t += 3000; h.d.frame(h.clock.t, 1, 1);                       // a real 3 s freeze while visible
  let s = h.d.snapshot().sessions.at(-1);
  assert.equal(s.slow.ms100, 1); assert.equal(s.interval.max, 3000); assert.equal(s.recent.at(-1).interval, 3000);
  doc.visibilityState = 'hidden'; listeners.visibilitychange(); doc.visibilityState = 'visible';
  h.clock.t += 60000; h.d.frame(h.clock.t, 1, 1);                      // first frame after returning is not measured
  h.clock.t += 16.7; h.d.frame(h.clock.t, 1, 1);
  s = h.d.snapshot().sessions.at(-1);
  assert.equal(s.interval.max, 3000, 'The minute spent hidden is not a hitch'); assert.equal(s.frames, 12);
  return { frames: s.frames };
});

check('percentiles come from the histogram and the maximum stays exact', () => {
  const h = make(); h.d.setEnabled(true); h.d.frame(1000, 1, 1);
  feed(h, 90, 16.7); feed(h, 5, 40.4); feed(h, 5, 120.9);
  const s = h.d.snapshot().sessions.at(-1);
  assert.equal(s.interval.count, 100);
  assert.equal(s.interval.p50, 16); assert.equal(s.interval.p95, 40); assert.equal(s.interval.p99, 120);
  assert.equal(s.interval.max, 120.9);
  assert.equal(s.draw.p50, 1); assert.ok(s.interval.histogram.some(([ms, n]) => ms === 16 && n === 90));
  return { p50: s.interval.p50, p95: s.interval.p95, p99: s.interval.p99 };
});

check('hitch thresholds: 34 ms intervals and 20 ms of work are hitches, just under are not', () => {
  const h = make(); h.d.setEnabled(true); h.d.frame(1000, 1, 1);
  feed(h, 1, 33.9); assert.equal(h.d.snapshot().sessions.at(-1).slow.ms34, 0);
  feed(h, 1, 34); feed(h, 1, 50); feed(h, 1, 100);
  feed(h, 1, 16, 1, 19.9); feed(h, 1, 16, 1, 20); feed(h, 1, 16, 20, 1);
  const s = h.d.snapshot().sessions.at(-1);
  assert.equal(s.slow.ms34, 3); assert.equal(s.slow.ms50, 2); assert.equal(s.slow.ms100, 1); assert.equal(s.slow.work20, 2);
  assert.equal(s.recent.length, 5, 'Each hitch frame is recorded once');
  return s.slow;
});

check('worst hitches are sorted and capped; the recent list keeps the newest hundred', () => {
  const h = make(); h.d.setEnabled(true); h.d.frame(1000, 1, 1);
  for (let i = 0; i < 150; i++) feed(h, 1, 40 + i);
  const s = h.d.snapshot().sessions.at(-1);
  assert.equal(s.recent.length, Diagnostics.limits.recent); assert.equal(s.recent[0].interval, 90, 'Oldest fifty were dropped');
  assert.equal(s.worst.length, Diagnostics.limits.worst); assert.equal(s.worst[0].interval, 189);
  for (let i = 1; i < s.worst.length; i++) assert.ok(s.worst[i - 1].interval >= s.worst[i].interval);
  return { recent: s.recent.length, worst: s.worst.length };
});

check('marks tag later hitches inside the window and never outside it', () => {
  const h = make(); h.d.setEnabled(true); h.d.frame(1000, 1, 1); h.d.mark('part-break');
  h.clock.t += 300; h.d.frame(h.clock.t, 1, 40);
  feed(h, 400, 16.7); h.clock.t += 80; h.d.frame(h.clock.t, 1, 40);   // 6.7 s of play, then another hitch
  const s = h.d.snapshot().sessions.at(-1);
  assert.equal(s.recent.length, 2);
  assert.equal(s.recent[0].sinceMark['part-break'], 300); assert.deepEqual(s.recent[1].sinceMark, {});
  assert.equal(s.marks['part-break'], 1);
  return { first: s.recent[0].sinceMark };
});

check('context and key callbacks that throw never break frame recording', () => {
  const h = make(); h.d.setEnabled(true); h.d.frame(1000, 1, 1);
  h.d.setContext(() => { throw new Error('context failure'); }); h.d.setKey(() => { throw new Error('key failure'); });
  h.clock.t += 80; h.d.frame(h.clock.t, 1, 1);
  const s = h.d.snapshot().sessions.at(-1);
  assert.equal(s.frames, 1); assert.equal(s.recent[0].ctx, null); assert.equal(s.recent[0].key, 'unknown'); assert.ok(s.encounters.unknown);
  return { key: s.recent[0].key };
});

check('per-encounter aggregates are bounded and expose means, hitch counts and worst frames', () => {
  const h = make(); h.d.setEnabled(true); h.d.frame(1000, 1, 1);
  feed(h, 4, 16, 1, 2, 'boss:2:p1'); feed(h, 1, 60, 1, 30, 'boss:2:p1');
  for (let i = 0; i < 130; i++) feed(h, 1, 16, 1, 1, 'k' + i);
  const s = h.d.snapshot().sessions.at(-1), e = s.encounters['boss:2:p1'];
  assert.equal(e.frames, 5); assert.equal(e.slow34, 1); assert.equal(e.slow50, 1); assert.equal(e.worstInterval, 60); assert.equal(e.worstDraw, 30);
  assert.equal(e.meanDraw, 7.6);
  assert.ok(Object.keys(s.encounters).length <= Diagnostics.limits.encounters + 1); assert.ok(s.encounters.other.frames > 0);
  return { keys: Object.keys(s.encounters).length };
});

check('heap samples follow the timer, use the browser value and are capped', () => {
  const win = mockWindow(); const h = make({ window: win }); h.d.setEnabled(true); h.d.frame(1000, 1, 1);
  for (let i = 0; i < 20; i++) { win.performance.memory.usedJSHeapSize = (50 + i) * 1048576; feed(h, 900, 16.7); }
  const s = h.d.snapshot().sessions.at(-1);
  assert.equal(s.heap.samples.length, 20); assert.equal(s.heap.firstMB, 50); assert.equal(s.heap.lastMB, 69); assert.equal(s.heap.maxMB, 69);
  const none = make({ window: mockWindow({ performance: {} }) }); none.d.setEnabled(true); none.d.frame(1000, 1, 1); feed(none, 1800, 16.7);
  assert.equal(none.d.snapshot().sessions.at(-1).heap.samples.length, 0, 'No fake samples when the browser exposes no memory API');
  return { samples: s.heap.samples.length };
});

check('script errors keep only a message, file name and line; query strings and paths are stripped', () => {
  const win = mockWindow(); const h = make({ window: win });
  win.dispatch('error', { message: 'before enabling', filename: 'x.js' });
  h.d.setEnabled(true);
  win.dispatch('error', { message: 'Boom ' + 'x'.repeat(400), filename: 'http://127.0.0.1:18765/game.js?hostKey=SECRET#frag', lineno: 3517 });
  win.dispatch('unhandledrejection', { reason: new Error('async failure') });
  win.dispatch('error', { message: 'win path', filename: 'C:\\Users\\friend\\AppData\\game.js?token=abc' });
  for (let i = 0; i < 40; i++) win.dispatch('error', { message: 'e' + i, filename: 'a.js' });
  const s = h.d.snapshot().sessions.at(-1), text = h.d.exportText();
  assert.equal(s.errorCount, 43); assert.equal(s.errors.length, Diagnostics.limits.errors);
  assert.equal(s.errors[0].message.length, 200); assert.equal(s.errors[0].file, 'game.js'); assert.equal(s.errors[0].line, 3517);
  assert.equal(s.errors[1].message, 'async failure'); assert.equal(s.errors[2].file, 'game.js');
  for (const secret of ['SECRET', 'hostKey', 'friend', 'AppData', 'token=abc', '127.0.0.1', 'before enabling'])assert.ok(!text.includes(secret), 'Export must not contain ' + secret);
  return { count: s.errorCount };
});

check('autosave persists a compact copy, and a new page load keeps earlier sessions up to the limit', () => {
  const storage = mockStorage();
  for (let session = 1; session <= 7; session++) {
    const h = make({ storage }); if (session === 1) h.d.setEnabled(true);
    assert.equal(h.d.enabled, true, 'The preference survives a reload');
    h.d.frame(1000, 1, 1); feed(h, 1300, 16.7);   // 21.7 s of play crosses the 20 s autosave
  }
  const stored = JSON.parse(storage.getItem(Diagnostics.keys.sessions));
  assert.equal(stored.length, Diagnostics.limits.sessions); assert.deepEqual(stored.map(s => s.id), [3, 4, 5, 6, 7]);
  const viewer = make({ storage }); const snap = viewer.d.snapshot();
  assert.equal(snap.sessions.length, Diagnostics.limits.sessions, 'Four earlier plus the current session');
  assert.ok(snap.sessions.every(s => s.schema === 1));
  return { ids: stored.map(s => s.id) };
});

check('corrupt or foreign stored data is ignored and a failing store never throws', () => {
  for (const bad of ['not json', '{"a":1}', '[1,2,"x",null]', '[{"schema":9,"id":1}]']) {
    const h = make({ stored: { [Diagnostics.keys.enabled]: '1', [Diagnostics.keys.sessions]: bad } });
    assert.equal(h.d.enabled, true); h.d.frame(1000, 1, 1); feed(h, 3, 16);
    assert.equal(h.d.snapshot().sessions.length, 1, 'Only the live session remains for: ' + bad);
  }
  const failing = make({ storage: mockStorage({}, { throwOnSet: true }) });
  failing.d.setEnabled(true); failing.d.frame(1000, 1, 1); feed(failing, 2000, 16.7);   // 33 s of play: autosave attempts throw inside the store
  assert.equal(failing.d.persist(), false); assert.equal(failing.d.snapshot().sessions.at(-1).frames, 2000);
  return { ok: true };
});

check('stored data is bounded: large hitch context drops detail before it can exceed the byte limit', () => {
  const h = make(); h.d.setEnabled(true); h.d.frame(1000, 1, 1);
  h.d.setContext(() => ({ blob: 'x'.repeat(2500) }));
  for (let i = 0; i < 120; i++) feed(h, 1, 50 + (i % 7));
  h.d.persist();
  const text = h.storage.getItem(Diagnostics.keys.sessions);
  assert.ok(text.length <= Diagnostics.limits.storedBytes, 'Stored copy is ' + text.length + ' bytes');
  const stored = JSON.parse(text).at(-1); assert.equal(stored.recent.length, 0); assert.ok(stored.worst.length > 0, 'The worst hitches survive');
  return { bytes: text.length };
});

check('the export has a fixed public shape and no save, pilot or address data', () => {
  const h = make({ version: 'v168' }); h.d.setEnabled(true);
  h.d.setSettings(() => ({ reducedMotion: false, clearCombat: true, uiText: 'standard' }));
  h.d.setEnvironment(() => ({ canvas: [1355, 762] }));
  h.d.frame(1000, 1, 1); feed(h, 10, 16.7); h.d.mark('part-break');
  const snap = h.d.snapshot(), text = h.d.exportText();
  assert.deepEqual(Object.keys(snap), ['schema', 'app', 'build', 'generatedAt', 'privacy', 'environment', 'settings', 'recording', 'sessions']);
  assert.equal(snap.build, 'v168'); assert.deepEqual(snap.environment.canvas, [1355, 762]); assert.equal(snap.environment.cpuThreads, 8);
  for (const forbidden of ['hostKey', 'localStorage', 'garage', 'checkpoint', 'profile', 'pilot', 'location', 'http://', 'file:'])assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()), 'Export must not mention ' + forbidden);
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(snap)).sessions ? JSON.parse(text) : null);
  return { bytes: text.length };
});

check('inside practice the module is inert: no recording, no storage, controls hidden', () => {
  const stored = { [Diagnostics.keys.enabled]: '1' }, storage = mockStorage(stored);
  const group = { hidden: false }, doc = { getElementById: id => id === 'diagnostics-group' ? group : null };
  const h = make({ storage, sandbox: true, document: doc });
  assert.equal(h.d.enabled, false); assert.equal(h.d.setEnabled(true), false); h.d.frame(1000, 1, 1); h.d.frame(1017, 1, 1); h.d.mark('x');
  assert.equal(h.d.bind(doc), false); assert.equal(group.hidden, true); assert.equal(h.d.save(), null);
  assert.equal(storage.map.has(Diagnostics.keys.sessions), false); assert.equal(h.d.snapshot().sessions.length, 0);
  return { hidden: group.hidden };
});

check('bind wires the toggle and buttons: save, copy, clear and live status text', async () => {
  const saved = []; const elements = {};
  const el = (id, extra = {}) => (elements[id] = { id, textContent: '', checked: false, hidden: false, handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, ...extra });
  el('diagnostics-group'); el('diagnostics-enabled'); el('diagnostics-save'); el('diagnostics-copy'); el('diagnostics-clear'); el('diagnostics-status');
  const doc = { getElementById: id => elements[id] || null };
  const win = mockWindow({ navigator: { userAgent: 'UA', clipboard: { writeText: async text => { win.copied = text; } } } });
  const h = make({ window: win, document: doc, download: (text, name) => { saved.push({ text, name }); return true; } });
  assert.equal(h.d.bind(doc), true); assert.match(elements['diagnostics-status'].textContent, /^Off\. Turn on before playing/);
  elements['diagnostics-enabled'].checked = true; elements['diagnostics-enabled'].handlers.change();
  assert.equal(h.d.enabled, true); assert.equal(elements['diagnostics-enabled'].checked, true); assert.match(elements['diagnostics-status'].textContent, /^Recording: 0 frames/);
  h.d.frame(1000, 1, 1); feed(h, 5, 70);
  elements['diagnostics-save'].handlers.click();
  assert.equal(saved.length, 1); assert.match(saved[0].name, /^starfighter-diagnostics-v168-\d{8}-\d{4}\.json$/); assert.equal(JSON.parse(saved[0].text).sessions.at(-1).slow.ms34, 5);
  assert.match(elements['diagnostics-status'].textContent, /^Saved starfighter-diagnostics-v168-/);
  await elements['diagnostics-copy'].handlers.click(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(JSON.parse(win.copied).schema, 1); assert.match(elements['diagnostics-status'].textContent, /^Copied/);
  elements['diagnostics-clear'].handlers.click();
  assert.equal(h.storage.map.has(Diagnostics.keys.sessions), false); assert.equal(h.d.snapshot().sessions.at(-1).frames, 0); assert.match(elements['diagnostics-status'].textContent, /^Cleared\./);
  elements['diagnostics-enabled'].checked = false; elements['diagnostics-enabled'].handlers.change();
  assert.equal(h.d.enabled, false); assert.equal(h.storage.getItem(Diagnostics.keys.enabled), '0');
  return { savedBytes: saved[0].text.length };
});

check('turning the log off keeps the data it already collected for export', () => {
  const h = make(); h.d.setEnabled(true); h.d.frame(1000, 1, 1); feed(h, 5, 16);
  h.d.setEnabled(false); h.d.frame(2000, 1, 1); h.d.frame(2016, 1, 1);
  const snap = h.d.snapshot();
  assert.equal(snap.recording, false); assert.equal(JSON.parse(h.storage.getItem(Diagnostics.keys.sessions)).at(-1).frames, 5);
  return { stored: true };
});

check('overhead is small: disabled calls are near free and enabled calls stay far below a frame budget', () => {
  const off = make(), on = make(); on.d.setEnabled(true); on.d.setKey(() => 'boss:5:p2'); on.d.frame(1000, 1, 1);
  const N = 300000; let t = 1000; const a = process.hrtime.bigint();
  for (let i = 0; i < N; i++) { t += 16.7; off.d.frame(t, 1, 1); }
  const b = process.hrtime.bigint(); t = 1000;
  for (let i = 0; i < N; i++) { t += 16.7; on.d.frame(t, 1, 1.2); }
  const c = process.hrtime.bigint();
  const offNs = Number(b - a) / N, onNs = Number(c - b) / N;
  assert.ok(offNs < 2000, 'Disabled path ' + offNs.toFixed(0) + ' ns');
  assert.ok(onNs < 25000, 'Enabled path ' + onNs.toFixed(0) + ' ns (a 60 Hz frame is 16,700,000 ns)');
  return { disabledNs: Math.round(offNs), enabledNs: Math.round(onNs) };
});

const failed = results.filter(r => !r.passed).length;
setTimeout(() => {
  const finished = results.filter(r => r.passed).length;
  console.log(`${finished} diagnostics checks passed, ${results.length - finished} failed`);
  if (results.some(r => !r.passed)) process.exitCode = 1;
}, 50);
