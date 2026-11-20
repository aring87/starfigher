# Friend playtest checkpoint — v159

The six original polish features are implemented. Real player and hardware validation remain. Keep this checkpoint fixed while development continues separately.

## Handoff

Send `releases/v159/Starfighter-Playtest-v159.zip`. It contains the executable, launch instructions, feedback checklist, checksums, build manifest and verification report. Every required game asset, script, music track and font is embedded in the EXE; loose asset folders are unnecessary. Windows 10/11 with Edge or Chrome is required. Python, Node, an account and an internet connection are unnecessary.

The executable opens a dedicated browser app window, stores its saves under `%LOCALAPPDATA%/StarfighterLastSignal/Playtest/Browser`, and serves embedded content only on `127.0.0.1:18765`. It is an unsigned private playtest, not a store release.

## Reviewed before freezing

- The intro names every current keyboard binding or controller button for each action, including alternate fire bindings and remapped movement. Completed intro practice opens the actual Garage for a four-step guided walkthrough, then returns to the same mission briefing before Depart. Empty pilots see a clearly labeled reading example; the guide awards no gear and preserves checkpoints.

- Five First Flight drills pass native practice actions. Completing the core drill reveals a short Story recap: random gear rolls, Garage equipment, named pairs/two- and four-piece sets, one miniboss recovery and three run-perk slots. Support weapons/Delta remain in optional details and advanced practice. Old gear-banking wording is corrected.
- Binding capture allows Tab navigation and Enter activation of Cancel/Clear. Space/Shift still bind; Escape cancels; controller B remains assignable.
- Inner panels fit the playable shell in wide, short windows. Garage columns adapt to shell width; Pause can scroll.
- Fonts and their open-font licenses are bundled. Developer tools, QA pilots and real saves are excluded.

The EXE verifies all 399 content hashes, game/intro entry, audio byte ranges, HEAD handling, content path guards and authenticated page-close/reload signals. Native window inspection stopped because computer-use could not verify the app-mode browser URL; no security barrier was bypassed. Intro and menu fixes have separate native browser evidence.

## First feedback round

Ask the friend to start a fresh Story pilot, play the intro without coaching, then try missions 1–3. Visit the Garage, return to Menu/Load, and close/reopen the EXE once. Use Story; DEV Lab's extra resources do not represent campaign difficulty.

Ask where they first felt confused, bored or unfairly hit. Record mission/boss, weapon color, gear/perks, input device, screen size and repeatable steps or a screenshot/video. The included `FEEDBACK.txt` gives this short route.

## Next roadmap

| Order | Work | Evidence needed |
| --- | --- | --- |
| 1 | Fix friend-reported blockers, save failures and first-run confusion. | Reproduce, fix and repeat each affected flow. |
| 2 | Tune naturally earned pickups/builds and campaign difficulty. | Early, middle and final missions with actual gear/perks; useful mixed/focused builds without an early power spike. |
| 3 | Finish physical controller and human audio review. | Real pad play/rebinding and speaker/headphone audition. |
| 4 | Validate target-machine performance and longer sessions. | Real frame times/memory, window changes and complete campaigns on other computers. |
| 5 | Harden distribution and release presentation. | Windows lifecycle, save compatibility, final art/audio review, signing/distribution and the eventual store/platform plan. |

Veteran Campaign, gear levels and elemental weapon/resistance systems remain deferred until the original validation gate is reviewed. Random rolls, set synergies, permanent Garage gear and the small run perk track remain.

The older v157 executable and ZIP remain frozen as a historical checkpoint. Use **v159** for this feedback round and include that version in reports.

Development v160 continues separately with fair stat-roll sampling and contextual perk information; see [build context review](BUILD_CONTEXT.md). These changes are in the local browser game and do not replace the v159 friend ZIP.

Development v161 adds owned-partner guidance in the Garage and stable camera placement behind frozen screens. [Earned builds review](OWNED_BUILDS.md) includes the 64-pilot guaranteed-reward diagnostic. The v159 friend ZIP is unchanged.

Development v162 reduces native fragment capture work while preserving the existing art and behavior. [Part-break performance](PART_BREAK_PERFORMANCE.md) records the real-pixel validation. This remains a local-browser development change; the v159 friend package is fixed.

Development v163 reuses regular-enemy still poses while preserving exact native animation output. [Enemy-wave performance](ENEMY_WAVE_PERFORMANCE.md) records the 1,776-case pixel check and mixed-wave preparation reduction. It is in the local browser game only; continue using the frozen v159 friend ZIP for this feedback round.

Development v164 removes redundant smoke/debris drag arithmetic while retaining the existing effects. [Effects performance](EFFECTS_PERFORMANCE.md) records the comparison against v163. The friend package remains v159.

Development v165 improves material-preparation CPU work and records a sustained browser review. Experimental rendering/mirror changes were not installed; a first-use armor-break rendering hitch remains a follow-up. [Performance evidence](PART_BREAK_PERFORMANCE.md#sustained-browser-follow-up--v165) separates the production change from those private trials. Continue using the fixed v159 ZIP for friend feedback.

Development v166 batches first-use boss-material readbacks after armor breaks ([performance evidence](PART_BREAK_PERFORMANCE.md#first-use-palette-readback-batching--v166)). It is not in the friend package, which remains the frozen v159 ZIP.

Development v167 extends that batching to the earlier main bosses ([performance evidence](PART_BREAK_PERFORMANCE.md#earlier-boss-readback-batching--v167)). It is also not in the friend package, which remains the frozen v159 ZIP.
