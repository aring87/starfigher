# Save and load audit (v169)

Phase 2 of the roadmap starts with save and load problems. This note records what was tested, what was wrong, what changed and what is still unverified.

## How it was tested

`node tools/fuzz-save-load.cjs [--seed=168] [--cases=800] [--shard=1/4] [--out=file.json]` runs the real game code in the Node test harness against deliberately damaged browser storage. It never touches real browser storage or the real game folder's saves.

- **Starting saves:** ten saves written by the game itself: a fresh pilot, a stocked Garage (every rarity and slot), a veteran pilot with 20 history rows, and seven in-progress run checkpoints (Story mission, post-elite, module and doctrine choices; Rush apex and doctrine; a Replay mission). All ten load, render and continue cleanly before any damage is applied.
- **Damage:** seeded and reproducible. Whole-value garbage (cut-off text, empty, `null`, `NaN`, 200 KB of text, BOM, wrong quotes), per-path edits inside a save (null, delete, wrong type, `1e999`, 2^53, huge arrays, `__proto__` keys, HTML text, swapped fields, duplicated entries), and damage to the settings keys (active pilot, volumes, controls, UI text, the performance log).
- **Per damaged save:** boot, main menu, Profiles, mission select, loot guide, Garage, Continue, 360 simulation steps with drawing and HUD, a new run, an autosave, then reload from what was written.
- **Checks:** no crash; no `NaN`, `undefined`, `[object` or `Infinity` in any on-screen text; gear, totals and player stats stay finite; no storage key with a bad name; no prototype pollution; **a save the game cannot read is never overwritten**; **a save the game accepts does not silently lose gear or spare parts**; a save-and-reload keeps the Garage identical.

## What it found (800 damaged saves, seed 168: 24 failed)

| Problem | Effect for a player |
| --- | --- |
| A damaged active-pilot setting (`abc`, `null`, `[]`) became `NaN` | The Profiles button read "PILOT NaN" and autosave wrote to a key named `starfighterProfileSlotNaN`, so progress was saved where the game never looks again. |
| A gear item with a non-numeric tier, power or stat | Either the whole profile was refused (tier) or the item loaded with `NaN` power or stats, which then flow into combat math. |
| Gear stat names `__proto__`, `constructor` and similar | Treated as real stats (the check accepted inherited names) and became `NaN`. |
| `lifetime` totals that were not numbers, or `lifetime` itself being text | Totals showed `NaN`; text was spread into one field per character. |
| `lastRun` that was not a record, or had missing/bad fields | The Garage line read "WAVE undefined // SCORE undefined". |
| Spare parts, epic-boss counters that were not numbers | `NaN` carried into the Garage and progress screens. |
| A stored garage that was not usable (wrong type) | The profile loaded with an empty garage. The next autosave would have erased the original. |

## What changed in `game.js` (v169)

- `finiteOr(value, fallback)` helper. A non-numeric value becomes the fallback instead of `NaN`. Valid saves are unaffected.
- Active-pilot index: damaged values fall back to the first pilot slot.
- Profile load: `lifetime` totals, spare parts and epic counters are finite and non-negative; `history` keeps only record entries; `lastRun` is a record with finite fields or `null`; `garage.equipped` must be a plain object.
- Gear load: tier, power and stat values fall back instead of `NaN`; only the item's own stat names count (`hasOwnProperty`, not `in`).
- A stored garage that cannot be used is no longer swapped for an empty one. If the first pilot slot still has the legacy garage mirror, the gear is recovered from it. Otherwise the whole profile is treated as unreadable, which the game already handles by protecting and preserving the stored text (a "SESSION SAVE ONLY" notice appears and the stored text is left alone).

Old saves without a garage field (versions before the garage existed) still open normally.

## Results

- Before: 24 of 800 damaged saves failed (seed 168).
- After: 0 of 800 (seed 168) and 0 of 1,600 (seed 2024). Of the 2,400, 155 were refused as unreadable and preserved untouched (not JSON 77, not an object 65, wrong version 5, unusable garage with nothing to recover 6, a profile section replaced by a number 2); 883 reached Continue with an in-progress run.
- Four regression tests added to `tools/verify-game.cjs` (now 147). All four fail on the previous `game.js` and pass on the fix.
- Real browser (the app's built-in browser, on a scratch origin with no existing saves): a profile with a damaged active-pilot value, text `lastRun`, text totals and a gear item with text tier/power and `__proto__` stats loaded as "PROFILES // QA DAMAGED"; the Garage showed "NO SAVED COMBAT RECORD YET"; the stored text was unchanged. No run was played there, so the storage-key fix itself is covered by the Node tests, not by this browser check. The scratch data was removed afterward.

## Limits

- The fuzzer runs the game's real code against a mocked browser (mocked canvas, audio and `localStorage`). It does not test real quota errors, private-window blocking, two tabs saving at once, or a browser crash in the middle of a write.
- It only reaches damage that survives `JSON.parse`; truncated text is covered as whole-value garbage.
- Valid-looking but unfair data (for example 9,999 spare parts, or gear with maximum stats) is not treated as damage and is not changed.
- A save the game refuses stays in storage untouched, but this audit did not examine what a player sees and can do with that slot afterward (the Profiles screen, deleting it, or starting a new pilot there, which stays session-only while the damaged text is protected). There is no repair or "export damaged save" tool.
- No friend has used the performance log or hit a real save problem yet. This audit covers what can be proven without humans; it does not replace the friend playtest.
