#!/usr/bin/env node
'use strict';
// Save/load corruption fuzzer. Real game code in the Node test harness with seeded, reproducible damage to
// stored saves. Never touches real browser storage or the real game folder's saves.
//
//   node tools/fuzz-save-load.cjs [--seed=168] [--cases=600] [--shard=1/1] [--out=artifacts/save-load-fuzz.json] [--verbose]
//
// Each case boots a real game from a damaged store, then drives the menus, Garage, loot guide, Continue, a
// new run and a save, and checks: no crash, no garbage on screen (NaN/undefined), finite data, sane storage
// key names, no prototype pollution, and that an unreadable save is never overwritten.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), harness = path.join(__dirname, 'verify-game.cjs');
const arg = (name, fallback) => (process.argv.find(a => a.startsWith('--' + name + '=')) || '').split('=').slice(1).join('=') || fallback;
const seed = Number(arg('seed', 168)), totalCases = Number(arg('cases', 600)), [shardIndex, shardCount] = arg('shard', '1/1').split('/').map(Number);
const outFile = path.resolve(root, arg('out', 'artifacts/save-load-fuzz-report.json')), verbose = process.argv.includes('--verbose');

let support = fs.readFileSync(harness, 'utf8'); support = support.slice(0, support.indexOf('\ntest('));
const isolated = new Module(harness, module); isolated.filename = harness; isolated.paths = Module._nodeModulePaths(__dirname);
isolated._compile(support + '\nmodule.exports={createGame};', harness);
const { createGame } = isolated.exports;

// ---------- seeded randomness ----------
function rng(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

// ---------- golden saves produced by the real game ----------
function stockGarage(g) {
  const { api } = g;
  for (let tier = 0; tier <= 4; tier++) for (let i = 0; i < 5; i++) api.garage.inventory.push(api.generateGear(tier, 1, '', { source: 'FUZZ SEED' }));
  for (const slot of ['weapon', 'armor', 'engine', 'pod']) { const item = api.garage.inventory.find(x => x.slot === slot); if (item) api.garage.equipped[slot] = item.id; }
  api.garage.materials = 137;
}
function goldenSaves() {
  const out = [];
  const snap = (label, g) => { g.api.saveProfile(); const entries = [...g.storage.entries()]; const slot1 = g.storage.get('starfighterProfileSlot1');
    if (slot1) { for (const [n, name] of [[2, 'ALPHA'], [3, 'BRAVO']]) { const copy = JSON.parse(slot1); copy.name = name; entries.push(['starfighterProfileSlot' + n, JSON.stringify(copy)]); } }
    out.push({ label, entries }); };
  { const g = createGame(); snap('fresh-pilot', g); }
  { const g = createGame(); stockGarage(g); snap('stocked-garage', g); }
  { const g = createGame(); stockGarage(g); Object.assign(g.api.profile.progress, { missionsCleared: Array(10).fill(true), normalBossesDefeated: Array(10).fill(true), epicUnlocked: true, epicBossesDefeated: [3, 1], trainingComplete: true, introComplete: true, onboardingSeen: ['missile', 'bit', 'shield', 'delta', 'gear'] });
    Object.assign(g.api.profile.lifetime, { runs: 40, bestScore: 912345, waves: 120, kills: 5400, bosses: 90, epicBosses: 6, miniBosses: 80, playSeconds: 90000, gear: 300, exotics: 9, ritualsWon: 4, ritualsFailed: 2 });
    g.api.profile.history = Array.from({ length: 20 }, (_, i) => ({ date: 1.7e12 + i * 1e6, mode: ['story', 'rush', 'replay'][i % 3], result: i % 2 ? 'lost' : 'complete', duration: 600 + i, score: 1000 * i, wave: 1 + i % 10, kills: 50 + i, shotsFired: 900, chargedShots: 40, damageDealt: 12345, damageTaken: 3, shieldsLost: 2, evades: 5, weakspotsDestroyed: 12, miniBosses: 1, normalBosses: 1, epicBosses: 0, gearCollected: 4, commonDrops: 2, uncommonDrops: 1, rareDrops: 1, superDrops: 0, exoticDrops: 0, ritualsWon: 0, ritualsFailed: 0 }));
    snap('veteran-pilot', g); }
  const run = (label, mode, segment, prepare) => { const g = createGame(); stockGarage(g);
    if (mode === 'replay') g.api.profile.progress.missionsCleared[2] = true;
    prepare?.(g); g.api.start(mode, mode === 'replay' ? 3 : 1); if (g.api.state !== 'playing') throw new Error('golden run did not start: ' + label);
    g.api.player.inv = 1e6; for (let i = 0; i < 600; i++) g.api.update(1 / 120);
    g.api.saveRunCheckpoint(segment); snap(label, g); };
  run('story-mission', 'story', 'mission'); run('story-postElite', 'story', 'postElite'); run('story-module', 'story', 'module'); run('story-doctrine', 'story', 'doctrine');
  run('rush-apex', 'rush', 'apex'); run('rush-doctrine', 'rush', 'doctrine'); run('replay-mission', 'replay', 'mission');
  return out;
}

// ---------- mutation engine ----------
const INF = '__INFINITY__';
function weirdValues(rand) {
  return [null, '', ' ', 'abc', '<img src=x onerror=alert(1)>', "'\"\\", -1, 0, 1, 1.5, -0.5, 1e308, -1e308, INF, 2 ** 53, 9007199254740993, true, false, [], {}, [null], [[]], { __proto__: null },
    JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'), 'x'.repeat(20000), Array(1500).fill(1), Array(60).fill({ a: 1 }), '9'.repeat(400), '\u0000‮', 'NaN', 'undefined', 'null'][Math.floor(rand() * 33)];
}
function collectPaths(value, limit = 4000) {
  const paths = []; const walk = (node, trail, depth) => {
    if (paths.length > limit || !node || typeof node !== 'object' || depth > 7) return;
    const keys = Array.isArray(node) ? node.map((_, i) => i).slice(0, 40) : Object.keys(node);
    for (const key of keys) { paths.push([...trail, key]); walk(node[key], [...trail, key], depth + 1); }
  }; walk(value, [], 0); return paths;
};
function mutateTree(root_, rand, notes) {
  const paths = collectPaths(root_); if (!paths.length) return root_;
  const trail = pick(rand, paths); let parent = root_; for (const key of trail.slice(0, -1)) parent = parent[key]; const last = trail.at(-1), roll = rand();
  const here = trail.join('.');
  if (roll < .58) { const v = weirdValues(rand); parent[last] = v; notes.push(`set ${here}=${typeof v === 'string' ? JSON.stringify(v.slice(0, 24)) : Array.isArray(v) ? `array(${v.length})` : v === INF ? 'Infinity' : JSON.stringify(v)?.slice(0, 40)}`); }
  else if (roll < .72) { if (Array.isArray(parent)) parent.splice(last, 1); else delete parent[last]; notes.push(`delete ${here}`); }
  else if (roll < .82) { const v = parent[last]; parent[last] = Array.isArray(v) ? { ...v } : v && typeof v === 'object' ? Object.values(v) : typeof v === 'number' ? String(v) : typeof v === 'string' ? Number(v) || [v] : v; notes.push(`retype ${here}`); }
  else if (roll < .88) { if (typeof parent[last] === 'string') { parent[last] = parent[last].slice(0, Math.floor(rand() * parent[last].length)); notes.push(`truncate string ${here}`); } else { parent[last] = null; notes.push(`null ${here}`); } }
  else if (roll < .94 && Array.isArray(parent) && parent.length) { parent.push(JSON.parse(JSON.stringify(parent[Math.floor(rand() * parent.length)] ?? null))); notes.push(`duplicate in ${trail.slice(0, -1).join('.')}`); }
  else { if (Array.isArray(parent)) { parent.reverse(); } else { const keys = Object.keys(parent); if (keys.length > 1) { const a = pick(rand, keys), b = pick(rand, keys), t = parent[a]; parent[a] = parent[b]; parent[b] = t; } } notes.push(`swap in ${trail.slice(0, -1).join('.') || 'root'}`); }
  return root_;
}
const stringify = value => JSON.stringify(value, (_, v) => v === INF ? 1e999 : v).replace(/"__INFINITY__"/g, '1e999');
function garbageText(rand, original) {
  const options = [() => '', () => ' ', () => 'null', () => '[]', () => '{}', () => '0', () => 'true', () => '"text"', () => 'NaN', () => '{', () => original.slice(0, Math.floor(rand() * original.length)),
    () => '﻿' + original, () => original + '}garbage', () => original.slice(0, Math.floor(original.length / 2)) + original.slice(Math.floor(original.length / 2) + 7), () => '9'.repeat(5000), () => original.replace(/"/g, "'"), () => 'x'.repeat(200000)];
  return pick(rand, options)();
}
const SIMPLE_KEYS = { starfighterActiveProfile: ['', '-1', '99', 'abc', '1e9', '2.5', 'NaN', '1', '2', 'null', '[]', '0x2', ' 1 '], lastSignalBest: ['', 'abc', '-5', '1e999', 'NaN', '99999999999999999999', '{}'],
  starfighterMusicVolume: ['', 'abc', '-1', '5', 'NaN', '1e999'], starfighterSfxVolume: ['', 'abc', '-1', '5', 'NaN'], starfighterMuted: ['', 'maybe', '1', 'null'], mouseFlight: ['', 'x', '1'],
  starfighterReducedMotion: ['', 'x', '1'], starfighterClearCombat: ['', 'x'], starfighterCollisionGuide: ['', 'x'], starfighterUiText: ['', 'huge', '{}', 'LARGE'],
  starfighterControls: ['', '{', 'null', '[]', '{"keyboard":null}', '{"keyboard":{"fire":[]},"controller":"x"}', '{"version":99}', '{"keyboard":{"fire":"KeyZ"}}', 'x'.repeat(8000)],
  starfighterDiagnostics: ['', 'x', '1', '0'], starfighterDiagnosticsSessions: ['', '{', 'null', '[1,2,3]', '[{"schema":1,"id":"x"}]', '[{"schema":1,"id":1,"frames":"many","interval":null}]'] };
function damage(golden, rand) {
  const entries = new Map(golden.entries), notes = [], kinds = ['profile', 'profile', 'profile', 'profile', 'whole', 'simple', 'simple', 'multi'];
  const kind = pick(rand, kinds), jsonKeys = [...entries.keys()].filter(k => /^starfighterProfile(Slot\d)?$|^starfighterGarage$/.test(k));
  const mutateKey = key => { const original = entries.get(key); let tree; try { tree = JSON.parse(original); } catch { entries.set(key, garbageText(rand, original)); notes.push(`garbage ${key}`); return; }
    const count = 1 + Math.floor(rand() * 3); for (let i = 0; i < count; i++) mutateTree(tree, rand, notes); entries.set(key, stringify(tree)); };
  if (kind === 'simple') { const key = pick(rand, Object.keys(SIMPLE_KEYS)); entries.set(key, pick(rand, SIMPLE_KEYS[key])); notes.push(`${key}=${JSON.stringify(entries.get(key)).slice(0, 40)}`); }
  else if (kind === 'whole') { const key = pick(rand, jsonKeys); entries.set(key, garbageText(rand, entries.get(key))); notes.push(`whole-value garbage ${key}`); }
  else if (kind === 'multi') { for (let i = 0; i < 2 + Math.floor(rand() * 3); i++) { if (rand() < .3) { const key = pick(rand, Object.keys(SIMPLE_KEYS)); entries.set(key, pick(rand, SIMPLE_KEYS[key])); notes.push(`${key}=...`); } else mutateKey(pick(rand, jsonKeys)); } }
  else { const key = rand() < .7 ? 'starfighterProfileSlot1' : pick(rand, jsonKeys); mutateKey(key); if (rand() < .25 && key.endsWith('Slot1')) { entries.delete('starfighterProfileSlot1'); entries.set('starfighterProfile', entries.get('starfighterProfile') ?? stringify(JSON.parse(golden.entries.find(e => e[0] === 'starfighterProfileSlot1')[1]))); notes.push('slot1 removed: legacy mirror path'); } }
  return { entries: [...entries.entries()], notes, kind };
}

// ---------- invariants ----------
const GARBAGE = /\bNaN\b|undefined|\[object |Infinity/;
function allIds() { return [...new Set([...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/\bid="([^"]+)"/g)].map(m => m[1]))]; }
const IDS = allIds();
function checkScreen(g) {
  for (const id of IDS) { const el = g.document.getElementById('' + id); if (!el) continue; const text = String(el.textContent ?? '') + ' ' + String(el.innerHTML ?? ''); const m = text.match(GARBAGE); if (m) throw new Error(`Garbage text "${m[0]}" shown in #${id}: ${text.replace(/\s+/g, ' ').slice(0, 90)}`); }
}
const finite = (v, what) => { if (!Number.isFinite(v)) throw new Error(`${what} is not a finite number (${JSON.stringify(v)})`); };
function checkProfile(api) {
  const p = api.profile; if (!p || typeof p !== 'object') throw new Error('No profile object');
  for (const [k, v] of Object.entries(p.lifetime || {})) finite(Number(v), 'lifetime.' + k);
  finite(Number(api.garage.materials), 'garage.materials');
  for (const v of p.progress.epicBossesDefeated) finite(v, 'progress.epicBossesDefeated');
  for (const item of api.garage.inventory) {
    if (!['weapon', 'armor', 'engine', 'pod'].includes(item.slot)) throw new Error('Bad gear slot ' + item.slot);
    if (!Number.isInteger(item.tier) || item.tier < 0 || item.tier > 4) throw new Error('Bad gear tier ' + item.tier);
    for (const [k, v] of Object.entries(item.stats)) finite(v, 'gear stat ' + k);
    finite(item.power, 'gear power');
  }
}
function exercise(entries, rawByKey) {
  const failures = [], fail = (stage, error) => failures.push({ stage, message: String(error?.message ?? error).split('\n')[0].slice(0, 220), stack: String(error?.stack ?? '').split('\n').slice(1, 4).join(' | ').slice(0, 300) });
  let g; try { g = createGame({ initialStorage: entries }); } catch (error) { fail('boot', error); return failures; }
  const { api } = g, guard = (stage, fn) => { try { return fn(); } catch (error) { fail(stage, error); } };
  // An "unreadable" save is a slot whose stored text exists but the game cannot use. The game must protect it, never overwrite it.
  const unreadableKeys = guard('read-slot', () => ['starfighterProfileSlot1', 'starfighterProfileSlot2', 'starfighterProfileSlot3'].filter((key, slot) => rawByKey.has(key) && rawByKey.get(key) !== '' && api.readProfileSlot(slot) === null)) || [];
  const unreadableAtBoot = unreadableKeys.length > 0;
  const whyUnreadable = key => { let v; try { v = JSON.parse(rawByKey.get(key)); } catch { return 'not-json'; } if (!v || typeof v !== 'object' || Array.isArray(v)) return 'not-an-object';
    const ver = v.version === undefined ? 0 : v.version; if (typeof ver !== 'number' || !Number.isInteger(ver) || ver < 0 || ver > 6) return 'bad-version';
    if (v.garage !== undefined && v.garage !== null && !(v.garage && Array.isArray(v.garage.inventory))) return 'unusable-garage'; return 'other'; };
  // A save the game accepts must not silently lose what was stored: gear counts and spare parts have to survive loading.
  guard('silent-loss', () => {
    ['starfighterProfileSlot1', 'starfighterProfileSlot2', 'starfighterProfileSlot3'].forEach((key, slot) => {
      if (!rawByKey.has(key) || unreadableKeys.includes(key)) return;
      let stored; try { stored = JSON.parse(rawByKey.get(key)); } catch { return; }
      const loaded = api.readProfileSlot(slot); if (!loaded || !stored || typeof stored !== 'object') return;
      const rawGarage = stored.garage;
      if (Array.isArray(rawGarage?.inventory)) { if (loaded.garage.inventory.length !== rawGarage.inventory.length) throw new Error(`slot ${slot + 1}: ${rawGarage.inventory.length} stored gear items became ${loaded.garage.inventory.length} on load`); }
      else if (rawGarage !== undefined && rawGarage !== null) {
        let mirror = null; try { mirror = slot === 0 ? JSON.parse(rawByKey.get('starfighterGarage')) : null; } catch { /* no mirror */ }
        const recovered = Array.isArray(mirror?.inventory) && mirror.equipped && loaded.garage.inventory.length === mirror.inventory.length;
        if (!recovered) throw new Error(`slot ${slot + 1}: a stored garage that is not usable was silently replaced by a fresh one`);
      }
      if (Array.isArray(rawGarage?.inventory) && Number.isFinite(rawGarage.materials) && rawGarage.materials >= 0 && !rawGarage.focusSlot && loaded.garage.materials !== rawGarage.materials) throw new Error(`slot ${slot + 1}: stored spare parts ${rawGarage.materials} became ${loaded.garage.materials}`);
    });
  });
  guard('menu', () => { api.goMenu(); api.renderRunMenu(); api.renderProfileMenu(); });
  guard('menu-screen', () => checkScreen(g));
  guard('profile-shape', () => checkProfile(api));
  guard('mission-select', () => { api.openMissionSelect(); api.renderMissionSelect(); api.goMenu(); });
  guard('loot-guide', () => { api.renderLootGuide(); });
  guard('garage', () => { api.renderGarage(); });
  guard('garage-screen', () => checkScreen(g));
  failures.info = { reasons: unreadableKeys.map(whyUnreadable), unreadable: !!unreadableAtBoot, continued: false, started: false, loadedGear: api.garage.inventory.length, loadedName: String(api.profile.name ?? '') };
  guard('continue', () => { api.goMenu(); api.loadGame(); if (api.state === 'playing') { failures.info.continued = true; api.player.inv = 1e6; for (let i = 0; i < 360; i++) api.update(1 / 120); api.draw(); api.hud(); for (const k of ['x', 'y', 'hp', 'maxHp', 'shield']) finite(api.player[k], 'player.' + k); } });
  guard('continue-screen', () => checkScreen(g));
  guard('new-run', () => { api.goMenu(); api.start('story'); if (api.state === 'playing') { failures.info.started = true; api.player.inv = 1e6; for (let i = 0; i < 360; i++) api.update(1 / 120); api.draw(); api.hud(); for (const k of ['x', 'y', 'hp']) finite(api.player[k], 'player.' + k); } });
  guard('save', () => { api.saveProfile(); });
  guard('storage-keys', () => { for (const key of g.storage.keys()) if (/NaN|undefined|\bnull\b|Infinity/.test(key)) throw new Error('Bad storage key name: ' + key); });
  guard('prototype', () => { if (!vm.runInContext('({}).polluted===undefined&&[].polluted===undefined', g.sandbox)) throw new Error('Object prototype was polluted by stored data'); });
  guard('unreadable-save-preserved', () => {
    for (const key of unreadableKeys) if (g.storage.get(key) !== rawByKey.get(key)) throw new Error('An unreadable save was overwritten in storage: ' + key);
  });
  guard('reload-stable', () => {
    const before = JSON.stringify(api.garage.inventory.map(i => [i.id, i.slot, i.tier, i.power, i.stats])), materials = api.garage.materials;
    const again = createGame({ initialStorage: [...g.storage.entries()] });
    const after = JSON.stringify(again.api.garage.inventory.map(i => [i.id, i.slot, i.tier, i.power, i.stats]));
    if (!unreadableAtBoot && (before !== after || materials !== again.api.garage.materials)) throw new Error('Garage changed across a save and reload');
  });
  return failures;
}

// ---------- run ----------
const started = Date.now(), goldens = goldenSaves(), report = { seed, shard: `${shardIndex}/${shardCount}`, goldens: goldens.map(g => g.label), controls: [], cases: 0, failed: 0, groups: {}, examples: [] };
console.log(`golden saves: ${goldens.map(g => g.label).join(', ')}`);
for (const golden of goldens) {
  const raw = new Map(golden.entries), failures = exercise(golden.entries, raw);
  report.controls.push({ label: golden.label, failures }); console.log(`${failures.length ? 'CONTROL FAIL' : 'control ok  '} ${golden.label}${failures.length ? ' :: ' + failures.map(f => f.stage + ': ' + f.message).join(' ; ') : ''}`);
}
if (report.controls.some(c => c.failures.length)) { console.error('Undamaged saves fail, so the harness or the game has a basic problem; fix that before fuzzing.'); fs.writeFileSync(outFile, JSON.stringify(report, null, 1)); process.exit(2); }
const rand = rng(seed);
for (let n = 0; n < totalCases; n++) {
  const golden = goldens[n % goldens.length], damaged = damage(golden, rand);
  if (n % shardCount !== shardIndex - 1) continue;
  const raw = new Map(damaged.entries), failures = exercise(damaged.entries, raw); report.cases++;
  const info = failures.info || {}; const st = report.stats ||= { unreadableSave: 0, continued: 0, newRunStarted: 0, emptyGarage: 0, byKind: {} };
  for (const why of info.reasons || []) { st.reasons ||= {}; st.reasons[why] = (st.reasons[why] || 0) + 1; if (why === 'other') (report.otherUnreadable ||= []).push({ case: n, golden: golden.label, mutation: damaged.notes.join('; ').slice(0, 200) }); }
  if (info.unreadable) st.unreadableSave++; if (info.continued) st.continued++; if (info.started) st.newRunStarted++; if (!info.loadedGear) st.emptyGarage++;
  (st.byKind[damaged.kind] ||= { cases: 0, unreadable: 0, failed: 0 }).cases++; if (info.unreadable) st.byKind[damaged.kind].unreadable++; if (failures.length) st.byKind[damaged.kind].failed++;
  if (verbose) console.log(`case ${n} ${golden.label} ${damaged.notes.join('; ').slice(0, 110)} -> ${failures.length ? 'FAIL' : 'ok'}`);
  if (failures.length) {
    report.failed++;
    for (const f of failures) { const key = `${f.stage}: ${f.message.replace(/[0-9.]{4,}/g, '#').slice(0, 140)}`; const group = report.groups[key] ||= { count: 0, stage: f.stage, message: f.message, stack: f.stack, examples: [] };
      group.count++; if (group.examples.length < 3) group.examples.push({ case: n, golden: golden.label, kind: damaged.kind, mutation: damaged.notes.join('; ').slice(0, 240) }); }
  }
  if (report.cases % 50 === 0) console.log(`  ${report.cases} cases, ${report.failed} with failures, ${Math.round((Date.now() - started) / 1000)} s`);
}
report.seconds = Math.round((Date.now() - started) / 1000); fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
console.log('stats: ' + JSON.stringify(report.stats));
console.log(`\n${report.cases} damaged saves tried (shard ${report.shard}), ${report.failed} produced failures, ${Object.keys(report.groups).length} distinct problems, ${report.seconds} s`);
for (const [key, group] of Object.entries(report.groups).sort((a, b) => b[1].count - a[1].count)) { console.log(`\n[${group.count}x] ${key}\n    e.g. ${group.examples[0].golden}: ${group.examples[0].mutation}\n    ${group.stack}`); }
process.exitCode = report.failed ? 1 : 0;
