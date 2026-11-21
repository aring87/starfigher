#!/usr/bin/env node
'use strict';
// Contract tests for the v173 UI motion polish in style.css. Presentation only: these checks keep the new animations
// cheap (transform and opacity only), short, in step with the markup, safe for hover states and switched off for
// reduced motion. How it looks and feels still needs eyes; see the notes at the end.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const polish = css.slice(css.indexOf('/* v173 UI motion polish'));
assert.ok(polish.length > 500, 'The polish block must exist');
const rule = (source, selector) => { const i = source.indexOf(selector + ' {'); assert.ok(i >= 0, 'Missing rule ' + selector); return source.slice(i + selector.length + 2, source.indexOf('}', i)); };
const keyframes = name => { const m = polish.match(new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}\\s*\\n`)); assert.ok(m, 'Missing @keyframes ' + name); return m[1]; };

test('the title art moved into two layers with the same picture and the same two scrims, so the resting frame is unchanged', () => {
  const menuRule = css.match(/\n#menu \{ --menu-art:[^\n]*\}/)[0];
  assert.ok(!/background-image|background-size|background-position/.test(menuRule), '#menu no longer paints the art itself');
  assert.match(menuRule, /--menu-art:url\('assets\/menu\/menu-key-art\.png'\)/); assert.match(menuRule, /overflow:hidden/);
  assert.match(css, /#menu \.mission-art \{[^}]*var\(--menu-art\)/, 'Mission cards still use the shared art variable');
  const before = rule(polish, '#menu::before'), after = rule(polish, '#menu::after');
  assert.match(before, /inset:0/); assert.match(before, /background:var\(--menu-art\) center\/cover no-repeat/); assert.match(before, /z-index:-2/); assert.match(before, /animation:menuArtDrift 48s ease-in-out infinite alternate/);
  assert.match(after, /z-index:-1/); assert.match(after, /pointer-events:none/);
  for (const scrim of ['linear-gradient(90deg,#03061180 0%,#03061138 34%,#0306110d 54%,transparent 72%)', 'linear-gradient(0deg,#02040ba8 0%,transparent 20%,transparent 88%,#02040b55 100%)'])
    assert.ok(after.includes(scrim) && fs.readFileSync(path.join(root, 'style.css'), 'utf8').split(scrim).length === 2, 'The scrim exists once, on the overlay layer: ' + scrim);
  assert.match(css, /<?\n\.screen \{[^}]*position:absolute[^}]*z-index:3/, 'A screen is its own stacking context, so the negative z-index layers stay behind the menu content');
});

test('the drift never uncovers an edge of the picture and runs on the compositor', () => {
  const frame = keyframes('menuArtDrift'), scale = Number(frame.match(/scale\(([\d.]+)\)/)[1]), [tx, ty] = frame.match(/translate3d\((-?[\d.]+)%,(-?[\d.]+)%,0\)/).slice(1).map(Number);
  const [ox, oy] = rule(polish, '#menu::before').match(/transform-origin:([\d.]+)% ([\d.]+)%/).slice(1).map(v => Number(v) / 100);
  assert.ok(scale > 1 && scale <= 1.08, 'A gentle push-in: ' + scale);
  for (let u = 0; u <= 1.0001; u += .05) { // linear interpolation, so check along the way as well as at the end
    const s = 1 + (scale - 1) * u, x = tx * u / 100, y = ty * u / 100;
    assert.ok(ox + (0 - ox) * s + x <= 1e-9, 'left edge covered'); assert.ok(ox + (1 - ox) * s + x >= 1 - 1e-9, 'right edge covered');
    assert.ok(oy + (0 - oy) * s + y <= 1e-9, 'top edge covered'); assert.ok(oy + (1 - oy) * s + y >= 1 - 1e-9, 'bottom edge covered');
  }
  assert.ok(!/@keyframes menuArtDrift[^\n]*(left|top|width|height|margin|background-position)/.test(polish), 'No layout or paint properties');
});

test('every new animation changes only transform or opacity', () => {
  for (const name of ['menuArtDrift', 'uiRise', 'uiSlideIn', 'uiFade', 'uiPop', 'uiDialogIn']) {
    const props = [...keyframes(name).matchAll(/([a-z-]+):/g)].map(m => m[1]); assert.ok(props.length && props.every(p => ['opacity', 'transform'].includes(p)), `${name}: ${props}`);
  }
  assert.equal([...polish.matchAll(/will-change:([^;]+)/g)].map(m => m[1]).join(), 'transform', 'will-change appears once, on the drifting art');
});

test('entrances are short: the menu settles inside 1.1 s and every other screen inside 1 s', () => {
  const settle = (selector, count, duration) => { const delays = []; for (let i = 1; i <= count; i++) { const m = polish.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:nth-child\\(${i}\\) \\{ animation-delay:([\\d.]+)s; \\}`)); assert.ok(m, `${selector} child ${i} has a delay`); delays.push(Number(m[1])); }
    assert.deepEqual(delays, [...delays].sort((a, b) => a - b), 'Each item starts after the one before'); assert.equal(new Set(delays).size, delays.length); return delays.at(-1) + duration; };
  const duration = Number(polish.match(/animation:uiRise ([\d.]+)s cubic-bezier/)[1]);
  assert.ok(duration <= .5);
  assert.ok(settle('#menu.active .menu-identity > ', 8, duration) <= 1.1); assert.ok(settle('.mission-briefing-screen.active .briefing-content > ', 8, duration) <= 1.0);
  assert.ok(settle('.mission-select-screen.active .mission-card', 10, duration) <= 1.0); assert.ok(settle('.loot-guide-screen.active .loot-guide-card', 11, duration) <= 1.0);
  assert.match(polish, /#menu\.active \.menu-topline,#menu\.active \.menu-bottomline \{ animation:uiFade \.6s ease-out \.45s backwards; \}/);
  const later = (selector, nth, first, step) => { const delays = nth.map(i => Number(polish.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:nth-child\\(${i}\\) \\{ animation-delay:([\\d.]+)s; \\}`))[1])); assert.deepEqual(delays, delays.map((_, k) => Number((first + step * k).toFixed(2)))); return delays.at(-1) + duration; };
  assert.ok(later('#gameover.active > ', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], .05, .05) <= 1.0, 'Loss screen'); assert.ok(later('.run-complete-screen.active > ', [2, 3, 4, 5], .25, .07) <= 1.0, 'Campaign complete'); assert.ok(later('.upgrade-screen.active .card', [1, 2, 3, 4], .18, .08) <= 1.0, 'Perk and retrofit choices');
  assert.match(polish, /\.run-complete-screen\.active \.completion-seal \{ animation:uiPop \.6s cubic-bezier\(\.2,1\.2,\.3,1\) \.05s backwards; \}/);
});

test('the staggers cover every real child of their containers, and only `backwards` fill is used so hover transforms are never overridden', () => {
  const children = (openTag, selfClosing = /^(br|hr|img|input|meta|link)$/) => { // direct children of the first element that matches openTag
    const start = html.indexOf(openTag); assert.ok(start >= 0, openTag); let i = html.indexOf('>', start) + 1, depth = 0, count = 0; const tag = /<(\/?)([a-z][\w-]*)\b[^>]*?(\/?)>/gi; tag.lastIndex = i;
    for (let m; (m = tag.exec(html));) { if (m[1]) { if (depth === 0) break; depth--; } else if (!m[3] && !selfClosing.test(m[2])) { if (depth === 0) count++; depth++; } else if (depth === 0) count++; }
    return count; };
  assert.equal(children('<div class="menu-identity">'), 8, 'The menu stagger lists 8 items'); assert.equal(children('<div class="briefing-content">'), 8, 'The briefing stagger lists 8 items');
  assert.equal(children('<section id="gameover"'), 10, 'The loss screen stagger lists 10 items'); assert.equal(children('<section id="run-complete"'), 5, 'The campaign-complete stagger covers the seal and 4 items');
  assert.ok(!/animation:[^;}]*\b(both|forwards)\b/.test(polish), 'No forwards fill'); const declared = [...polish.matchAll(/animation:(ui\w+)([^;}]*)/g)]; assert.equal(declared.length, 7, 'Fade, two rise groups, slide, pop, dialog and backdrop fade'); for (const [, name, rest] of declared) assert.ok(/\bbackwards$/.test(rest.trim()), `${name} uses a backwards fill`);
  assert.match(polish, /\.loot-guide-card \{ transition:transform \.18s ease,box-shadow \.18s ease; \}/); assert.match(polish, /\.loot-guide-card:hover \{ transform:translateY/);
});

test('reduced motion switches every new animation off, both through the game setting and the system preference', () => {
  assert.match(css, /\.reduced-motion \*, \.reduced-motion \*::before,\.reduced-motion \*::after \{ animation:none !important; transition:none !important;/, 'The existing global rule, which also reaches the pseudo-element');
  const animated = [...polish.matchAll(/([^\n{}]+) \{ animation:(?:menuArtDrift|uiRise|uiSlideIn|uiFade|uiPop|uiDialogIn)\b/g)].flatMap(m => m[1].split(',')).map(s => s.trim());
  const media = polish.match(/@media \(prefers-reduced-motion: reduce\) \{\n([^\n]+) \{ animation:none !important; \}/); assert.ok(media, 'A prefers-reduced-motion block');
  const covered = media[1].split(',').map(s => s.trim());
  for (const selector of new Set([...animated, '#menu::before'])) assert.ok(covered.includes(selector), 'Reduced motion covers ' + selector);
  assert.match(polish, /\.reduced-motion #flight-deck::backdrop \{ animation:none !important; \}/, 'The backdrop is not reached by the global rule, so it has its own');
  assert.match(fs.readFileSync(path.join(root, 'systems.js'), 'utf8'), /classList\.toggle\('reduced-motion', preferences\.reducedMotion\)/, 'The game still applies the class');
});

test('press feedback exists for the primary buttons and mode cards and never fires on disabled buttons', () => {
  assert.match(polish, /\.primary:active:not\(:disabled\) \{ transform:translateY\(0\) scale\(\.985\)/); assert.match(polish, /\.mode-card:active \{ transform:scale\(\.992\); \}/); assert.match(polish, /\.secondary:hover:not\(:disabled\)/);
});

test('the shipped page points at this stylesheet version', () => {
  assert.match(html, /style\.css\?v=36"/); const tags = new Set([...html.matchAll(/(?:src|href)="[^"?]+\.(?:js|css)\?v=(\d+)"/g)].map(m => m[1]).filter(v => v !== '36' && v !== '1' && v !== '33')); assert.deepEqual([...tags], ['173']);
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) { try { await fn(); console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); } }
  console.log(`${tests.length - failed} UI polish checks passed, ${failed} failed`);
  console.log('Scope: the stylesheet text and markup only. Smoothness, taste and real-device frame rate need a person looking at it.');
  process.exit(failed ? 1 : 0);
})();
