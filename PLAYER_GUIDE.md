# Starfighter: Last Signal — Player Guide

You pilot one fighter through a living armada to carry humanity's last signal home. Your ship's firing kit grows during a run; recovered equipment and cleared missions belong to your pilot profile.

[Play v148](http://127.0.0.1:8765/?v=148). New campaigns use a small three-slot run-perk track. Random gear rolls, Signal Power, current gear sets and intrinsic pairs remain part of your build.

## Start menu and modes

| Choice | What it does |
| --- | --- |
| Story Mode | Ten full missions, each with an approach, an elite/miniboss, a recovery choice, and an apex encounter. Nonfinal apexes offer a run perk; mission ten finishes the Story run. |
| Rush Mode | Ten main bosses back to back, with run-perk choices between victories. Starts with red Level 3 Force, dual missiles, two Bits, a ready Delta Weapon, at least eight hull and three shields. No approach waves or minibosses. |
| New Game | Opens the selected Story/Rush mode's first mission briefing. DEPART starts the new run, keeping your pilot, Garage and permanent unlocks. |
| Load Game | Resumes the active pilot's last safe checkpoint, including the recorded run build, skills, weapons, totals, and pending upgrade choice. |
| Garage | Equip recovered gear, protect favorites, dismantle unwanted items and customize your bay. Launch with Loadout opens the selected mode's briefing. Ordinary menu changes apply to new runs; a checkpoint keeps its recorded build unless you commit a between-round refit. |
| Mission Select | Choose a completed mission to review its briefing, then DEPART to replay that full level. The replay ends after its apex. Each mission unlocks separately; clearing Rush bosses or developer tests does not clear a Story mission. |
| Profiles | Three independent pilot slots, each with its own Garage, progress, checkpoint and history. New Pilot creates a separate profile. |
| Loot Guide | Shows the eleven actual pickup appearances and their functions. |
| Flight School | Optional eleven-lesson practice, including advanced weapons, gear and synergies. Replay any lesson without changing your campaign or Garage. |
| Flight Manual | Controls, arsenal, boss exposure windows, display options and fullscreen. |
| Dev Lab | Direct encounter/level tests. Test rewards, skips and clears do not count toward normal progression. |

The current violet-eclipse title menu stays as it is. Its former right-hand mission card returns on a separate pre-launch briefing, beside the chosen mission's name, sector, description, hazard, elite, and **Expected Apex**. Rush bypasses the approach and elite. Review the plan and select **DEPART** when ready. **Back** or **Escape** returns to the menu, Garage, or mission archive that opened it. Viewing or leaving a briefing does not replace a checkpoint; replacing an existing run asks for confirmation only on departure. Load Game and Retry keep their direct resume/restart behavior.

Load Game is a safe-checkpoint system, not a recording of every projectile. Checkpoints cover mission starts, the post-elite stretch, pending recovery/perk choices, and boss approaches. The same perk offer returns after loading; committed loot, services and rewards cannot be claimed twice. Older classic checkpoints retain their Field Modules and Doctrine rather than converting mid-run. Closing or leaving an unfinished run can be resumed from its existing checkpoint. Saves are local to the browser and pilot slot; the session-only badge warns if browser storage is unavailable.

After defeat, the loss screen identifies the final hit and suggests one response. **Retry Checkpoint** restores the recorded mission, build, arsenal, hull and run perks. A checkpoint labeled **Apex Approach** returns directly to that boss arrival. Attempt score and combat counters start over because the failed attempt has already been recorded; recovered gear stays banked. Used guard charges remain in their checkpoint state. The immediate retry copy belongs to this pilot and browser session; defeat clears the normal persistent checkpoint until you choose retry. **Restart Campaign** starts a fresh campaign instead. DEV retry restarts only its selected study and never uses a pilot checkpoint.

You can also choose **Open Garage** after a loss. Equip recovered items, then choose **Apply & Retry Checkpoint** to use that loadout at the same checkpoint. It keeps checkpoint hull, shields, arsenal, run perks and spent guard charges; lowering maximum hull clamps the recorded hull. It grants no free healing or starting shields. **Back to Flight Report**, Escape or controller B returns to the same loss report. From there, ordinary **Retry Checkpoint** still uses the recorded build; changing Garage equipment alone does not apply it to the retry.

In **Flight Manual → Display & Comfort → Text Size**, choose **Standard** or **Large**. Large increases menu copy, gear details and DOM HUD labels by 20%, with scrolling where needed; the fighter and gameplay space stay the same size. The preference is independent of pilot slots and also applies in isolated Flight School. A storage-status message tells you whether the preference was saved or is active only for this session.

## Learn before departure

Every Story **New Game** offers **Play Short Intro** or **Skip Intro**. The short **First Flight** teaches five essentials: movement, quick and charged shots, collecting your Force gun, deploying/blocking/recalling it, and hitting exposed boss cores. Try each action, then choose **Continue**. Completing the fifth drill returns to your briefing; choose **Depart** when ready. You can retry, skip or exit throughout.

The main-menu **Flight School** keeps all eleven optional lessons, including rear mounting, weapon colors, missiles, Bits, shields, Delta, equipment and synergies. Its replay menu lets you revisit a specific lesson. Practice uses an isolated simulator: rewards, equipment and progress stay out of your real Garage and checkpoint.

During Story, short notes explain newly earned support weapons and Delta at safe field moments. Recovery and run-perk screens show their exact effects, and Flight School teaches which rewards go where. Gear is explained when you visit the Garage, and an active equipment pair introduces synergies. Classic runs keep their Module/Doctrine guidance. Notes appear one at a time and are remembered per pilot. **Got it** dismisses a note; pausing hides it and preserves its remaining time. Decision notes stay beside their relevant screen until acknowledged or committed.

## Flight and combat

Scenery stays behind the fighter, live hazards and bullets, including near the top and bottom edges. Round pink bullets can be blocked by Force or Bits; angular amber shots pierce them. Dark outlines and bright rims help distinguish threats against every environment. Smoke thins around the fighter and exposed cores without changing hitboxes or enemy damage. Invulnerability keeps the ship visible; Reduced Motion uses steady visibility. Clear Combat further dims scenery and smoke.


The tables below show defaults. Use **CONTROLS** on the main menu, Pause or Flight Manual to rebind keyboard and controller actions. Choose a slot, then press a replacement. Conflicting bindings swap; **Restore Defaults** resets both devices. Preferences belong to this browser and apply to every pilot. Flight School imports them, and changes made in its Controls panel also update the parent game's input preferences without changing the pilot or checkpoint. If storage is unavailable, the panel reports that changes are active for the session.

| Controller default | Action |
| --- | --- |
| Left stick / D-pad | Move; partial stick movement gives slower flight. |
| A / Cross or RT / R2 | Tap to fire; hold and release to charge. |
| LB / L1 or LT / L2 | Precision flight. |
| X / Square | Deploy / recall Force. |
| Y / Triangle | Front / rear mount. |
| B / Circle | Delta at 100% DOSE. |
| View / Share | Inspect active run perks; classic runs show Doctrine. |
| Menu / Options | Pause. |

Menus always use stick/D-pad, A/Cross to confirm and B/Circle to go back. Menu/Options also resumes Pause. Flight School uses A/Cross to continue when a lesson is complete; its build workshops use menu navigation. A disconnected active controller pauses the game. Release held controls before resuming or reconnecting. Browser-standard mappings are required; the Controls panel reports connection status.

Controller focus follows the active screen and visible controls. Up/down continues through the current scrolling gear column; left/right moves to visible controls in neighboring columns. Sliders and dropdowns adjust with left/right. Rebinding returns focus to its binding row when saved or canceled; controller B remains available as a gameplay binding while capture is active.

| Input | Action |
| --- | --- |
| WASD / arrows | Move |
| Z / Space / X, or left click | Tap to fire; hold and release to launch a charged shot |
| Shift | Precision movement at 45% speed |
| C | Deploy or recall the Force gun |
| V | Switch its front/rear mount |
| Q | Use Delta at 100% DOSE |
| T | Inspect active run perks; classic runs show Doctrine |
| Escape / P | Pause |

Mouse Flight can be enabled from its on-screen control. Keyboard movement takes priority. The tiny collision guide shows the fighter's actual hit boundary; the shield artwork is not the collision shape.

Shield impacts read cyan, guard protection reads gold, and lost hull reads pink. At one hull, the steady **HULL CRITICAL** label makes the danger visible without a flashing warning. Reduced Motion keeps the fighter's invulnerability visibility steady and suppresses banking and camera shake. Projectiles remain above cosmetic smoke and debris.

Boss body hits now deal 25% shot damage; the former rule that armor takes no damage has been removed. Shoot exposed cores for full damage and your weak-point bonuses. Body hits and core hits reduce the same phase health pool, so you can finish a boss without chasing a tiny surviving rear weak point. Protected entry, phase transitions and epic rituals still prevent damage. Each core has its own health, and a broken core stays destroyed for that phase. Normal apex bosses have two phases. Their readouts show actual current / maximum HP, including fractional damage, so small hits remain visible.

Wreck Reaver's three weak points follow its native power seams and cylindrical reactor slots, warming to gold while exposed. They stay open for 3.2 seconds; other elites retain their 2.35-second windows. Bloodstar has larger core hit areas, with 3.2-second openings in phase one and 2.8 seconds in phase two. Its energy changes from native red through yellow to bright yellow. Other enemies expose their own authored vents, crystals, veins or reactor bars; surrounding armor and grooves stay visible.

All ten minibosses, ten main bosses and both secret bosses now lose actual outer fins, jaw blades, wings or pods from their own sprite art. Limbs separate at their joints, fall, spin and trail smoke; the broken silhouette stays visible as the body animates. Central reactor housings stay solid and scorched rather than opening a hole through the body. Some larger limbs detach only after every supporting core has broken. Bloodstar keeps its existing authored tentacle breakaways. Surviving weak points remain attached to the moving body, and later phases use their own intact parts.

Part breaks now change attacks. A destroyed side cannon or jaw stops its assigned salvo; other outer assemblies remove lanes from their fans, rings, homing groups, walls or rain. Twin Maw's phase-two jaws each need two supporting cores destroyed. Hydra's middle head can stop its beam, even after charging begins. Gravebell's chain weights clear part of the rain band. A short **DISABLED** message names a weapon that has shut down. Shots already in flight continue, and new phases restore their own intact weapons. See [Boss tactics](BOSS_TACTICS.md) for the full roster.

Damage smoke builds gradually as regular enemies and individual boss sections lose health. Critical sections produce denser, larger rolling smoke; a severed limb vents smoke from the joint left on the body. Shots stay above these cosmetic effects, and Clear Combat reduces their opacity.

To test any encounter, choose **DEV LAB** on the main menu, then select an elite, main boss or epic directly. **F2 / ART INSPECT** opens the material study: choose **DAMAGED** and **PLAY MOTION** to preview damage smoke, or **DESTROYED** to inspect the severed silhouette. **RETURN TO TEST** restores the prior encounter.

Before a main or secret boss enters, a visual warning names the incoming apex and gives you a protected 4.2-second arrival window. The current music fades down through that window, then the boss theme fades in over 0.65 seconds. This transition always uses music only; the former alarm preference has been removed. **Music** volume, pause, help, tab hiding and master mute apply throughout.

## What the drops look like

![Actual pickup appearances](G:/starfighter/artifacts/loot-guide-v139-proof.png)

| Appearance | Function |
| --- | --- |
| Red diamond crystal | Equips/upgrades red Force: direct laser fire, with penetration at Level 3. |
| Blue diamond crystal | Equips/upgrades blue Force: angled fire and higher-level ricochets. |
| Yellow diamond crystal | Equips/upgrades yellow Force: guided wave rays. |
| Orange-tipped missile rack | Adds homing missiles; two pickups give dual launchers. |
| White-core armored drone | Adds a Defense Bit; maximum two. Its hardware matches the units guarding your ship. |
| Gold-edged, blue faceted ward | Adds one shield charge, up to four. Each charge absorbs one hit; surplus pickups grant 2% DOSE, or 5% with Delta Reserve. |
| Grey / green / blue / purple / gold equipment cache | Common / Uncommon / Rare / Super Rare / Exotic Asterprint. Tiny pips also distinguish the five rarities. |

The first colored crystal equips the detachable, indestructible Force gun. Later crystals raise its level, to a maximum of three, and select its color. It blocks colliding pink bullets, damages enemies by contact, and can fight while deployed ahead of the ship. Amber fire pierces Force and Bits. From mission 2, dodge amber fire before the locked shot arrives. Regular enemies may show an aiming line; bosses use a small attached charge glow. The 0.65-second windup is harmless. Destroying its regular carrier cancels the shot. Amber wall volleys mark a safe gap before release. Rear mounting reverses its firing direction.

Story/Replay pickup limits unlock by mission:

| Mission | Force level | Missile level | Defense Bits |
| --- | ---: | ---: | ---: |
| 1 | 1 | 1 | 1 |
| 2 | 2 | 1 | 1 |
| 3 | 2 | 2 | 2 |
| 4–10 | 3 | 2 | 2 |

Pickups above the current limit add score and 2% DOSE, or 5% with the active Delta Reserve perk; crystals still select their color. Rush and direct Dev Lab encounters retain the full kit. Load Game also applies these limits to older Story checkpoints while retaining their recorded gear bonuses, hull and consumed stage defenses.

Defense Bits hover above and below the fighter. They intercept pink bullets that touch them and add shots when the red Force weapon is selected. The Bit Reclaimer run perk adds 0.4% DOSE per Bit block. Classic runs can retain their corresponding Doctrine upgrade. Bits do not form a continuous barrier around the ship.

In Story and Mission Replay, the larger drone leading a four-enemy formation can help recover missing support weapons. From Mission 2 it carries your first missile launcher if you have none; from Mission 3 it can carry your first Bit once you have a launcher. You must own Force, destroy the leader and collect the pickup. An existing combat pickup must be collected or leave the field before another appears. Further launcher/Bit upgrades remain random and follow the mission limits above.

Regular enemies have a 0.6% equipment-drop chance: 72% Common and 28% Uncommon. A miniboss awards Uncommon gear, with a 12% upgrade chance to Rare. An apex awards Rare gear, with an 18% upgrade chance to Super Rare. Secret epics award Exotic gear. Boss rewards are delivered and banked directly at the victory checkpoint, so they do not need to float across the arena as a pickup crate.

Collecting equipment grants 6 / 9 / 13 / 18 / 25% DOSE by rarity and a four-second movement/charge Surge, extended to six seconds by Salvage Momentum. A pickup preserves an already longer Surge, including the eight-second ritual reward. DOSE also grows from kills and Force absorption. Delta erases ordinary enemies and hostile bullets while dealing controlled boss damage.

## Four kinds of progression

1. Combat pickups build the current run's Force, missiles, Bits and shields.
2. A miniboss offers recovery: repair one hull, add one shield up to four, or add up to 12% DOSE up to 100%. Choose one service or skip it. Full reserves disable that option. Music continues while you choose; combat freezes.
3. A nonfinal apex offers three unowned run perks. Keep up to three unique perks; once full, replace one or keep your current build. There are no ranks or prerequisites, and perks reset on a new run.
4. Asterprint equipment persists in the Garage. The four slots are weapon, armor, engine and Force Pod. Rarity, Signal Power, random stat rolls, intrinsic perks and resonance define the build.

| Run perk | Exact effect |
| --- | --- |
| Precision Relay | Breaking a boss core generates 6% DOSE. |
| Core Surge | Breaking a boss core grants a four-second Surge: +6% movement and charge speed. |
| Bit Reclaimer | Each hostile shot blocked by a defense Bit generates 0.4% DOSE. |
| Second Chance | Once each mission, survive a lethal ordinary hull hit with one hull. |
| Field Nanites | After defeating an apex, repair one hull, up to maximum hull. |
| Delta Reserve | Surplus kit pickups generate 5% DOSE instead of 2%. |

Combat DOSE rewards receive equipped DOSE-generation bonuses. Recovery recharge grants exactly 12 percentage points before the 100% cap. Core Surge shares the existing Surge timer and uses the strongest active bonus; overlapping Surges do not multiply.

These are the `streamlined-v1` rules for new campaigns. Loaded classic checkpoints retain their earlier miniboss Field Modules and apex Doctrine tree, including their recorded choices. The gear and combat-stat model remains the same in both routes; the separate foundation workbench's proposed gear migration and elemental effects are future work.

The Garage holds 32 items in four independently scrolling columns: weapons, armor, engines, and Force Pods. Use the wheel over a column, or focus it with Tab and scroll with arrow/Page Up/Page Down keys. Equipping, locking and dismantling keep your column positions, page position and keyboard focus. After an item is dismantled, focus moves to a nearby item or the empty column. Locks persist after a reload; equipped and locked pieces are protected. The Garage page itself also scrolls so its other sections and launch controls stay reachable. Overflow keeps protected gear and then the strongest remaining pieces; the rest becomes Alloy. Alloy buys bay themes and emblems only. It does not craft, reroll or strengthen combat gear.

## Equipment pairs and build choices

**GEAR SETS** beneath the equipped cards shows how many Vanguard, Aegis and Vector pieces you have equipped, with progress toward two and four pieces. Open a set to read its current bonuses. Four pieces keep the two-piece benefit. A mixed two-plus-two loadout can activate two sets. Each item also shows its family; a stored candidate previews the resulting count, such as **AEGIS · 1 → 2/4 PIECES**. The set details stay open when you equip or lock an item.

Each gear card leads with its main effect, then explains a pair it completes or the partner it needs. A **TRADE-OFF** warning identifies an effect, active pair or alignment bonus you would give up. Power compares the two numbers; it does not declare an item the best choice for your build.

Open **STATS & COMPARISON** for the equipped-to-candidate stat rolls, replacement name, source and alignment changes. Those numbers describe the items' rolls rather than your combined fighter stats. **Starting shields** apply to a new run; refitting does not refill them. Expanded details stay open when you equip or lock gear.

Expand **EQUIPMENT PAIRS & RESONANCE** beneath your equipped slots to see active bonuses and missing intrinsics. Both listed pieces must be equipped in the correct slots. Every rarity can complete a pair, including Common; keeping a useful intrinsic can matter more than a small Power increase. Signal Power's fighter calibration stays capped at 5%.

| Pair | Equip these intrinsics | Extra benefit |
| --- | --- | --- |
| Absorption Circuit | Pod Synchronizer weapon + Absorption Siphon Force Pod | Another 0.4% DOSE each time the Force blocks a hostile shot. |
| Charged Bastion | Siege Coil weapon + Capacitor Plating armor | 6% more damage for charged fighter shots while you have a shield. It does not boost normal shots, Force shots or missiles. |
| Salvage Momentum | Recovery Weave armor + Scavenger Drive engine | Gear Surge lasts six seconds instead of four; longer remaining Surges are kept. |
| Rear Guard | Vector Governor engine + Rear Relay Force Pod | 8% more rear-mounted Force output and 6% faster Force deployment/recall. |

The Garage’s Equipment Pairs panel flags owned combinations you can try. Open it to see which requirements are equipped, in storage or not owned. Stored matches name the actual item. Both required pieces must be equipped to activate a pair; compare any lost effects, set bonuses and rolls before swapping.

Alignment remains a separate choice. Two Vanguard pieces grant 4% weak-point output; four add 3% fighter and Force output. Two Aegis pieces grant a starting shield; four add one Force interception radius. Two Vector pieces grant 5% DOSE generation; four add 4% charge speed and Force deployment/recall speed. Four-piece sets retain their two-piece reward. Refitting does not refill starting shields.

Run-perk cards state the event that activates each effect. Precision Relay and Core Surge reward core breaks; Bit Reclaimer needs a collected Bit; Delta Reserve matters when your current kit is full. A later draft preserves its offer while you inspect the build or visit the Garage. Full slots require an explicit replacement, or you can keep all three current perks.

For a blocking build, combine **Absorption Circuit** with Aegis gear and consider **Bit Reclaimer** for your separate defense Bits. For shielded charge fire, use **Charged Bastion** with **Core Surge** and a recovery perk. **Precision Relay** rewards deliberately breaking exposed cores. See [Balance and builds](BALANCE_AND_BUILDS.md) for complete four-slot examples. Classic Module cards and Doctrine paths retain their exact effect details and prerequisite rules on classic checkpoints.

## Refitting between rounds

After an elite, **VISIT GARAGE** is available on the recovery screen. After a nonfinal apex, it is available on the run-perk screen. Classic runs keep Garage access on their Module/Doctrine screens. Both visits are optional, and combat stays paused while you change equipment. The final run-completion screen also has a **GARAGE** option.

Choose **APPLY & RETURN TO ROUND** to apply your selected equipment to the current run and return to the same pending recovery or perk choice. Choose or skip the reward to advance. Classic runs return to their recorded Module/Doctrine choice. If you choose **MAIN MENU** from this between-round Garage, your selected build is also committed to the safe checkpoint. **LOAD GAME** returns to the pending decision with that build; it does not award the same loot or recovery again.

Refitting keeps your collected weapons, Force setup, missiles, Bits, DOSE and active run perks or classic upgrades. Gear bonuses are recalculated without stacking. Current mission arsenal limits and the four-shield bank still apply. Current hull does not increase; if the new maximum is lower, current hull is reduced to fit. Starting-shield equipment does not replace spent shields. Repeated visits provide no free healing or shield refills.

Equipment changes made through the ordinary menu Garage still apply to new runs. Loading an existing checkpoint uses its recorded build, including any refit you committed between rounds.

## Mission and enemy roster

| Mission | Elite | Main boss |
| --- | --- | --- |
| Shattered Meridian | Wreck Reaver | The Bloodstar |
| Cinder Rail | Forge Gnawer | Twin Maw |
| Pelagic Trench | Abyss Stalker | Helix Crown |
| Crystal Vesper | Vesper Shard | Rift Wraith |
| Iron Orchard | Seed Tyrant | Iron Bloom |
| Hollow Engine | Hollow Maw | Void Leviathan |
| Necropolis Relay | Relay Warden | Prism Warden |
| Helios Scar | Cinder Seraph | Gravebell |
| Eventide Engine | Gravity Lancer | Solar Hydra |
| Last Signal | Signal Executor | Omega Heart |

The stages introduce debris, crushers, currents, beams, cable growth, living gates, EMP echoes, solar fronts, gravity wells and a final collapsing-beacon combination. Approaches build pressure gradually through more mixed formations, tighter lanes and faster fire. Ordinary shots and regular-enemy contact still deal one damage; later missions no longer suddenly double that damage. Boss and miniboss health budgets are unchanged by this pass.

Every Story mission and Mission Replay has 48 seconds of field combat before the elite, then a fresh 36-second field run after the recovery choice (or a classic Field Module). Shattered Meridian keeps the timing you approved; later missions now have comparable length with their own enemy formations and hazards. The elite fight and time spent choosing upgrades, pausing or visiting the Garage do not eat into the post-elite run. Boss fights and protected arrival sequences add their own time.

Wings weave within bounded stage-specific lanes, drones make deliberate transfers and steady their aim tells, and turrets hold a stable firing platform. The ten elites use individual lane sequences. Main bosses and secret epics keep their own authored paths, preserving path continuity when phase speed changes; their restrained banking follows actual movement. Each main boss keeps its attack patterns and two-phase artwork.

## Secrets and hidden encounters — spoilers

The two coded secret bosses are **Null Cathedral** and **Miasma Throne**.

- Defeat all ten different main bosses on the same pilot profile to unlock secret encounters. Rush victories count toward those apex records, while full-mission replay unlocks remain separate.
- After unlocking them, each new Story run has a 10% chance to schedule one secret epic. Each epic accounts for 5% of new runs. The selected epic replaces one randomly chosen mission's apex; this is not a separate 10% roll at every level.
- Rush and Mission Replay keep their stated encounters rather than rolling a random secret replacement.
- Epics have four phases. Between phases, corner guardians appear. Destroy the bright active guardian before the timer expires; you do not need to destroy every inactive mount. Guided missiles and yellow Force track the active guardian. Force contact also damages it, so repositioning the pod can help clear the countdown.
- A successful ritual readies Delta, grants a shield and an eight-second Surge, and protects the next phase from toxin. A failed ritual leaves the next phase exposed to severe toxin damage that bypasses the usual shield/invulnerability safety.
- Defeating an epic awards Exotic gear. Ordinary enemies and normal bosses cannot award Exotic items.

Dev Lab exposes both epics for development testing even before normal unlocks, but this does not unlock them or grant their rewards. There are currently no additional coded cheat sequences, hidden mission entrances or collectible Easter eggs. Those can be designed deliberately later rather than being implied by decorative background art.

## This polish pass

All ten elites, ten main bosses and both secret epics were reviewed. Their vulnerability lighting now selectively relights native colored energy, preserving neutral armor, shadows and source opacity. Bloodstar keeps its approved red-to-yellow progression. Ritual guardians use authored enemy art instead of the former rotating cross shape.

The start menu uses the supplied violet-eclipse artwork as its full background, with controls on the left so the fighter and eclipse remain visible. The supplied **Space Blaster** theme repeats while you browse menus and switches to the level or boss music when you launch. Music volume and mute apply to the intro too. If it is quiet on first load, click or press a key in the menu to allow browser playback. See [Art handoff](G:/starfighter/ART_HANDOFF.md) for the installed artwork and music details.
