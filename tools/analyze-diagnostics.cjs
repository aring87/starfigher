#!/usr/bin/env node
'use strict';
// Summarize one or more Starfighter diagnostics files (saved with SAVE FILE in Flight Manual).
// Usage: node tools/analyze-diagnostics.cjs <file.json> [more.json ...] [--json] [--top=10]
// Read-only. Frame times are rendered-frame intervals in milliseconds; "hitch" means an interval of
// 34 ms or more (two or more 60 Hz frames) or one frame whose own update or draw work took 20 ms or more.
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const top = Number((args.find(a => a.startsWith('--top=')) || '--top=10').split('=')[1]) || 10;
const files = args.filter(a => !a.startsWith('--'));
if (!files.length) { console.error('Usage: node tools/analyze-diagnostics.cjs <file.json> [more.json ...] [--json] [--top=10]'); process.exit(2); }

const n1 = v => v == null ? '-' : (Math.round(v * 10) / 10).toString();
const pad = (v, w, right = false) => right ? String(v).padStart(w) : String(v).padEnd(w);
const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;

function load(file) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); }
  catch (error) { throw new Error(`${file}: not readable JSON (${error.message})`); }
  if (data?.schema !== 1 || !Array.isArray(data.sessions)) throw new Error(`${file}: not a Starfighter diagnostics file (schema 1 expected)`);
  return data;
}

function analyzeFile(file) {
  const data = load(file), label = path.basename(file), sessions = data.sessions.filter(s => s.frames > 0);
  const events = new Map(), encounters = new Map();
  const totals = { frames: 0, playedSec: 0, ms34: 0, ms50: 0, ms100: 0, work20: 0, errors: 0, parts: 0 };
  for (const s of data.sessions) {
    totals.frames += s.frames; totals.playedSec += s.playedSec || 0; totals.ms34 += s.slow?.ms34 || 0; totals.ms50 += s.slow?.ms50 || 0;
    totals.ms100 += s.slow?.ms100 || 0; totals.work20 += s.slow?.work20 || 0; totals.errors += s.errorCount || 0; totals.parts += s.marks?.['part-break'] || 0;
    for (const e of [...(s.worst || []), ...(s.recent || [])]) events.set(`${s.id}:${e.t}:${e.interval}`, { ...e, session: s.id });
    for (const [key, e] of Object.entries(s.encounters || {})) {
      const m = encounters.get(key) || { key, frames: 0, intervalSum: 0, drawSum: 0, slow34: 0, slow50: 0, worstInterval: 0, worstDraw: 0 };
      m.frames += e.frames; m.intervalSum += e.meanInterval * e.frames; m.drawSum += e.meanDraw * e.frames; m.slow34 += e.slow34; m.slow50 += e.slow50;
      m.worstInterval = Math.max(m.worstInterval, e.worstInterval); m.worstDraw = Math.max(m.worstDraw, e.worstDraw); encounters.set(key, m);
    }
  }
  const eventList = [...events.values()];
  const nearBreak = eventList.filter(e => e.sinceMark && e.sinceMark['part-break'] != null);
  const heap = sessions.map(s => s.heap).filter(h => h && h.samples?.length > 1);
  const heapGrowth = heap.map(h => ({ firstMB: h.firstMB, lastMB: h.lastMB, maxMB: h.maxMB, minutes: (h.samples.at(-1).t - h.samples[0].t) / 60 }))
    .map(h => ({ ...h, perHour: h.minutes > 0 ? (h.lastMB - h.firstMB) / h.minutes * 60 : 0 }));
  return {
    file: label, build: data.build, generatedAt: data.generatedAt, environment: data.environment, settings: data.settings, recording: data.recording,
    totals: { ...totals, playedMin: totals.playedSec / 60, sessions: data.sessions.length, avgFps: totals.playedSec ? totals.frames / totals.playedSec : null,
      hitchesPerMin: totals.playedSec ? totals.ms34 / (totals.playedSec / 60) : 0 },
    sessions: data.sessions.map(s => ({ id: s.id, startedAt: s.startedAt, playedMin: (s.playedSec || 0) / 60, frames: s.frames, fps: s.playedSec ? s.frames / s.playedSec : null,
      p50: s.interval?.p50, p95: s.interval?.p95, p99: s.interval?.p99, max: s.interval?.max, drawP95: s.draw?.p95, drawMax: s.draw?.max, updateP95: s.update?.p95,
      ms34: s.slow?.ms34, ms50: s.slow?.ms50, ms100: s.slow?.ms100, work20: s.slow?.work20, heapFirst: s.heap?.firstMB, heapLast: s.heap?.lastMB, errors: s.errorCount })),
    encounters: [...encounters.values()].map(e => ({ ...e, meanInterval: e.intervalSum / Math.max(1, e.frames), meanDraw: e.drawSum / Math.max(1, e.frames), hitchPer1000: e.slow34 / Math.max(1, e.frames) * 1000 }))
      .sort((a, b) => b.hitchPer1000 - a.hitchPer1000 || b.worstInterval - a.worstInterval),
    worst: eventList.sort((a, b) => Math.max(b.interval, b.draw, b.update) - Math.max(a.interval, a.draw, a.update)).slice(0, top),
    partBreak: { marked: totals.parts, hitchesRecorded: eventList.length, withinWindow: nearBreak.length, share: pct(nearBreak.length, eventList.length) },
    heapGrowth,
    errors: data.sessions.flatMap(s => (s.errors || []).map(e => ({ session: s.id, ...e }))).slice(0, 20),
  };
}

function hints(r) {
  const out = [], t = r.totals, worstSession = r.sessions.reduce((a, s) => (s.p95 || 0) > (a?.p95 || 0) ? s : a, null);
  if (!t.frames) return ['No frames were recorded. Ask your friend to turn on the Diagnostics log before playing.'];
  if (t.avgFps && t.avgFps < 45) out.push(`Average frame rate is only ${n1(t.avgFps)} fps; the machine is likely below the game's comfortable range.`);
  if (worstSession?.p95 > 25) out.push(`95th-percentile frame time reached ${n1(worstSession.p95)} ms in session ${worstSession.id}; frames often took longer than 40 fps allows.`);
  if (t.playedMin < 3) out.push(`Only ${n1(t.playedMin)} minutes were recorded, so rates are rough; ask for a longer session before drawing conclusions.`);
  else if (t.hitchesPerMin > 2) out.push(`${n1(t.hitchesPerMin)} hitches per minute is high; look at the encounter table for where they cluster.`);
  if (t.ms100 > 0) out.push(`${t.ms100} freeze${t.ms100 === 1 ? '' : 's'} of 100 ms or more ${t.ms100 === 1 ? 'was' : 'were'} recorded (worst interval ${n1(Math.max(...r.sessions.map(s => s.max || 0)))} ms).`);
  if (r.partBreak.hitchesRecorded >= 5 && r.partBreak.share >= 40) out.push(`${r.partBreak.share}% of recorded hitches fell within 5 s of a boss part break; the first-break cost is the likely cause.`);
  for (const h of r.heapGrowth) if (h.perHour > 150 && h.minutes >= 10) out.push(`JavaScript memory grew ${n1(h.firstMB)} -> ${n1(h.lastMB)} MB over ${n1(h.minutes)} min (about ${n1(h.perHour)} MB/hour); worth a long-session check.`);
  if (t.errors) out.push(`${t.errors} script error${t.errors === 1 ? '' : 's'} were logged (listed below).`);
  if (!out.length) out.push('Nothing stands out: frame times, hitch rate, memory and errors are all within the expected range.');
  return out;
}

function print(r) {
  const e = r.environment || {}, line = '='.repeat(78);
  console.log(`${line}\n${r.file}  build ${r.build}  saved ${r.generatedAt}`);
  console.log(`System: ${e.userAgent || '?'}`);
  console.log(`  ${e.cpuThreads ?? '?'} CPU threads, ${e.deviceMemoryGB ?? '?'} GB reported memory, screen ${(e.screen || []).join('x')}, window ${(e.window || []).join('x')}, pixel ratio ${e.pixelRatio}, game canvas ${(e.canvas || []).join('x')}${e.fullscreen ? ' (fullscreen)' : ''}`);
  const st = r.settings || {};
  console.log(`  Settings: reduced motion ${st.reducedMotion}, clear combat ${st.clearCombat}, text ${st.uiText}, input ${st.inputDevice}, muted ${st.muted}`);
  const t = r.totals;
  console.log(`\nPlayed ${n1(t.playedMin)} min over ${t.sessions} session${t.sessions === 1 ? '' : 's'}: ${t.frames.toLocaleString()} frames, average ${n1(t.avgFps)} fps, ${t.ms34} hitches (${n1(t.hitchesPerMin)}/min), ${t.ms50} over 50 ms, ${t.ms100} over 100 ms.`);
  console.log('\nSessions (frame interval in ms; draw = time spent drawing)');
  console.log(pad('id', 4) + pad('min', 7, 1) + pad('fps', 7, 1) + pad('p50', 6, 1) + pad('p95', 6, 1) + pad('p99', 6, 1) + pad('max', 8, 1) + pad('drawP95', 9, 1) + pad('>34', 6, 1) + pad('>50', 6, 1) + pad('>100', 6, 1) + pad('heap MB', 14, 1) + pad('err', 5, 1));
  for (const s of r.sessions) console.log(pad(s.id, 4) + pad(n1(s.playedMin), 7, 1) + pad(n1(s.fps), 7, 1) + pad(n1(s.p50), 6, 1) + pad(n1(s.p95), 6, 1) + pad(n1(s.p99), 6, 1) + pad(n1(s.max), 8, 1) + pad(n1(s.drawP95), 9, 1) + pad(s.ms34 ?? 0, 6, 1) + pad(s.ms50 ?? 0, 6, 1) + pad(s.ms100 ?? 0, 6, 1) + pad(s.heapFirst == null ? '-' : `${n1(s.heapFirst)}>${n1(s.heapLast)}`, 14, 1) + pad(s.errors ?? 0, 5, 1));
  console.log('\nWhere the hitches are (by encounter; "boss:5:p2" = boss 5, phase 2; "field:story:3" = mission 3 flying)');
  console.log(pad('encounter', 18) + pad('frames', 8, 1) + pad('mean ms', 9, 1) + pad('draw ms', 9, 1) + pad('>34', 6, 1) + pad('>50', 6, 1) + pad('per 1000', 10, 1) + pad('worst', 8, 1));
  for (const x of r.encounters.slice(0, 14)) console.log(pad(x.key, 18) + pad(x.frames, 8, 1) + pad(n1(x.meanInterval), 9, 1) + pad(n1(x.meanDraw), 9, 1) + pad(x.slow34, 6, 1) + pad(x.slow50, 6, 1) + pad(n1(x.hitchPer1000), 10, 1) + pad(n1(x.worstInterval), 8, 1));
  console.log(`\nWorst ${r.worst.length} hitches`);
  for (const w of r.worst) {
    const c = w.ctx || {}, b = c.boss, brk = w.sinceMark?.['part-break'];
    console.log(`  s${w.session} @${n1(w.t)}s  ${n1(w.interval)} ms interval, draw ${n1(w.draw)}, update ${n1(w.update)}  ${w.key}${brk != null ? `  ${Math.round(brk)} ms after a part break` : ''}`);
    console.log(`     ${c.state || '?'}${b ? `, boss ${b.type} phase ${b.phase} hp ${b.hp}` : ''}; enemies ${c.enemies ?? '?'}, shots ${c.enemyShots ?? '?'}, particles ${c.particles ?? '?'}, debris ${c.debris ?? '?'}, fragments ${c.fragments ?? '?'}, palettes cached ${c.paletteCache ?? '?'}`);
  }
  const pb = r.partBreak;
  console.log(`\nPart breaks: ${pb.marked} marked; ${pb.withinWindow} of ${pb.hitchesRecorded} recorded hitches (${pb.share}%) fell within 5 s of one.`);
  if (r.heapGrowth.length) console.log('Memory: ' + r.heapGrowth.map(h => `${n1(h.firstMB)} -> ${n1(h.lastMB)} MB (max ${n1(h.maxMB)}) over ${n1(h.minutes)} min`).join('; '));
  if (r.errors.length) { console.log('\nScript errors'); for (const x of r.errors) console.log(`  s${x.session} @${n1(x.t)}s ${x.file || ''}${x.line ? ':' + x.line : ''}  ${x.message}`); }
  console.log('\nReading this');
  for (const h of hints(r)) console.log('  - ' + h);
  console.log();
}

try {
  const reports = files.map(analyzeFile);
  if (asJson) console.log(JSON.stringify(reports, null, 2));
  else reports.forEach(print);
} catch (error) { console.error(error.message); process.exit(1); }
