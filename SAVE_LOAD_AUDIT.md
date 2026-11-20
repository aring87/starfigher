# Save and load audit (v169 and v170)

Phase 2 of the roadmap starts with save and load problems. This note records what was tested, what was wrong, what changed and what is still unverified.

## How it was tested

`node tools/fuzz-save-load.cjs [--seed=168] [--cases=800] [--batch=200] [--shard=1/2] [--out=file.json]` runs the real game code in the Node test harness against deliberately damaged browser storage. It never touches real browser storage or the real game folder's saves. Use `--batch` for anything over a few hundred cases: the harness keeps every game it boots alive (about 7 MB per case), so one long process runs out of memory near 600 cases, and several at once can freeze a PC. `--batch` runs child processes of that many cases and merges their reports; run at most two shards at a time.

- **Starting saves:** ten saves written by the game itself: a fresh pilot, a stocked Garage (every rarity and slot), a veteran pilot with 20 history rows, and seven in-progress run checkpoints (Story mission, post-elite, module and doctrine choices; Rush apex and doctrine; a Replay mission). All ten load, render and continue cleanly before any damage is applied.
- **Damage:** seeded. Whole-value garbage (cut-off text, empty, `null`, `NaN`, 200 KB of text, BOM, wrong quotes), per-path edits inside a save (null, delete, wrong type, `1e999`, 2^53, huge arrays, `__proto__` keys, HTML text, swapped fields, duplicated entries), and damage to the settings keys (active pilot, volumes, controls, UI text, the performance log). The starting saves freeze the game's clock and randomness, so a case number reproduces exactly (two repeat runs give identical per-case logs). The first runs were seeded in the damage plan only, so their case numbers do not reproduce; their totals below still stand as counts.
- **Per damaged save:** boot, main menu, Profiles, mission select, loot guide, Garage, Continue, 360 simulation steps with drawing and HUD, a new run, an autosave, then reload from what was written.
- **Checks:** no crash; no `NaN`, `undefined`, `[object` or `Infinity` in any on-screen text (a name the player typed is shown as typed); gear, totals and player stats stay finite; no storage key with a bad name; no prototype pollution; **a save the game cannot read is never overwritten**; **a save the game accepts does not silently lose gear or spare parts**; **a refused save is shown as damaged, locked for new games and clearable, never passed off as an empty slot**; a save-and-reload keeps the Garage identical.

## What it found

The first run (800 damaged saves, seed 168) failed on 24; a later 2,400-save run found one more kind. Eight defects in all:

| Problem | Effect for a player |
| --- | --- |
| A damaged active-pilot setting (`abc`, `null`, `[]`) became `NaN` | The Profiles button read "PILOT NaN" and autosave wrote to a key named `starfighterProfileSlotNaN`, so progress was saved where the game never looks again. |
| A gear item with a non-numeric tier, power or stat | Either the whole profile was refused (tier) or the item loaded with `NaN` power or stats, which then flow into combat math. |
| Gear stat names `__proto__`, `constructor` and similar | Treated as real stats (the check accepted inherited names) and became `NaN`. |
| `lifetime` totals that were not numbers, or `lifetime` itself being text | Totals showed `NaN`; text was spread into one field per character. |
| `lastRun` that was not a record, or had missing/bad fields | The Garage line read "WAVE undefined // SCORE undefined". |
| Spare parts, epic-boss counters that were not numbers | `NaN` carried into the Garage and progress screens. |
| A stored garage that was not usable (wrong type) | The profile loaded with an empty garage. The next autosave would have erased the original. |
| A pilot, Garage bay or gear name, id or source that was not text | Showed "[object Object]" (and gave several gear items the same id). Found by the 2,400-save run. |

## What changed in `game.js`

**v169: what loads.**

- `finiteOr(value, fallback)` helper. A non-numeric value becomes the fallback instead of `NaN`. Valid saves are unaffected.
- Active-pilot index: damaged values fall back to the first pilot slot.
- Profile load: `lifetime` totals, spare parts and epic counters are finite and non-negative; `history` keeps only record entries; `lastRun` is a record with finite fields or `null`; `garage.equipped` must be a plain object.
- Gear load: tier, power and stat values fall back instead of `NaN`; only the item's own stat names count (`hasOwnProperty`, not `in`).
- A stored garage that cannot be used is no longer swapped for an empty one. If the first pilot slot still has the legacy garage mirror, the gear is recovered from it. Otherwise the whole profile is treated as unreadable, which the game already handles by protecting and preserving the stored text (a "SESSION SAVE ONLY" notice appears and the stored text is left alone).

Old saves without a garage field (versions before the garage existed) still open normally.

**v170: names, and what a refused save looks like.**

- `textOr(value, fallback)` helper. A pilot, bay, gear name, id or source counts only if it is text or a finite number; anything else falls back to the default ("PILOT 01", "LAST SIGNAL BAY", the usual gear name, a fresh id). Real names are unchanged.
- **Before:** a save the game could not read was drawn as "SLOT 02 // EMPTY" with CREATE NEW GAME. Choosing it made a pilot that lived only in memory (the damaged text is protected and never overwritten), so progress vanished on reload while the slot looked normal. The delete button was hidden for it, so the slot could never be reclaimed, and "new pilot" could pick such a slot as the free one.
- **Now:** the slot reads "DAMAGED SAVE // COULD NOT BE READ // KEPT UNTOUCHED // CLEAR IT TO REUSE THIS SLOT" with a dashed pink frame. Its select button reads SLOT LOCKED and is disabled; the other button reads CLEAR DAMAGED SAVE and asks for confirmation. Selecting the slot explains itself and changes nothing. New pilots skip damaged slots.
- Clearing removes the damaged text (for slot 1 also its legacy copies). The "SESSION SAVE ONLY" notice disappears once no protected save remains and storage itself has not failed; if storage really is failing, the notice stays.
- The stylesheet has its own cache tag (`style.css?v=`), now 33, so browsers pick up the new styling.

## Results

- **Before the fixes (v168 code):** 24 of 800 damaged saves failed (seed 168).
- **After the v169 fixes:** 0 of 800 (seed 168) and 0 of 1,600 (seed 2024).
- **Final code (v170):** 2,400 damaged saves (seed 2025, reproducible), 0 failures. 172 were refused as unreadable, kept untouched and shown as damaged (not JSON 93, not an object 61, wrong version 9, unusable garage with nothing to recover 8, a profile section replaced by a number 1); 891 reached Continue with an in-progress run.
- **Tests:** `tools/verify-game.cjs` went from 143 to 152 tests, nine of them about saving and loading. The first four (v169) fail on the previous `game.js` and pass on the fix. The v170 ones were written together with their changes and were not run against older code. All eleven front-end suites pass.
- **Real browser** (the app's built-in browser, on a scratch origin with no existing saves): a profile with text lifetime totals, a text `lastRun`, a damaged active-pilot value and gear with text tier and `__proto__` stats loaded as a normal pilot with a readable Garage. A damaged second slot showed as DAMAGED SAVE with the locked and clear buttons, and clearing it emptied the slot, removed the notice and left no stored data. The scratch data was removed afterward.

## Limits

- The fuzzer runs the game's real code against a mocked browser (mocked canvas, audio and `localStorage`). It does not test real quota errors, private-window blocking, two tabs saving at once, or a browser crash in the middle of a write.
- It only reaches damage that survives `JSON.parse`; truncated text is covered as whole-value garbage.
- Valid-looking but unfair data (for example 9,999 spare parts, or gear with maximum stats) is not treated as damage and is not changed.
- Not examined: two gear items that share an id (a duplicated entry loads as two items); how the Profiles screen looks on very narrow screens; whether a gamepad or keyboard can reach the CLEAR DAMAGED SAVE button.
- CLEAR DAMAGED SAVE is permanent after the confirmation. There is still no way to export a damaged save first or repair one.
- No friend has used the performance log or hit a real save problem yet. This audit covers what can be proven without humans; it does not replace the friend playtest.
