# Friend playtest checkpoints — v168 (current) and v159 (earlier)

The six original polish features are implemented. Real player and hardware validation remain. Keep each checkpoint fixed while development continues separately.

**Current package: v168** (built November 20, 2026). It carries everything since v159 (development v160–v168) and adds an opt-in, local-only performance log so friends can send frame-time data back with their feedback. The v159 package below remains frozen as the earlier checkpoint.

## Handoff

Send `releases/v168/Starfighter-Playtest-v168.zip` (382.9 MiB, SHA256 `2674490f7e25b487c93c070c1fc1a0477907e430cd1470f1eebaf52cb50a8dd9`). It contains the executable (SHA256 `4cc21f2d8cc6806c416b4679bfb4092841a24ab77d630100bee51ca02ba2825b`), launch instructions, feedback checklist, checksums, build manifest, verification report and roadmap. The earlier frozen package is `releases/v159/Starfighter-Playtest-v159.zip`. Every required game asset, script, music track and font is embedded in the EXE; loose asset folders are unnecessary. Windows 10/11 with Edge or Chrome is required. Python, Node, an account and an internet connection are unnecessary.

The executable opens a dedicated browser app window, stores its saves under `%LOCALAPPDATA%/StarfighterLastSignal/Playtest/Browser`, and serves embedded content only on `127.0.0.1:18765`. It is an unsigned private playtest, not a store release.

## What v168 adds since v159

- **Gameplay and clarity (v160–v161):** fairer stat-roll sampling for newly dropped gear (saved rolls are unchanged), contextual perk information, owned-partner guidance in the Garage and a stable camera behind frozen screens.
- **Smoother boss fights (v162–v167):** less work when armor parts break, cached regular-enemy poses, cheaper effects, faster boss material preparation and batched first-use readbacks for bosses 2–10. Art and combat rules are unchanged; the strict pixel comparison against v165 is 1,342/1,342 exact.
- **Opt-in performance log (v168):** Flight Manual > 04 PERFORMANCE LOG. Off by default; nothing is sent anywhere.

## Using the performance log

Ask your friend to tick **DIAGNOSTICS LOG** in the Flight Manual (main menu) before playing, then press **SAVE FILE** afterwards and send you the file (**COPY TEXT** works if saving fails; **CLEAR** deletes it). The log records frame timing, hitches with a little context (which boss and phase, enemy, shot and particle counts, palette cache size, distance from the last boss part break), memory samples every 15 seconds, script errors, screen and window size, CPU thread count and browser version. It never records saves, names, equipment, file paths or the page address, and Flight School practice is never logged. It keeps the last five sessions on that computer, so a file sent after several plays covers them all. Its cost is about 0.1 microsecond per frame.

To read a file: `node tools/analyze-diagnostics.cjs path\to\file.json` (add more files to compare friends, `--json` for raw output). It prints the system, per-session frame times, hitches by boss and phase, the worst hitches with context, how many fell within five seconds of a part break, memory growth, errors, and plain-language hints. Hitch means an interval of 34 ms or more or one frame whose own work took 20 ms or more. A short session gives only rough rates.

## Reviewed before freezing — v168

- The EXE's own self-test passed against a scratch data folder: 400 content hashes, game and intro entry, audio byte ranges, HEAD handling, path-traversal rejection and authenticated page-close/reload. The payload adds one file (`diagnostics.js`) to v159's 399.
- Front-end suites (exit status and count from each suite's own summary): game 143, diagnostics 19, controlsIntegration 15, trainingController 25, trainingIntegration 29, introBindings 6, introRecap 3, garageIntro 8, retryRefit 11, lossRetry 13.
- Browser review of the packaged payload: PLAYTEST v168 label, all script tags at v168, the log off by default and storing nothing until ticked, a real click turning it on, and a Dev Lab Rift Wraith fight recording 2,347 frames with 0 errors and a captured hitch with context.
- Not verified: the SAVE FILE download was tested with an injected download hook and against in-page storage, not clicked in the packaged window; the native Windows app window was not inspected; the controller path is simulated.
- One pre-existing pacing test (random stage hazards in a post-elite run) failed once in roughly 17 full runs and has not reproduced; it was not changed.

## Reviewed before freezing — v159

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

The older v157 and v159 executables and ZIPs remain frozen as historical checkpoints. Use **v168** for this feedback round and include that version in reports.

Development v160 continues separately with fair stat-roll sampling and contextual perk information; see [build context review](BUILD_CONTEXT.md). These changes are included in the v168 friend package.

Development v161 adds owned-partner guidance in the Garage and stable camera placement behind frozen screens. [Earned builds review](OWNED_BUILDS.md) includes the 64-pilot guaranteed-reward diagnostic. Included in the v168 friend package.

Development v162 reduces native fragment capture work while preserving the existing art and behavior. [Part-break performance](PART_BREAK_PERFORMANCE.md) records the real-pixel validation. Included in the v168 friend package.

Development v163 reuses regular-enemy still poses while preserving exact native animation output. [Enemy-wave performance](ENEMY_WAVE_PERFORMANCE.md) records the 1,776-case pixel check and mixed-wave preparation reduction. Included in the v168 friend package.

Development v164 removes redundant smoke/debris drag arithmetic while retaining the existing effects. [Effects performance](EFFECTS_PERFORMANCE.md) records the comparison against v163. Included in the v168 friend package.

Development v165 improves material-preparation CPU work and records a sustained browser review. Experimental rendering/mirror changes were not installed; a first-use armor-break rendering hitch remains a follow-up. [Performance evidence](PART_BREAK_PERFORMANCE.md#sustained-browser-follow-up--v165) separates the production change from those private trials. Included in the v168 friend package.

Development v166 batches first-use boss-material readbacks after armor breaks ([performance evidence](PART_BREAK_PERFORMANCE.md#first-use-palette-readback-batching--v166)). Included in the v168 friend package.

Development v167 extends that batching to the earlier main bosses ([performance evidence](PART_BREAK_PERFORMANCE.md#earlier-boss-readback-batching--v167)). Included in the v168 friend package.

Development v168 adds the opt-in local performance log and the analysis script described above, and is the build in the v168 friend package. The log touches only the game loop and one boss part-break flag; the strict pixel comparison of the final `game.js` against v165 is 1,342/1,342 exact with every canvas CPU-backed.
