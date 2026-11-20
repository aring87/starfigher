# Starfighter: Last Signal

The original [polish roadmap](ROADMAP.md) remains the priority. Veteran Campaign is deferred.

The Windows **v159 friend playtest** is in `releases/v159/Starfighter-Playtest-v159.zip`, with a single EXE containing all game content. It adds current keybinds to every intro drill and an in-game Garage walkthrough after completing the intro, before returning to the mission briefing. [Friend handoff and next roadmap](FRIEND_PLAYTEST.md) records the remaining gates. The older v157 package remains frozen.

Development v168 adds an opt-in, local-only performance log (Flight Manual > 04 PERFORMANCE LOG): frame timing, hitches with context, memory samples and errors, exported only when the player presses SAVE FILE or COPY TEXT. It is off by default, sends nothing, never reads saves or names, and costs about 0.1 microsecond per frame. `node tools/analyze-diagnostics.cjs file.json` turns a friend's file into a report. The **v168 friend package** (`releases/v168/Starfighter-Playtest-v168.zip`, 382.9 MiB) carries everything since v159. [Friend playtest notes](FRIEND_PLAYTEST.md).

Development v167 extends v166's batched first-use material readbacks to the earlier main bosses (Twin Maw, Helix Crown, Rift Wraith, Iron Bloom). A survey of all ten main bosses showed those four still paid 3–4 separate readbacks per first paint, up to 31 ms of a 44–62 ms first part-break frame. v167 uses one strip read per paint; in four matched paired runs total time in post-break palette-miss frames fell 31–37% (median frame 32–46%) while every palette byte stays identical (3,282 builds), and the strict pixel comparison is 1,342/1,342 exact in five of five all-CPU runs. Bloodstar and minibosses are unchanged, and about 15–20 ms of non-palette cost remains in the break frame. [Evidence, survey and revert steps](PART_BREAK_PERFORMANCE.md#earlier-boss-readback-batching--v167). Art, combat rules and the frozen v159 package are unchanged.

Development v166 batches the first-use material readbacks after boss armor breaks: one strip read replaces one read per socket (Void 176 → 32, Prism 224 → 64) while every palette input and layer byte stays identical (3,282 builds compared). In four matched same-page runs the post-break first-visit draw median falls about 56% (Void, roughly 21 → 9 ms) and 45% (Prism, roughly 14 → 7.5 ms); warm frames are unchanged. On default GPU-backed canvases 1–3 of 1,342 strict-comparison rows differ by a single byte (one level), a variation the frozen v165 source also shows against its own repeat; with every 2D canvas CPU-backed the comparison is 1,342/1,342 exact in four of four runs. Two earlier private layouts were rejected for real differences. [Evidence, limits and revert steps](PART_BREAK_PERFORMANCE.md#first-use-palette-readback-batching--v166) record everything. Art, combat rules and the frozen v159 package are unchanged.

Development v165 removes temporary arrays and zero-weight work from native weak-point material preparation. Exact layer comparisons preserve the artwork; an isolated CPU benchmark improves about 10%. A sustained browser review found no runaway effects or cache-limit failures, but identified remaining first-use rendering stalls. [Performance follow-up](PART_BREAK_PERFORMANCE.md#sustained-browser-follow-up--v165) records the accepted change, private trials and limits. The v159 friend package remains frozen.

Development v164 removes repeated drag calculations from smoke and debris updates while preserving exact effect motion, lifetime and emission order. [Effects performance](EFFECTS_PERFORMANCE.md) records the operation-count reduction and regression evidence.

Development v163 reuses six regular-enemy still poses, reducing repeated offscreen atlas painting by about 66% in mixed 32/64-enemy batches. All 1,776 real-pixel comparisons pass; continuous animation keeps its existing blend path. [Enemy-wave performance](ENEMY_WAVE_PERFORMANCE.md) records exact output checks, cache bounds and measured timing limits. Combat rules and the frozen friend ZIP stay intact.

Development v162 reduces part-break pixel readback/scanning by about 72% in the full native comparison, preserving exact debris pixels, crop and placement in the 8,448-case repeat. [Part-break performance](PART_BREAK_PERFORMANCE.md) records the initial discrepancy, controlled recheck, passing repeat and timing limits.

Development v161 makes owned gear combinations easier to find: the Garage separates equipped, stored and missing pair requirements and names matching items. Frozen screens stop applying camera shake. A 64-pilot guaranteed-reward diagnostic supports visibility rather than more gear power; [earned builds review](OWNED_BUILDS.md) records the scope and remaining human validation.

Development v160 corrects biased stat selection and integer rolls in new gear, clarifies Scavenger Drive and Vector Governor, and gives run-perk choices current-kit/guard context. Saved equipment retains its rolls. [Build context review](BUILD_CONTEXT.md) records the native distribution checks and browser evidence; fresh-player difficulty remains open.

v156 secures collected field gear before menu exit, restart and page lifecycle exit, using existing Garage capacity/overflow rules without advancing the checkpoint. Pause explains the exit options and hides pickup notices over its buttons. Repeated Story/Rush/Replay transitions and a bounded runtime soak are recorded in [Session reliability](SESSION_RELIABILITY.md); real-device and human campaign validation remain open.

v155 fixes same-step damage from rocks/mines already destroyed by a shot or Force, and stale readiness help after Delta or a shield has been spent. Native interaction checks and six private browser fixtures verify the fixes. Field timing and progression remain intact. [Field clarity review](FIELD_CLARITY.md) records the evidence and test page.

v154 fixes four encounter fairness issues: completed phases commit before contact from the spent body; guided weapons target the active secret-ritual guardian; piercing shots hit each guardian once; and exposed moving cores use guarded relative-motion collision checks. Core artwork, hit radii, health, attack timing and gear stats remain intact. [Encounter review](ENCOUNTER_REVIEW.md) includes the evidence and an isolated test page for all 22 encounters and their rituals.

v153 starts the campaign fairness review. Bloodstar steadies its movement while its cores are exposed, keeping its health, attack cadence and native animation. Formation leaders can carry a missing first missile from Mission 2 and a missing first Defense Bit from Mission 3; collection is required and further upgrades stay random. Gear rolls, set bonuses, field timing and global damage are unchanged. [Campaign playtesting](CAMPAIGN_PLAYTEST.md) records the evidence and a private, playable Story comparison page.

v152 improves controller focus across screen changes, scrolling gear lists and rebinding. After a loss, Open Garage now offers **Apply & Retry Checkpoint** and **Back to Flight Report**. Apply recompiles equipped gear against the recorded checkpoint while preserving its hull, shields, arsenal and used guards; ordinary Retry keeps the recorded build. Failed-attempt loot and totals are counted once.

v151 installs the seven supplied sound effects. Hit clips start promptly, the core/weapon break is reorganized into one fracture-impact-decay event, and the favorite tiny sound confirms gear pickup. Local samples use the existing SFX controls and mix priority, with immediate synthesis fallback if an asset is unavailable. [Sound assets](SOUND_ASSETS.md) records the edit and native mix check.

v150 adds Standard / Large text in Flight Manual, short final-hit advice and one-click checkpoint retry. Retry retains the recorded build and starts fresh attempt accounting; a boss retry bypasses the field already completed. Routine audio briefly yields to important hull, shield and part-break cues, with distinct core/armor feedback. Intro music and the music-only boss fade remain intact. [Sound prompts](AUDIO_PROMPTS.md) contains six optional effect briefs for ElevenLabs; proposed generated assets are not installed automatically.

v149 implements the encounter-rhythm pass. Missions 2–10 alternate active attack groups, eight-second repositioning windows and a final push, keeping the 48/36-second field lengths. Existing dangers continue through quieter windows. Mission 1 retains its authored sequence. Native field and build measurements are recorded in [Encounter pacing](ENCOUNTER_PACING.md); fresh-player fairness validation is still open.

v148 completes priority 4, boss tactics. Destroyed outer weapons now remove their assigned salvos or firing lanes across all 22 encounters. Twin Maw loses a broken jaw's fan; Hydra's middle head can interrupt its beam; Gravebell's weights clear rain lanes. Shared assemblies wait for every support to break. Surviving shots keep their paths and cadence, and a brief health-bar message names the disabled assembly. See [Boss tactics](BOSS_TACTICS.md) for the roster.

v147 addresses roadmap priority 3, combat readability. Scenery and edge silhouettes render behind gameplay, with restrained background grading. Hostile bullets have dark separation and bright rims while retaining their round or angular shape. The invulnerable fighter stays visible. Damage smoke thins around the fighter and registered exposed cores while remaining visible elsewhere. These are presentation changes; health, collisions, firing cadence and progression are unchanged.

The [development game](http://127.0.0.1:8765/?v=168) uses **up to three active run perks and simple miniboss recovery choices** for new campaigns. Random gear rolls, Signal Power calibration, current two-/four-piece sets and intrinsic pairs remain unchanged. Loaded classic checkpoints keep their existing Field Modules and Doctrine. The separate [build foundation prototype](FOUNDATION_DESIGN.md) still explores a future gear/combat and elemental model; `foundation-lab.html` is a designer workbench, not the live rules.

A dependency-free, original side-scrolling arcade shooter built for the browser.

See the [Player Guide](PLAYER_GUIDE.md) for controls, modes, loot, progression, and secret-encounter spoilers. [Balance and builds](BALANCE_AND_BUILDS.md) explains the sector curve and equipment-pair loadouts. The [Power growth audit](BALANCE_AUDIT.md) reviews the combined reward systems, pickup timing and charge efficiency. The [Art and audio handoff](ART_HANDOFF.md) describes the installed menu artwork and intro music.

## Visual direction

The game uses an original layered 2.5D pixel-art presentation: crisp authored sprite animation on the combat plane, a deep nebula and eclipse in the far plane, ruined megastructures and asteroids in the middle plane, and softly blurred machinery plus dust in the near foreground. Each plane scrolls at a different speed to create depth while atmospheric haze, light shafts, glow, foreground occlusion, and scale separate the layers.

The live sprite atlas is `assets/combat-sprite-atlas.png`. It contains four player-engine frames, four rotating Signal Pod frames, animated scout, charger, and organic-turret enemies, and Common/Rare loot crates. Ten elite enemies have 4×4 animation sheets under `assets/minibosses/`. Main bosses use phase sheets and authored inbetweens under `assets/bosses/`. `assets/art-direction-depth.png` is the widescreen art-direction keyframe for future environment production.

Boss impacts preserve armor detail with a restrained surface flash and recoil. Body rendering, anatomical cores, collisions, and weapon ports share registered transforms. All ten minibosses, ten main bosses and both secret epics shed real outer appendages from their own animated source art. Prepared core and limb atlases under `assets/destruction/` replace the former runtime polygon cuts. Destroying an exterior assembly hides its entire animated layer and releases that same native limb in its killing pose; newly painted broken mounts finish the retained body. Twin Maw and Helix keep their living jaw and shell articulation without restamping removed limbs. Internal reactors remain in solid, scorched housings. Bloodstar retains its authored tentacle masks and fragment sheets. Destroyed regular enemies also scatter armor debris. Mini-boss and main-boss victories retain a short destruction window before opening the upgrade screen so their larger debris fields remain visible.

Regular enemy hits retain native armor colors with a small chassis kick rather than a white flash and heavy stretch. Their two authored poses blend once with weighted color and alpha, preserving armor coverage without leaving an opaque old silhouette underneath. Turret charge artwork follows the actual firing cycle. Reduced Motion removes chassis wobble and deformation. Strong hull and Delta impacts keep their intended camera feedback when ordinary enemies die in the same update.

Elite arrivals use a compact side card beneath the combat actors, keeping the fighter and encounter visible during the approach. Delta launches a short local burst and open angular shock fronts beneath ships, bullets and hazards. Its wave stays at the activation point as the pilot dodges; Clear Combat reduces glow, and Reduced Motion uses a brief steady facet. The former long screen wash is removed.

Weak-point material comes from the exact native sprite pose being rendered across all ten elites, ten main bosses, and both secret epics. Per-organ hue selection follows the authored circuits, vents, crystals and reactor bars; transparent color layers leave their surrounding armor and grooves in place. A final source-atop composite preserves the body's original alpha, including soft edges. Bloodstar retains its approved red-to-yellow heat ramp. Broken organs dim inside solid housings; outer assemblies retain their native breakaways and smoke. Animated source rectangles and anatomical tracks keep paint and hitboxes attached through movement, impacts and phase changes. Ritual guardians use authored enemy-atlas artwork. The backing canvas adapts up to 1920×1080 on larger/high-DPI displays while gameplay remains in the same 960×540 arena.

Encounter health updates immediately, with a short amber segment showing recent damage as it settles. Sustained fire keeps that segment moving; pausing freezes it. Inspection, phase changes and direct health changes cannot leave stale feedback. Reduced Motion uses the immediate health fill, and exposed-core labels remain steady. Rift Wraith and Iron Bloom normalize their attack poses to their actual firing intervals, including frozen detached-part snapshots. The Force Pod keeps its neutral native pose and scale in Reduced Motion while deployment, recall and following continue normally.

## Start menu, modes, and checkpoints

Select **Story Mode** or **Rush Mode**, then choose **New Game** to open the first deployment's mission briefing. Selecting a completed Mission Select tile or choosing **Launch with Loadout** in the Garage also opens a briefing. Review the chosen mission artwork, sector, description, hazard, elite, and **Expected Apex**, then choose **DEPART** to launch. Rush bypasses the approach and elite. The restored right-hand mission card lives on this separate briefing screen; the current title menu's artwork and controls stay unchanged.

**Back** or **Escape** returns to the screen that opened the briefing. Viewing it or going back does not replace a saved checkpoint. Confirmation to replace an existing run appears only when choosing **DEPART**; the pilot's Garage and permanent unlocks are kept. **Load Game** resumes its saved checkpoint directly. **Retry Checkpoint** restores the recorded checkpoint; **Restart Campaign** begins a fresh run. **Profiles** manages three separate pilots; **New Pilot** creates a separate profile.

| Mode | Run structure | Completion and unlocks |
| --- | --- | --- |
| Story | Ten full missions: approach, elite, recovery choice, and apex encounter. Nonfinal apexes offer a run perk. | Mission ten ends the run. Beating each full mission unlocks that mission's replay. A secret epic replacing its apex still counts as completing the full mission. |
| Rush | Ten main bosses back to back, with run-perk choices between victories. Starts with red Level 3 Force, dual missiles, two Bits, a ready Delta, at least eight hull and three shields. | Ends after the tenth apex. Boss victories earn normal rewards and apex records, but do not unlock full-mission replays. |
| Mission Replay | One full mission selected from the completed-mission archive, using the current Garage loadout. | Ends after that mission's apex. Each tile requires that specific mission to have been beaten; uncleared tiles remain locked. |
| Dev Lab | Direct level, elite, main-boss, or epic tests. | No normal rewards, mission unlocks, or progression. Developer skips apply only here. |

**Mission Select** becomes available after the first full mission clear. Rush apex records and mission completion records remain separate. Older pilot profiles migrate their previously completed campaign bosses into the mission-clear archive.

**Load Game** resumes the active pilot's last safe checkpoint: a mission start, post-elite stretch, pending recovery/perk choice, or Rush boss start. It restores the recorded run build, weapons, rewards, score, totals, segment and ruleset rather than every live projectile. Older untagged or `classic-v1` checkpoints keep Field Modules and Doctrine; new `streamlined-v1` campaigns use the three-slot run track. Restoring a pending choice does not award the same loot or recovery twice, and an offered perk draft stays the same. Ordinary menu Garage changes apply to new runs; a loaded checkpoint keeps its recorded build unless a between-round refit or Apply & Retry was committed to it. Defeat and successful run completion clear the run checkpoint; closing or leaving an unfinished run retains its last saved checkpoint. Saves are validated and local to the browser and pilot slot. The session-only warning remains visible if storage cannot persist them.

The menu also opens **Garage**, **Loot Guide**, and **Flight Manual**. The supplied violet-eclipse artwork fills the menu background from `assets/menu/menu-key-art.png`, connected through `--menu-art`. Its left-side controls remain unchanged, keeping the fighter and eclipse visible; the former right-hand card appears on the separate mission briefing instead. The supplied **Space Blaster** theme loops across menu screens and the briefing without restarting during navigation. `music/menu-intro.mp3` is the game copy; `music/menu-intro.wav` preserves the original master. Menu music uses the saved volume/mute controls, yields to gameplay music on departure/load, and resumes after help or tab hiding. Browsers that block autoplay start it on the first menu click or key press.

## Ten-stage campaign

The campaign now uses ten original 1280×720 HD-2D environment plates under `assets/levels/`. Each plate is color-graded behind a clear combat lane, then reinforced with a separately scrolling middle plane, a faster silhouetted foreground plane, deterministic atmospheric particles, stage-colored enemy glows, a cinematic title card, and a readable hazard telegraph. Environmental hazards run during the two field stretches, follow each stage's own hazard style, and clear for the elite and apex encounters.

1. **Shattered Meridian — Orbital Graveyard.** Broken fleet rings and carrier wrecks drift over a violet gas giant. Slow formations weave through faster, destructible ricochet debris, creating alternating aim and navigation beats before the Bloodstar arrives.
2. **Cinder Rail — Mobile Foundry.** A weapons factory crawls over a magma moon. Furnace trains and piston towers create a rapid parallax rhythm while paired crusher arrays close around a telegraphed safe opening.
3. **Pelagic Trench — Abyssal Facility.** The fighter descends through flooded pressure ruins, luminous bones, silt, and bubbles. A layered current subtly moves the ship while destructible pressure mines enter in loose schools.
4. **Crystal Vesper — Prism Cathedral.** Mirrored ruins and floating prisms split cold light across the lane. Refracted lances first draw a thin warning line, then ignite along the same diagonal so evasion rewards reading rather than guessing.
5. **Iron Orchard — Autonomous Colony.** Mechanical flowers and cable vines have overgrown a dead settlement. Articulated cable blooms travel with living petal endpoints and squeeze the lane around a moving opening.
6. **Hollow Engine — Living Dreadnought.** Ribbed armor, reactor organs, and nerve cables turn the whole stage into a breathing machine. Peristaltic gates move more slowly than factory crushers but leave a tighter, organically shifting aperture.
7. **Necropolis Relay — Dead Signal Array.** Frozen dishes and coffin-like data vaults float through spectral interference. EMP echo walls flash before crossing the battlefield, while enemy formations drift like delayed transmissions.
8. **Helios Scar — Coronal Harvester.** Heat shields and solar collectors skim a blue-white star. Fast coronal fronts leave a broad shelter band; ember streaks and hot bloom communicate speed without masking hostile projectiles.
9. **Eventide Engine — Gravity Observatory.** Broken time rings orbit a black singularity amid inverted debris. Mobile gravity wells bend hostile fire and pull the fighter, turning positioning and pod deployment into the main survival puzzle.
10. **Last Signal — Beacon Zero.** The planetary beacon collapses around its exposed reactor. The approach cycles crusher walls, dense debris, and focused lances, combining the campaign’s visual language without copying the exact timing of earlier stages.

The source-of-truth stage metadata lives in `levels.js`; `game.js` owns hazard simulation and layered canvas rendering. The ten generated plates remain environment-only, leaving enemies, bosses, bullets, weak points, and collision geometry fully authored by the game.

## Play

Open **CONTROLS** from the main menu or Pause to change keyboard keys and controller buttons. Select a binding, press its replacement, and the setting saves automatically. Conflicts swap the two assignments; every action keeps at least one binding. **RESTORE DEFAULTS** restores both devices. Keyboard, mouse and controller inputs can be used together. HUD, combat and Flight School prompts follow the current device and assigned bindings.

Browser-standard Xbox/PlayStation-style controllers support left-stick or D-pad flight, A/Cross or RT/R2 hold-and-release fire, LB/L1 or LT/L2 precision, X/Square Force, Y/Triangle mount, B/Circle Delta, View/Share skill tree and Menu/Options pause. The left stick has a radial 18% deadzone with proportional movement. In menus, stick/D-pad navigation, A/Cross confirmation and B/Circle back remain fixed; Menu/Options resumes Pause even when its combat action is rebound. Selects and sliders can be adjusted left/right. Disconnecting an active controller pauses and clears charging. Screen changes, focus loss and reconnects require controls to be released before gameplay resumes.

Gear cards retain rarity colors and labels, while item names omit redundant rarity prefixes. Existing saved names and original-item archives remain intact.

Run `.\Start-Game.ps1` from the game folder, then open `http://127.0.0.1:8765/` in a modern browser. Use HTTP so the supplied sound samples can load. Move with WASD or the arrow keys. Tap Z/Space or left-click for a normal shot; hold and release any of them for a charge shot. X is an alternate charge key. Press C to deploy or recall the Force Pod, V to choose its front or rear mount, Q to fire a fully charged Delta Weapon, and P to pause. Enable Mouse Flight using the button at the lower-left to make the ship follow the pointer while clicking acts as the fire button.

Hold **Shift** while moving for precision flight at 45% speed. Its ring shows the fighter's actual collision boundary; the collision size does not change. Mouse Flight defaults to off for new players and remembers your preference. Keyboard movement takes priority while a movement key is held.

**Flight Manual** on the title screen, or **Flight Manual & Options** while paused, explains the arsenal and boss exposure windows. Its saved display options include Reduced Motion, Clear Combat, and an always-visible Collision Guide. Fullscreen is available in supported browsers. Leaving the window or hiding the tab automatically pauses; resume explicitly when ready. Display preferences are separate from pilot profiles.

Combat runs at a fixed 120 simulation steps per second, with bounded catch-up after a slow frame. Hostile fire has a dark edge and bright center for visibility against all stage palettes. The HUD separates mission objectives from equipment, reports shields, and indicates when a charge can be released.

Shield impacts use cyan feedback, a guard absorbing or denying hull damage uses gold, and hull loss uses pink. At one hull, a steady **HULL CRITICAL** label remains visible. Reduced Motion keeps invulnerability visibility steady and suppresses banking and camera shake. Projectiles render above smoke and debris; cosmetic particle budgets prioritize combat visibility, with lower budgets for Clear Combat and Reduced Motion.

Minibosses glide into position, hold a firing lane, and relocate along smooth routes. Their banking follows actual travel. A matching-perspective pose cycle keeps the reactor anchored while fins and armor articulate, avoiding rapid changes in hull perspective. Attacks retain a short wind-up, continuous recoil and recovery. Exposed cores use a stronger glow sampled from their own animated material. Charging is indicated by the HUD meter and sound; the circular charging effect on the fighter has been removed.

Regular wings now follow bounded stage-specific weaving lanes, drones make deliberate lane transfers and steady their aim tells, and turrets keep a stable firing platform. Each elite has its own lane sequence and pacing. Main and secret bosses preserve their distinct authored routes across phase-speed changes; accumulated movement phases prevent path jumps, and restrained banking follows actual velocity. Native body, core, muzzle and collision registration remains shared.

The Aegis shield projects separate translucent facets around the fighter's nose, wings and engine housing. Wing emitters and a faint energy lattice connect the barrier to the ship. Pickup assembly and impact responses provide feedback, while Reduced Motion keeps the surface steady. Shield pickups use a faceted ward icon.

## Single-ship Force arsenal

- The fighter begins without a Force Pod. The first regular enemy destroyed keeps producing a colored crystal until the pilot collects one.
- The first crystal equips the indestructible Force Pod at Laser Level 1. The Pod blocks pink hostile shots, damages enemies by contact, mounts to the front or rear of the fighter, and can operate independently ahead of the ship. Amber fire pierces the Pod and Bits.
- Later crystals raise Force levels within the current mission limit and change the active color. Mission 1 allows Force 1 / missile 1 / Bit 1; mission 2 allows 2 / 1 / 1; mission 3 allows 2 / 2 / 2; mission 4 onward allows 3 / 2 / 2. Rush and direct Dev Lab tests retain the complete kit. Surplus pickups grant score and 2% DOSE; crystals still switch color.
- Red is direct high-damage fire with Level 3 penetration. Equipped Bits fire in tandem only while red is selected.
- Blue creates angled, increasingly wide fire. Levels 2 and 3 ricochet from the upper and lower combat boundaries.
- Yellow launches specialized wave rays that curve toward targets.
- Orange-tipped missile racks add homing missiles. A second rack reaches the maximum dual-launch configuration.
- White-core armored drones add a small defensive Bit above or below the fighter, to a maximum of two. Bits intercept minor hostile bullets; with the red laser selected they also supplement the fighter's fire. The collected drone and attached units share the same armored housing and optic.
- Enemy destruction and hostile energy absorbed by the Force fill the DOSE meter. At 100%, Q activates the Delta Weapon, erasing regular enemies and hostile projectiles while dealing controlled damage to boss weak points.

The HUD continuously shows the selected Force color and laser level, Pod position, missile level, Bit count, and DOSE percentage. Direct Boss Lab tests begin with the complete Level 3 red arsenal and a ready Delta Weapon; full-level tests use the normal pickup progression.

Organic drone firing is animation-driven: its firing frame is no longer part of the idle loop, and its real projectile is created on the exact muzzle-release frame.

## Music

Level music is loaded from `music/level1.mp3` through `music/level10.mp3`. Tracks are drawn from a shuffled bag, so all ten play in a random order before any repeat. The current track continues through post-miniboss recovery selection while combat stays frozen, then carries on from the same position when play resumes. Classic checkpoint Module selection retains the same music behavior. Music pauses during explicit gameplay pause, help, or a hidden tab, and follows the in-game sound toggle.

Each live apex arrival has a protected 4.2-second visual warning window. The current music fades down throughout those 4.2 seconds, then the boss theme fades in over 0.65 seconds as the boss enters. Story, mission replays, Rush and secret replacements use the same sequence; direct developer boss studies stay immediate. Arrival audio is always music-only, and the former alarm/fade preference has been removed. The transition follows Music volume and master mute, pauses with the game/help/tab hiding, and cancels when returning to menus. Incoming enemies, projectiles and hazards are cleared during the warning.

Boss music uses the nine shipped themes in `music/bosses/` and a separate shuffled bag, with immediate repeats prevented. A new random level theme starts when the next stage begins after an apex victory.

## Sound effects

Sound effects are generated in real time with the Web Audio API and require no external samples or licenses. A compressed SFX bus layers pitch envelopes, oscillators, filtered noise, and short musical intervals. Distinct cues cover normal fire, the continuous charge build and ready threshold, charged release, pod deployment and recall, pod projectile blocks, enemy weapons, impacts and destruction, exposed weak points, destroyed cores, shield hits, hull damage, evasion, powerups, all five loot rarities, mini-boss and boss entrances, laser telegraphs, phase changes, victories, upgrades, skills, UI clicks, launch, and game over.

The global SOUND button mutes or restores the complete mix. AUDIO MIX opens separate Music and SFX volume sliders, and both settings persist in browser local storage. Music defaults to 30% while SFX defaults to 82% so gameplay cues remain audible over the soundtrack.

## Boss encounters

- Every Story/Replay mission has a 48-second field approach before the elite and a separate 36-second post-elite combat run before protected apex arrival. Shattered Meridian keeps its approved 48 + 36 timing, one-third shorter than the former 72 + 54 seconds. Later missions now match those full field windows while retaining their own formations, stage hazards and escalating sector pressure. Elite combat, recovery selection, pause and Garage time do not consume the post-elite run.
- Shattered Meridian now uses five deterministic wreckfield patterns instead of random hazards. Mission-direction cards introduce the Force, destructible debris, command drones, the elite escort, the counterattack, and the final apex corridor without stopping play.
- Level 1's Wreck Reaver begins at 120 core health, receives a protected 2.6-second arrival card, and uses synchronized sealed, opening, exposed, damaged, and destroyed native fissure states. Larger gold energy fills its physical recesses, and all three cores follow the moving sprite's anatomy with a 14-unit hit radius. Later elites retain their existing health budgets. Every elite announces exposure with a 0.52-second opening tell; Wreck Reaver stays exposed for 3.2 seconds, while the other elites retain 2.35 seconds.
- Level 1 turrets and lancer escorts show a 0.42-second muzzle charge that releases on the firing animation instead of producing an untelegraphed shot.
- Miniboss, main-boss and secret-boss body hits now deal 25% shot damage outside protected entry, phase transitions and rituals. Exposed cores take full shot output with weak-point bonuses. Body damage reduces the same phase/core health pool, so an encounter can finish without hunting a surviving rear appendage. The old zero-damage armor rule no longer applies.
- The Wreck Reaver and Bloodstar use authored opening tells and exposure windows; later bosses retain controlled variable timings. Bloodstar cores have a 17-unit hit radius and remain exposed for 3.2 seconds in phase one or 2.8 seconds in phase two. Its native red emission heats through yellow to bright yellow while armor, shadows, and texture remain visible.
- Every weak point has independent health and stays destroyed for the rest of that phase. Only outer appendages physically detach, leaving a persistent severed silhouette and charred joint across animation frames and hit flashes. Internal cores scorch their solid housing without making an interior cutout. A limb supported by several cores stays attached until all its supporting cores break. Falling limbs use the exact native pose, surviving colliders stay registered, and a new boss phase uses its own intact parts.
- The Bloodstar's sockets are colored inside each native body frame before animation blending and limb removal, keeping their palette attached to the moving anatomy. A compact internal core pulse replaces the previous large red line-and-ring attack overlay, and its vertical movement eases between targets. At half health it clears projectiles and holds a 1.55-second phase-break beat before beginning its faster second pattern.
- Main bosses enter phase two at half health, clear their existing projectiles, change movement and attack pattern, and use a different set of weak-point positions.
- Main-boss durability is authored per encounter, ranging from 330 to 500 base core health, with campaign build scaling. Half of that health is distributed across each phase's destructible weak points.
- Elite and apex health readouts show actual current / maximum HP, including fractional damage to one decimal place, rather than a rounded-up percentage.

### Main-boss roster

1. The Bloodstar — vertical sweeps, aimed fans, and rotating radial fire.
2. Twin Maw — figure-eight movement and paired upper/lower crossfire.
3. Helix Crown — orbital movement and accelerating spiral barrages.
4. Rift Wraith — random teleports followed by fast fans and projectile walls with moving gaps.
5. Iron Bloom — slow arena sweeps and layered rotating bullet blooms.
6. Void Leviathan — player tracking, homing shots, and aggressive screen-crossing lunges.
7. Prism Warden — triangular movement, precision fans, and dual-speed radial patterns.
8. Gravebell — homing mines followed by projectile rain from above.
9. Solar Hydra — three firing origins and a telegraphed phase-two beam.
10. Omega Heart — an unpredictable rotation of walls, rings, homing attacks, fans, and rain.

Story and Rush both finish after their tenth encounter stage. New runs, mission replays, shuffled music, exposure timing, and different equipment builds provide replayability.

## Threat scaling

Normal approach pressure rises along a smooth sector curve rather than reading the player's equipment. From missions 1 to 10, the curve moves spawn pressure from 1.00× to 1.60×, travel speed from 1.00× to 1.26×, firing intervals from 1.05× to 0.64×, projectile speed from 0.98× to 1.24×, and regular-enemy health from 1.00× to 1.90×. Later sectors mix tighter arc, staggered and crossing formations with telegraphed fire. Mission 1 keeps its authored encounter timeline. Ordinary hostile shots and regular-enemy contact remain one damage, removing the previous mission-six damage jump. Miniboss, main-boss and secret-boss health budgets are unchanged by this pass. See [Balance and builds](BALANCE_AND_BUILDS.md) for the curve and loadout examples.

## Unified upgrade flow

New v146 campaigns use `streamlined-v1` reward rules. Combat pickups define the current weapon kit, permanent rolled gear defines the Garage loadout, and one small run track adapts the campaign. This reward consolidation does not migrate gear affixes or activate the prototype's combat/elemental rules.

Defeating a miniboss still secures carried Asterprints and awards the same rolled Elite gear. Its recovery screen offers **repair one hull**, **add one shield up to four**, or **add up to 12% DOSE up to 100%**. Full reserves disable the corresponding service, and recovery can be skipped. The service is applied once; combat remains frozen and music continues while deciding.

After a nonfinal apex, choose from three unowned perks drawn from six: Precision Relay, Core Surge, Bit Reclaimer, Second Chance, Field Nanites and Delta Reserve. The first choices fill up to **three active slots**. Later choices replace one active perk; there are no ranks or prerequisite nodes. You can keep the current build instead. Press the skill-inspection binding (T by default, View/Share on controller) to inspect active run perks. The offer and committed rewards survive checkpoints without rerolling or repeating their benefits.

Both victory stops offer an optional **VISIT GARAGE**. Equip recovered gear while combat stays paused, then choose **APPLY & RETURN TO ROUND** to commit selected equipment and return to the same pending recovery or perk decision. The run-completion screen also offers **GARAGE**. Classic loaded runs retain their Field Module/Doctrine screens and original rules.

A between-round refit recalculates equipment bonuses while retaining collected weapons, Force configuration, missiles, Bits, DOSE and the run's recorded perks or classic upgrades. It does not heal the fighter: current hull stays unchanged unless a lower maximum requires it to be clamped. Starting-shield gear does not refill spent shields, and repeated Garage visits cannot stack bonuses or recovery. Choosing **MAIN MENU** from this between-round Garage also commits selected gear to the safe checkpoint; **LOAD GAME** returns to that pending decision.

## Asterprint loot and Garage

Gear has four slots: weapon, armor, engine, and Force Pod. Every item has five readable properties: rarity, Signal Power, slot, an intrinsic gameplay perk, and a Vanguard/Aegis/Vector resonance. The drop-only rarity ladder is Common, Uncommon, Rare, Super Rare, and Exotic. Common and Uncommon pieces have one controlled stat, Rare and Super Rare pieces have two, and Exotic pieces have three. Exotic gear cannot appear outside the secret epic-boss reward source.

**Loot Guide** on the start menu renders the actual eleven pickup appearances: red/blue/yellow diamond crystals, an orange-tipped twin missile rack, a white-core armored Defense Bit, the gold-edged blue shield ward, and five equipment-cache rarities. Gear rarity is identified by its colored accents and tiny pips: **grey Common**, **green Uncommon**, **blue Rare**, **purple Super Rare**, and **gold Exotic**. Flight School teaches the same hardware silhouettes. Boss equipment rewards are delivered and banked at victory, so they do not need to drift across the arena as crates.

Signal Power ranges from 100 to 160 and rises gradually with cleared bosses. The average equipped Power supplies at most 5% fighter calibration, preventing a high-Power item from trivializing encounters. All legacy saved stats are clamped into the new ranges when loaded. Intrinsic perks provide the main identity: weapons alter firing behavior, armor changes recovery or damage handling, engines react to collected loot, and Force cores improve absorption, salvage attraction, or rear mounting.

Matching resonance rewards intentional builds. Two Vanguard pieces grant 4% weak-point output; four also grant 3% fighter and Force output. Two Aegis pieces grant one starting shield; four also add one Force interception radius. Two Vector pieces grant 5% DOSE generation; four also grant 4% charge speed and Force deployment/recall speed. Four-piece rewards include the two-piece benefit.

The Garage's **Equipment Pairs** preview separately shows four intrinsic combinations and which requirements are ready or missing. Pair bonuses require both named intrinsics in their specified slots and have no rarity gate, so a useful Common can complete a build:

| Pair | Required intrinsics | Bonus |
| --- | --- | --- |
| Absorption Circuit | Weapon: Pod Synchronizer + Force Pod: Absorption Siphon | Another 0.4% DOSE per Force block. |
| Charged Bastion | Weapon: Siege Coil + armor: Capacitor Plating | 6% more charged fighter-shot damage while a shield remains. Ordinary shots, Force fire and missiles do not receive this pair bonus. |
| Salvage Momentum | Armor: Recovery Weave + engine: Scavenger Drive | Gear pickups grant six seconds of Surge instead of four, while preserving an already longer Surge. |
| Rear Guard | Engine: Vector Governor + Force Pod: Rear Relay | 8% more rear-mounted Force output and 6% faster deployment/recall. |

Pairs add their stated conditional benefit once; they do not change the 5% Signal Power calibration cap. See [Balance and builds](BALANCE_AND_BUILDS.md) for gear and run-perk combinations, plus classic checkpoint compatibility.

- Regular enemies have a 0.6% chance to drop one Field Asterprint: 72% Common and 28% Uncommon.
- A miniboss guarantees exactly one Uncommon Elite Asterprint, with a 12% chance to become Rare.
- A main boss guarantees exactly one Rare Apex Asterprint, with an 18% chance to become Super Rare.
- A secret epic boss guarantees exactly one Exotic Asterprint. No other activity can generate Exotic gear.
- Picking up Common, Uncommon, Rare, Super Rare, or Exotic gear immediately grants 6%, 9%, 13%, 18%, or 25% DOSE and grants a four-second movement/charge Surge, or six seconds with Salvage Momentum. A pickup never shortens an already longer Surge, such as an eight-second ritual reward.
- Gear is magnetized toward the fighter, and Force-core traits can expand its collection range. Classic runs can also retain collection-range Field Modules.
- Miniboss and boss checkpoints immediately bank carried gear. A mission loss also recovers carried gear; returning to the main menu abandons unbanked gear.

The Garage has a fixed 32-item limit. Weapons, armor, engines, and Force Pods are displayed in four aligned columns beneath their matching equipped slots. Each column scrolls independently with the mouse wheel or keyboard; use Tab to focus a column, then use arrow or Page Up/Page Down keys. Equip, lock and dismantle preserve each column's scroll, the outer Garage position, and keyboard focus. Removing a focused item moves focus to the nearest remaining item or its empty column. Locks persist after reloading, and locked/equipped pieces remain protected even if an older action is invoked after the build changes. The outer Garage also scrolls to reach its other sections and launch controls. If a checkpoint would exceed capacity, the system keeps protected gear first, then the highest-rarity and highest-Power pieces; remaining overflow is automatically dismantled into Alloy. A migrated legacy save that is already over capacity must be manually reduced before launching.

Alloy is cosmetic-only. It cannot create gear, focus a slot, raise Power, change perks, reroll stats, or influence rarity. Dismantling awards 1, 2, 4, 8, or 16 Alloy for Common through Exotic gear. Players spend it inside their personal Garage to unlock hangar themes and pilot emblems. The custom bay also has a saved player-defined name. Signal Blue and the Last Signal emblem are free; Cinder Foundry, Nebula Veil, Solar Vault, Void Cathedral, Void Wing, Comet Spear, and Apex Crown are optional cosmetic unlocks with no combat effect.

Only one non-gear combat pickup can exist at a time. After the guaranteed first Force crystal, each eligible kill rolls 2.5% crystal, 1% missile, 0.8% Bit and 1.2% shield while those weapons can upgrade. At the current mission cap, the corresponding rates fall to 0.4%, 0.15% and 0.15%; shield chance stays 1.2%. Total combat-drop chance therefore ranges from 5.5% to 1.9%. Shields bank at most four; surplus kit pickups grant 2% DOSE, or 5% with the active Delta Reserve run perk. Garage equipment persists; run perks reset each new run. Classic checkpoints retain Field Patch's one-hull/one-shield/8%-DOSE fallback and the three-rank limits on Calibrated Sights and Vector Trim, with their Modules, Rank and Doctrine remaining temporary.

For web hosting, upload `index.html`, `flight-school.html`, `flight-school-boot.js`, `training.js`, `onboarding.js`, `input-bindings.js`, `gamepad.js`, `controls-ui.js`, `controls-ui.css`, `run-progression.js`, `run-rewards-ui.js`, `run-rewards-ui.css`, `encounter-tactics.js`, `stage-rhythm.js`, `combat-loss.js`, `ui-text.js`, `ui-text.css`, `sfx-samples.js`, `style.css`, `levels.js`, `systems.js`, `destruction.js`, `game.js`, `assets/`, and `music/` together. No build step is required.

## Store-ready packaging

Zip `index.html`, `flight-school.html`, `flight-school-boot.js`, `training.js`, `onboarding.js`, `input-bindings.js`, `gamepad.js`, `controls-ui.js`, `controls-ui.css`, `run-progression.js`, `run-rewards-ui.js`, `run-rewards-ui.css`, `encounter-tactics.js`, `stage-rhythm.js`, `combat-loss.js`, `ui-text.js`, `ui-text.css`, `sfx-samples.js`, `style.css`, `levels.js`, `systems.js`, `destruction.js`, `game.js`, `assets/`, and `music/` so that `index.html` is at the root of the archive. Upload the ZIP as an HTML5 game on itch.io and enable the “This file will be played in the browser” option.

Damage smoke now scales with lost health for regular enemies, elites and bosses. It uses expanding smoke puffs, heavier output from critical sections and correctly attached stump smoke. Art Inspector's **Damaged → Play Motion** preview animates that smoke without changing the saved combat state.

## Verification

The Dev Lab includes direct tests for all ten elites, ten standard apex bosses, and two epics. During a test, press **F2** or **ART INSPECT** to freeze the encounter. The material controls preview Sealed, Opening, Exposed, Damaged, and Destroyed states; motion can play or step, phases can change, and the studio backdrop can switch to the actual stage. Returning restores the prior encounter state. The inspector and test encounters do not save progression or rewards.

For a private whole-roster comparison, run `python tools/build-destruction-roster-preview.py` and open `artifacts/destruction-roster-preview.html`. It captures all 22 encounters and 38 phases using the actual painter, with family/phase filters, pose stepping and hit flash. Captures use temporary in-memory pilot storage. `tools/build-damage-sprite-preview.py` supplies the detailed individual break-combination and falling-part view.

Run `node tools/verify-game.cjs` for dependency-free simulation checks covering campaign stages, boss transitions, native material registration, modes, checkpoints, damage/collisions, profiles, equipment and pause/audio lifecycle. The v146 release log is `artifacts/game-v146-verification.txt`; these simulated checks supplement browser playtesting.

The v146 reward milestone ships `run-progression.js` and `run-rewards-ui.js`/`.css`. `node tools/verify-run-progression.cjs` checks bounded perk effects, stable drafts, three-slot replacements, skipped rewards, ten-mission ledgers, stale callbacks and immutable validation. `node tools/verify-streamlined-integration.cjs` exercises the live reward route and checkpoint continuity. New-run reward rules are separate from the current gear/combat calculations, and classic checkpoints retain their recorded progression.

For v147 readability, `node tools/verify-combat-readability.cjs` checks rendering order at both flight boundaries in all ten environments, projectile shape/contrast, fighter visibility, smoke priority and 456 core positions across the full 22-encounter roster and 38 phases. Existing smoke, Delta, target-warning, save and progression checks retain their own behavior coverage. `python tools/build-readability-preview.py` generates private frozen scenes and a ten-mission gallery for visual review, without importing real pilot storage. These checks do not certify full-campaign human difficulty or device performance.

For v148 tactics, `node tools/verify-encounter-tactics-model.cjs` checks all authored support groups; `node tools/verify-encounter-tactics-integration.cjs` compares production attacks with frozen v147 volleys and verifies real part-loss effects. `python tools/build-tactics-preview.py` creates private intact/broken comparisons with actual drawing and projectile motion. Intact attacks remain identical; damaged volleys omit existing packets rather than redistributing them.

The v143 build-choice pass puts the main gear effect, equipped pair fit and replacement trade-offs ahead of optional stat details. The Garage preserves expanded comparisons and its independently scrolling columns through item actions. Field Modules show exact effects, current-kit context and run duration; Doctrine paths use plain role headings and explicit prerequisites. `node tools/verify-gear-choice-clarity.cjs` checks all four pairs, sidegrades, alignment changes and read-only previews. `node tools/verify-upgrade-clarity.cjs` checks reward selection, exact effects, Doctrine gates and context refresh after round refits. `python tools/build-build-clarity-preview.py` creates a private in-memory pilot for browser review at `artifacts/build-clarity-qa.html`.

The v144 Garage introduced visible set counts, two-/four-piece progress and per-item replacement counts. Each set has independent expandable effect text; item actions retain its open state. `node tools/verify-gear-sets.cjs` compares those thresholds with the current gear bonuses. Gear normalization retains a one-time `legacySource` copy before projecting current stats, preserving original rolled variants and metadata for future migration. Unsupported future profiles are protected instead of downgraded. The compatibility milestone introduced `ruleset: classic-v1` and `buildVersion: 1` checkpoint markers; untagged saves keep classic behavior, and unsupported rules remain stored but unavailable. v146 adds `streamlined-v1` for new runs without converting those classic saves. `node tools/verify-save-foundation-compat.cjs` covers these production paths.

The separate `foundation-bridge.js` and `node tools/verify-foundation-bridge.cjs` prepare deterministic player configuration and a read-only inventory snapshot for the proposed full foundation. They do not activate its gear or elemental combat rules. The v146 reward screens are live; future work still includes gear migration, typed emissions/events and full-foundation checkpoint validation. Original snapshots preserve data present from v144 onward; they cannot reconstruct fields that older clients already discarded.

Run `node tools/verify-boss-access.cjs` for armor/core damage, forward-shot access, protected states, phase budgets, exposure durations and fractional health readouts. All **13 checks passed** across the 22 encounters; results are in `artifacts/boss-access-verification.txt`. Browser review also confirmed Wreck Reaver's wider gold recesses against the actual stage and Bloodstar losing HP from a body hit.

Run `node tools/verify-movement-polish.cjs` for the dedicated motion checks. All **7 checks passed**, including bounded regular/elite/boss routes, continuous phase changes, firing preparation and identical encounter positions through the actual fixed-step scheduler at 30, 60 and 120 display frames per second across all 22 boss encounters. Results are in `artifacts/movement-polish-verification.txt`.

Run `node tools/verify-enemy-presentation.cjs` for turret charge timing, weighted pose blending, restrained impacts, Reduced Motion and drawing-state isolation. `node tools/verify-combat-feedback.cjs` checks impact priority and the once-per-update guided-shot target cache, including 110 unchanged steering comparisons. `node tools/verify-boss-target-lines.cjs` checks local boss charge cues, preserved windups and visible damaging beams.

`node tools/verify-delta-presentation.cjs` checks encounter-effect layering, the fixed Delta origin, launch timing and display preferences. `node tools/verify-fragment-inspector.cjs` exercises delayed sprite loading across Inspector entry and exit: real queued limbs stay frozen during inspection, while temporary preview fragments remain separate; the real fragment emits once after returning.

`node tools/verify-encounter-feedback.cjs` checks recent-damage feedback across all 22 encounters, core/armor/Delta damage, draw-rate independence, sustained fire, resets and Inspector isolation. `node tools/verify-boss-attack-animation.cjs` verifies complete Rift/Iron pose sequences, unchanged firing rules, shared body/material/collider poses, frozen fragment timing and Reduced Motion Force Pod behavior.

Run `node tools/verify-destruction-sprites.cjs` for independent native PNG ownership and exact RGBA reconstruction of the prepared core/limb atlases. Run `node tools/verify-destruction-runtime.cjs` for real painter/source selection, direct inspector flags, exact limb captures, delayed loading and articulated weakpoint registration. `node tools/verify-destruction-animation.cjs` sweeps every registered animation source and tile. `node tools/verify-mini-muzzle-preservation.cjs` guards measured firing-tip regions that formerly detached with miniboss fins. `node tools/verify-mini-frame-residue.cjs` checks cleaned source frames, all intact/damaged combinations and frame-bounded weakpoint sampling against the original adjacent-row contamination. Reports live under `artifacts/`.

The six checks in `node tools/verify-damage-smoke.cjs` passed, covering progressive output, real hit activation, stump placement, frame-rate consistency, Clear Combat budgets and isolated Art Inspector playback. Results are in `artifacts/damage-smoke-verification.txt`.

The earlier `verify-detachable-parts`, `verify-severed-silhouettes` and `verify-retained-islands` reports document the retired runtime contour-cutting method. Their polygon and flood-fill results are historical; they do not certify the current sprite-layer artwork. The current PNG, runtime and animation audits above cover the replacement.

The subsequent checkpoint/Delta correctness fixes passed **32 affected checks**: mode13, refit5, victory lock1 and boss access13. Spent stage defenses survive checkpoint reloads; protected arrival and phase windows preserve Delta readiness. Gear/drop balance values were unchanged during the separate power audit.

These harnesses use isolated browser mocks and never read or change real player saves. A separate in-memory browser pilot verified all four equipment-pair activation states and deep inventory actions. The shipping build was also checked with existing gear, at desktop and narrow widths, with no browser errors. GPU output was visually sampled for elite and main-boss combat; full-campaign balance and performance across devices still need sustained playtesting. Boss arrival remains music-only.

For a local browser build, run `python -m http.server 8765 --bind 127.0.0.1`, then open `http://127.0.0.1:8765/`.

On Windows, `./Start-Game.ps1` starts the local preview as a hidden background process and checks that the game responds before reporting its URL. It safely reuses an existing Starfighter server on the same port. Preview logs are stored under `artifacts/`. Run it again after restarting the computer. Keep the same browser and `http://127.0.0.1:8765/` address to use the same locally stored pilot; a different hostname or port has separate browser storage. Git is not required to play the local build.

## Notes

- High scores are saved locally in the browser.
- If browser storage is blocked, full, or an existing profile cannot be read, a **SESSION SAVE ONLY** badge explains the fallback. The original unreadable profile is preserved. Session-only changes may be lost when the tab closes.
- Supplied combat sound effects load from `assets/audio/sfx/` with synthesis fallback. Menu and stage themes load from `music/`.
- The Google font import gracefully falls back to system fonts when offline.

## Story challenge pass

The front Force pod previously intercepted almost every aimed threat that could reach a stationary fighter. From mission 2, every third completed drone/turret, elite or main-boss attack cycle can prepare a narrow amber lance. Its target is locked when the 0.65-second tell starts; it never tracks a subsequent dodge. The tell cannot collide, and destroying a regular carrier cancels it. Released amber fire bypasses Force and Bits, while ordinary shields and hull protection still work. Pink fire remains blockable. Wall volleys announce a fixed 140-unit escape gap offset from the current player position, with a 0.8-second harmless warning.

Threat pressure now rises earlier across missions 2–5. Formations gain one command drone from mission 2, stagger from mission 3, and cross from mission 5. Elite and main-boss cooldown scaling persists after every attack. Elites retain a relocation opportunity between recoil and their next firing tell. No boss HP budgets, mission lengths or gear/Doctrine percentage bonuses were increased in this pass.

Fighter and Force charge output now follows `1 + 7 × charge²`: ordinary shots remain 1 and full-charge fighter shots remain 8; the minimum charge no longer starts at 3.44 damage. Force packet output and missile output are restrained, and Sync automatic fire shares a 0.24-second emission gate with manual Force fire. A charged Force packet that meets that gate is queued for the next slot instead of being discarded. Gear traits and equipment-pair identities remain intact.

Twelve dedicated checks in `tools/verify-story-balance.cjs` verify real Story collisions, evasion, warning safety, carrier cancellation, shared firing cadence, mission limits, shield bounds, checkpoints and display preferences. The 60 actual-update arsenal measurements in `artifacts/story-arsenal-comparison.json` distinguish emitted output from connected damage. The seeded before/after probe in `artifacts/campaign-challenge-updated.json` uses 90 attack snapshots, 40 field segments and 30 short boss fights with no equipped gear, Doctrine or Modules. Its simple pilot is a diagnostic, not a human difficulty rating. A private browser pilot confirmed amber tells, parked/dodged hits, ordinary pod blocks and the shield cap without changing the real pilot's save.

## Guided Flight School

Story **New Game** offers **Play Short Intro** or **Skip Intro**. First Flight contains five practical drills: movement, tap/charge fire, the first Force crystal, deploy/block/front recall, and armor versus exposed cores. Its final action returns to the same briefing; **Depart** launches Story. The main-menu **Flight School** remains an optional eleven-lesson reference with advanced weapon colors, rear mounting, support pickups, Delta, gear, synergies and progression. Practice can be retried, skipped or exited at any time. Skips and replay jumps do not award completion without the course's demonstrated objectives.

Later systems explain themselves when useful. Story support pickups and first Delta readiness queue one short note at a time, waiting for field combat rather than covering bosses or arrival sequences. Recovery and run-perk choices explain their exact effects; Flight School teaches that reward route alongside permanent Garage gear. Classic loaded runs retain the Field Module and Doctrine explanations. Recovered gear is explained in the Garage, and an equipped pair triggers the synergy note. Combat tips expire after nine visible seconds or acknowledgement; decision notes stay until acknowledged or committed. Pause, help, training and profile changes cannot leak a note into another screen or pilot. Each pilot remembers learned tips.

The school uses a separate document with temporary storage and imports only audio/display preferences. Practice rewards cannot enter the real Garage or checkpoint. Short-intro completion is recorded separately from full-school graduation. Completing the full course also marks its advanced guidance learned; older full-school graduates migrate without repeat explanations. See [Flight School](TRAINING_GUIDE.md) for course and bridge details. Verification passed **25 controller, 25 actual-game practice integration, 8 guidance-controller and 6 guidance-integration checks**, alongside the game regression suite.

## Complete part removal

The former narrow removal cones could leave a fin's forward or rear rim outside the mask, so it continued animating after the fragment fell. Removal now covers the complete outboard assembly at its joint, with stable boundaries between neighboring groups, a small sampling overlap and solid-alpha erasure. Exact source-alpha cleanup removes newly separated unseeded scraps while preserving the largest hull, live cores and central housings. Body paint, exposure material and hit flashes stay inside that same masked composite. Bloodstar keeps its authored masks.

Independent regression regions on Reaver, Forge and Signal Executor detect the old fault in **113 pose checks**, with over **10,207 sampled native pixels** left behind. The updated regions contain zero remaining pixels across 144 region/pose checks; 772 full-render checks also pass. The dedicated cleanup agrees with an independent flood reference in **407 synthetic and 14 native cases**, and its pure-CPU measurements are about **0.5 ms for a mini and 1.3–1.6 ms for an epic** on this host, excluding capture/upload costs. See `artifacts/native-sever-final-summary.json` for the full source-alpha audit and its sampling limits.

## Anatomical weak-spot pass

The previous mini hexagonal slot, horizontal shutter, separate lower lip and Reaver gradient plate are removed. Each organ selects its own connected native luminous material; nearby accents of another hue stay unchanged. Exposure warms those same irregular features to gold, preserving source luminance variations. Dim miniboss circuits have a separate calibrated response so their existing thin power lines remain visible. No new glow circle, bevel, armor cutout or replacement bitmap is added. Bloodstar's approved artwork and palette remain unchanged.

Gravebell's chain targets now follow the actual violet claw organs instead of gray side ports. Its crown and one Omega talon track were corrected in individual authored poses; collision and part removal use the same corrected points. Generated intermediates for Void Leviathan, Gravebell, Solar Hydra and Omega Heart (including their secret variants) lost or relocated emissive anatomy. Those assets are retired from playback in favor of their coherent 16 authored poses with continuous body movement. Prism Warden retains its coherent 32-pose sequence.

`node tools/verify-anatomical-sockets.cjs` passed **8 checks across 3,424 actual source crops**, with zero missing or faint-only organ selections. It tests native boundaries, hue exclusion, segmented rings, dim circuits and input immutability; see `artifacts/anatomical-sockets-audit.json`. This supersedes the legacy generic-relighting evidence in `tools/audit-enemy-materials.cjs`. Updated sever audits for Gravebell, Omega Heart and Null Cathedral each cover **512 combined sealed/open poses and 1,664 individual cuts** in total, with zero actual holes, protected-housing loss, unseeded remnants or largest-body loss. Reports are `artifacts/*-silhouettes-v133.json` and `artifacts/*-retained-v133.json`. These source audits complement browser review; they do not rate animation appeal or device performance.

Controller/rebinding checks are `node tools/verify-gamepad.cjs`, `node tools/verify-input-bindings.cjs` and `node tools/verify-controls-integration.cjs`. They cover standard-pad input normalization, binding persistence/conflict swaps and the real movement/fire/Force/pause/menu/practice paths with simulated controllers. Browser QA exercises the actual settings UI. Physical controller hardware and nonstandard mappings have not been verified on this host.

For v149 pacing, `node tools/verify-stage-rhythm.cjs` compares native field occupancy against the frozen v148 source and checks mission timing, recovery, pause, checkpoint and Garage behavior. `node tools/measure-build-matchups.cjs --label=v149` measures connected boss damage and separate normal-hull snapshots; `--perks=3` adds the earned-perk sensitivity. `python tools/build-rhythm-preview.py` builds a private browser preview with temporary storage and explicit 120 Hz step controls. See [Encounter pacing](ENCOUNTER_PACING.md) for assumptions and the human validation boundary.

For v150 comfort, `node tools/verify-loss-retry.cjs` checks native loss attribution, checkpoint restoration and attempt accounting; `node tools/verify-audio-clarity.cjs` checks the actual synthesis graph and cue scheduling; `node tools/verify-ui-text.cjs` checks text scaling and safe persistence. `python tools/build-comfort-preview.py` creates an isolated 32-item Garage, loss/retry and cue-audition browser fixture with temporary storage. Listening and physical-controller play remain human validation work.

For v151 sampled effects, `python tools/build-game-sfx.py` rebuilds from preserved WAV masters, `node tools/verify-sfx-samples.cjs` checks the sample bank and `node tools/verify-sampled-sfx-integration.cjs` checks the real SFX/game event paths. `python tools/build-sfx-audition.py` creates an explicit native playback/mix preview. See [Sound assets](SOUND_ASSETS.md) for edits, source integrity and the speaker/headphone listening boundary.
