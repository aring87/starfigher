# Original polish roadmap

Veteran Campaign is deferred until this roadmap is finished. Gear levels, additional modes and elemental status effects are not part of the current readability pass.

## Updated roadmap — as of v167 (November 20, 2026)

All six original polish priorities (table below) are implemented. What remains is validation with real people and devices, then release readiness. Since the last roadmap: v160–v161 clarified gear rolls and owned builds; v162–v167 reduced part-break and effect costs, with bosses 3–10 now batching their first-use material readbacks (Bloodstar and minibosses are not batched); and the project is on GitHub.

**Performance work is paused after v167.** A boss part break now costs one slow frame (about 30–40 ms, roughly two dropped frames at 60 fps) the first time a part breaks in a fight. Most of what remains is unattributed and probably first-use GPU work. Removing it would mean pre-warming, which moves cost rather than removing it, and everything so far was measured on one machine. Resume only if Phase 1 shows stutter, starting with measurement and no behavior change. See [Performance evidence](PART_BREAK_PERFORMANCE.md#earlier-boss-readback-batching--v167).

### Phase 1: human feedback (needs you or friends; no code)

1. **Friend playtest of the v168 ZIP** (turn on the performance log and send the saved file). Ask for a fresh Story pilot, the intro without coaching, missions 1–3, the Garage, Menu/Load, and closing and reopening the EXE. Ask friends to report the mission or boss, kit and build, input device, screen size, and reproduction steps. See [Friend playtest](FRIEND_PLAYTEST.md).
2. **Your own Story playthrough** of early, middle and final missions using only earned gear. Note where it is too easy or too hard, how clear each boss is, and how quickly gear drops. See [Campaign playtesting](CAMPAIGN_PLAYTEST.md).
3. **Physical controller test:** menus, remapping, disconnects, and whether intro text shows the real bindings.
4. **Speaker and headphone listening:** the mix, the critical cues, and the music fade into boss music.
5. **Older-PC test:** watch boss part breaks for stutter (the real performance test), memory over 30+ minutes, and window resize and fullscreen.

### Phase 2: fixes from that feedback

- Fix blockers, save and load problems, and first-run confusion. **Save/load audit done in v169 and v170** (thousands of deliberately damaged saves; eight defects fixed, damaged saves now shown and clearable in Profiles, nine regression tests; see [SAVE_LOAD_AUDIT.md](SAVE_LOAD_AUDIT.md)). Real friend-reported blockers and first-run confusion are still to come from Phase 1.
- Tune difficulty only from human data, not before.
- Fix controller and audio issues. New sounds come with ready-to-use ElevenLabs and Suno prompts.
- Resume performance work only if Phase 1 shows stutter.
- A new friend build (v168) was cut on November 20, 2026 with everything since v159 and the performance log. Keep it fixed while feedback comes in; cut another only after fixes.

### Phase 3: release readiness (later)

- **Windows distribution:** the unsigned EXE will trigger SmartScreen and antivirus warnings; consider code signing, install and uninstall behavior, and Windows 10/11 with Edge or Chrome.
- **Rights check** on the supplied `Space Blaster.wav`, the menu art and any AI-generated audio (the One Ring Productions sting in `assets/studio/` is a Suno take; check Suno's terms for the owner's plan), before the repository goes public or the game goes to a store.
- **Spotify option (v171) must stay out of any sold build.** Spotify's Developer Policy restricts games and commercial use (see [SPOTIFY.md](SPOTIFY.md)); the default Windows build already leaves it out. Keep it that way for a store release.
- **Final art and audio review,** then store or platform requirements. A price around $5 has been discussed; there is no store-ready claim.

### Deferred until this roadmap is complete

Veteran Campaign, gear levels, elemental damage and resistances, and additional modes.

### Housekeeping, any time

- Commit and push documentation updates, including the v168 changes (the friend ZIP itself stays out of the repository).
- Decide whether the GitHub repository is public or private.
- README and performance-note links into `artifacts/` do not resolve on GitHub (that folder is not in the repository); relink them or include a few key reports.
- `git gc --prune=now` would reclaim about 3.7 GB of unreachable local objects.
- The friend ZIP can be attached to a GitHub Release (the file limit there is 2 GB).

## Original priorities

The original priorities remain in this order:

The **v168 Windows friend playtest** (with an opt-in performance log; the earlier v159 package stays frozen) is the next review checkpoint. [Friend playtest and next roadmap](FRIEND_PLAYTEST.md) records the handoff, remaining validation and feedback priorities. Development continues separately; keep the friend build fixed.

| Priority | Work | Status |
| --- | --- | --- |
| 1 | Short first flight; explain advanced systems when earned | Shipped: five essential intro drills, optional full Flight School, contextual guidance. |
| 2 | Clear build choices with useful comparisons and trade-offs | Shipped: optional item details, set progress, readable replacement costs, three-slot run perks and miniboss recovery. Random rolls and gear sets remain. |
| 3 | Combat visual hierarchy | Shipped in v147: scenery behind gameplay, stronger hostile-shot separation, visible fighter and smoke that yields around exposed cores. All ten environments reviewed in normal and Clear Combat views. |
| 4 | Distinct boss tactics and strategically useful part breaks | Shipped in v148: authored weapon supports across all 22 encounters; destroyed assemblies remove assigned salvos or lanes. Arrival hints and brief disable feedback explain the effect. |
| 5 | Encounter rhythm and measured difficulty | Implemented in v149; v153 begins the fairness follow-up with steadier Bloodstar exposure and first-support drought protection. Fresh-player campaign validation remains open. |
| 6 | Sound, controls, text size and fast retry | Implemented in v150: critical-cue priority, distinct armor/core feedback, Standard/Large UI text and explained checkpoint retry. Controller/remapping already shipped. Human audio audition and physical-controller validation remain open. |

## Completed pass: combat readability

- Keep the existing round blockable bullets and angular piercing shots recognizable by shape as well as color.
- Put scenery and cosmetic dressing beneath live hazards, actors and bullets. Keep HUD and encounter notices above gameplay.
- Preserve attached native boss materials, including animation registration and destroyed parts. Readability changes must not add floating weak-point markers or a ship charge circle.
- Thin decorative smoke around the fighter and exposed intact cores; keep damage smoke visible elsewhere, with its existing emission and attachment behavior.
- Preserve enemy health, shot timing, collisions, loot, gear and saved builds.
- Verify all ten environments, the full boss roster's moving core coordinates, normal/Clear Combat/Reduced Motion settings and isolated Art Inspector previews.

Automated checks establish ordering, geometry and compatibility. Human playtesting remains necessary to judge first-run understanding, overall difficulty and whether each boss teaches its intended response.

## Completed pass: boss tactical identities

Each encounter has a concise arrival hint and explicit support groups for its outer weapons. Paired side cannons stop their own salvo; other assemblies remove assigned packets from existing fans, rings, homing groups, walls or rain. Surviving shots keep their original trajectories and attack cadence. Shared assemblies wait for every support to break. Hydra's middle head controls its beam, including an already charging or active beam. Existing launched projectiles remain active.

See [Boss tactics](BOSS_TACTICS.md) for the roster and validation boundary.

The v154 fairness review corrects phase-finish contact ordering, ritual homing ownership, repeated guardian piercing hits and fast-core temporal misses. All 22 encounters and 38 phases are covered by guarded moving-core regressions. The current native poses, hit radii, health and attack budgets stay in place. A private Story-rules review now includes both secret bosses and direct ritual starts; see [Encounter review](ENCOUNTER_REVIEW.md). This does not close fresh-player fairness or real-device performance validation.

v155 extends interaction fairness into field flight: shot/Force destruction resolves before spent-debris contact, and delayed readiness help waits for an actual shield or full Delta meter. Native and browser cases verify both while preserving field clocks and progression. See [Field clarity](FIELD_CLARITY.md). Human campaign and device validation remain open.

v156 secures pending field gear on menu/restart/page exits and clarifies pause actions. Native session checks cover repeated Story/Rush/Replay, Garage, reload, capacity and reward ownership; a 14.5-minute simulated soak checks finite arrays and bounded effects/caches. Browser reload confirms equipment retention without checkpoint advancement. See [Session reliability](SESSION_RELIABILITY.md). These scripted/mock-render checks do not close human campaign, controller, listening or target-device performance validation.

## Current pass: encounter rhythm and difficulty evidence

v149 preserves Mission 1 and the fixed 48-second approach / 36-second post-elite field in every mission. Missions 2–10 now alternate attack groups, eight-second repositioning windows and a final test, followed by quieter boss approaches. Only new wave/hazard admission changes; existing dangers finish normally. Active groups arrive faster than the former continuous cadence. Absolute simulation clocks preserve pause, service, Garage and checkpoint behavior without missed-wave bursts.

Across 36 paired seeded field probes, live enemy occupancy fell 23% and hostile-shot occupancy fell 19.7%, while the largest observed enemy crest stayed close (43 before, 42 after). Every regroup tail was quieter than its preceding pressure. Eighty native boss/build snapshots compare empty Garage, focused Rare builds, mixed gear and a valid maximum-roll Exotic ceiling, with separate normal-hull and earned-perk cases. These establish bounded behavior, not human success rates.

See [Encounter pacing](ENCOUNTER_PACING.md) for timings, reproducible evidence and the fresh-player checklist. Priority 5's **human fairness validation remains open**. Veteran Campaign remains deferred.

v153 reviews all ten sectors' boss pressure and models pickup acquisition using native field budgets. Bloodstar's exposed-core movement now runs at half its ordinary pendulum rate while attack, opening and animation clocks keep running. Later formation leaders can supply a missing first missile from Mission 2 or first Bit from Mission 3, without extra upgrades, new counters or save fields. The strongest existing kit and gear budgets stay unchanged. The final boss remains a combined-pattern playtest target; the scripted pressure results do not justify a blanket nerf or damage increase. [Campaign playtesting](CAMPAIGN_PLAYTEST.md) gives exact fixture limits and the private Story-rules comparison page.

## Current pass: sound, text and retry

v150 routes routine fire, impacts, blocks and charge through a quieter detail bus. Hull hits, shield hits and part breaks briefly lower those details while keeping their own cues clear. Repeated minor contacts have bounded playback; armor chips and exposed-core hits have distinct short cues. The supplied intro and music-only boss transition remain intact. [Sound prompts](AUDIO_PROMPTS.md) records the user's standing preference: include ready-to-use ElevenLabs/Suno briefs with each sound pass. Six proposed effects are documented for audition; no external generation has been installed.

v151 installs the seven WAVs subsequently supplied by the user, with immediate synthesis fallback. Hit files lose their delayed lead-ins, the core break becomes one fracture/impact/decay event, and the favorite tiny clip confirms actual gear receipt. Native browser checks decode all seven samples and render a mix with zero clipped samples. Source masters remain intact. See [Sound assets](SOUND_ASSETS.md) for edits and playback checks; a speaker/headphone listening judgment remains open.

Flight Manual now offers Standard / Large text. Large enlarges UI copy and DOM HUD labels by 20% without enlarging the canvas or collision geometry. Responsive text declarations and newly mounted practice panels retain their authored relationships. Garage columns and compact screens remain scrollable. The independent browser preference also travels into isolated Flight School; accepted child changes are saved by the parent without touching pilot data.

The loss screen identifies the final hull-damaging source and gives one actionable response. A direct retry restores the recorded checkpoint build, perks, arsenal, hull and consumed guards. Story/Replay apex arrivals save the existing post-elite checkpoint at its completed field clock, allowing immediate boss retry. Failed-attempt loot stays banked. Attempt score and counters restart to avoid booking earlier stages into lifetime totals twice. Full campaign restart remains an explicit separate action. Session retry is scoped to its pilot, slot and run epoch; DEV data cannot replace a campaign checkpoint.

v152 connects the loss-screen Garage to that retry. **Apply & Retry Checkpoint** compiles equipped gear against a private checkpoint copy before committing it, preserving resources and consumed guards. **Back to Flight Report** keeps the original retry available. Controller navigation now follows visible controls, reveals deeper rows in the current gear column, restores binding-row focus after capture and repairs focus after modal and screen changes. Keyboard Escape returns from name fields without repeated presses toggling Pause. Native browser fixtures verify layout/focus behavior; simulated pad input verifies integration. Physical-controller play remains open.

Implementation of all six original priorities is now present. Remaining validation is **fresh-player difficulty/pickup pacing, listening on real speakers/headphones, physical-controller play and longer-session performance**. Do not treat automated graph/collision tests as those human outcomes or start Veteran Campaign before reviewing them.

Development v160 continues build clarity and reward correctness while the friend checkpoint stays frozen. New gear uses unbiased distinct-stat selection and uniform integer rolls; authored ranges and saved items remain intact. Perk cards/inspection now identify missing Bits, next-apex healing and ready/spent mission protection. Gear descriptions match existing Surge and Force handling behavior. [Build context review](BUILD_CONTEXT.md) records the distribution and lifecycle evidence. This does not close fresh-player difficulty validation.

Development v161 measures actual guaranteed rewards from 64 private campaigns and makes owned pair opportunities visible in the Garage without changing reward strength. It also fixes camera jitter behind frozen Pause/recovery/perk/loss screens. [Earned builds review](OWNED_BUILDS.md) records evidence and limits. Real combat with field-acquired kit and earned perks, human difficulty and measured target-device performance remain open.

Development v162 reduces the synchronous native fragment readback/scan workload by 72.167% across a real-browser 8,448-case comparison. The repeat preserves exact debris pixels, crop, placement and motion; full-canvas fallback protects unsupported paint. [Part-break performance](PART_BREAK_PERFORMANCE.md) includes the first-run discrepancy and complete follow-up evidence. Sustained target-device performance and the other human gates remain open.

Development v163 reuses six exact regular-enemy endpoint poses, removing about 66% of repeated offscreen atlas painting in mixed 32/64-enemy batches. All 1,776 native-art pixel cases and three atlas controls pass; continuous blends, firing tells, hit effects and combat rules retain their existing behavior. [Enemy-wave performance](ENEMY_WAVE_PERFORMANCE.md) records both timing runs and their limits. This reduces demonstrated rendering work without closing sustained target-device performance or the other human validation gates. The v159 friend package remains frozen.

Development v164 shares particle/debris drag calculations within each simulation step, preserving the existing motion, lifetime and seeded smoke-emission sequence. [Effects performance](EFFECTS_PERFORMANCE.md) records exact baseline comparisons and the removed arithmetic. This continues performance work without changing cosmetic budgets, gameplay or the frozen v159 package; target-device frame times remain an open validation gate.

Development v165 completes a staged continuous browser review of all 38 encounter phases, representative display settings, repeated effect bursts and cleanup. The review stays within effect/cache limits and drains transient arrays, while exposing first-use material readback stalls after armor breaks. Production only takes the exact-byte palette-loop improvement: fewer temporary arrays and zero-weight calculations, about 10% faster in the isolated CPU benchmark. Rendering-backend and mirror trials remain private because their art or timing evidence did not justify installation. [Performance follow-up](PART_BREAK_PERFORMANCE.md#sustained-browser-follow-up--v165) records the scope. The first-use hitch and sustained performance on other computers remain open; gameplay and the v159 friend package stay intact.

Development v166 addresses the first-use material readback stall found in v165 by batching a body paint's missing socket samples into one strip read, keeping each tile's raster identical to the original single sampler. Two earlier layouts were rejected after exact comparison exposed palette-input differences. The installed version leaves all 3,282 compared palette builds byte-identical and about halves first-visit post-break draw time in matched runs; the strict world-pixel matrix is exact in four of four runs with every 2D canvas CPU-backed, while default GPU-backed canvases show 1–3 single-byte, one-level differences in 1,342 rows that v165 also shows against its own repeat. [Performance evidence](PART_BREAK_PERFORMANCE.md#first-use-palette-readback-batching--v166) records the limits and a revert path. Human difficulty, controller, audio and target-device validation remain open.

Development v167 applies the same batching to the earlier main bosses after a ten-boss survey showed they still paid 3–4 separate readbacks per first paint. Palette data stays byte-identical, the strict pixel matrix is exact in five of five all-CPU runs, and total post-break palette-miss frame time falls 31–37% in matched runs, though the hitch is reduced rather than removed and about 15–20 ms of non-palette break-frame cost remains. [Performance evidence](PART_BREAK_PERFORMANCE.md#earlier-boss-readback-batching--v167). Human difficulty, controller, audio and target-device validation remain open.

## Build foundation boundary

The reward portion of the revised foundation is live. The broader gear/compiler/typed-damage proposal in [FOUNDATION_DESIGN.md](FOUNDATION_DESIGN.md) remains staged. It must preserve distinct rolled items, locks and recorded checkpoints when integrated. That proposal does not replace this polish roadmap or authorize additional progression systems.
