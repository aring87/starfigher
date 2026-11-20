# Balance and equipment builds

This pass makes campaign pressure rise smoothly and gives equipment intrinsics useful partners. It also keeps the Garage stable while you compare pieces. Controls, modes, saves and secret encounters are covered in the [Player Guide](PLAYER_GUIDE.md).

Development v160 corrects biased random stat sampling for future gear and adds current-kit/guard context to run perks. Scavenger Drive's description now states its existing 10% pickup Surge (six seconds with Salvage Momentum); Vector Governor applies to both Force mounting sides. [Build context review](BUILD_CONTEXT.md) records the exact scope and evidence. Existing rolls, rarity odds, authored bounds and combat budgets stay in place.

[v146](http://127.0.0.1:8765/?v=146) consolidates rewards for new `streamlined-v1` campaigns. Random gear affixes, Signal Power calibration, current two-/four-piece sets and exact intrinsic pairs remain unchanged. Loaded classic checkpoints keep their original Field Modules and Doctrine. The standalone foundation workbench's gear and elemental changes are future work.

## v149 encounter rhythm and measured builds

Missions 2–10 alternate active groups, eight seconds without new enemy/hazard births, a final test and a quieter boss approach. Active pressure uses 0.85 times the former spawn interval, and the test uses 0.8 times; travel, fire, HP and projectile threat still scale by sector. Existing threats continue moving and attacking. Mission 1 and all 48/36-second clocks are preserved.

The [pacing report](ENCOUNTER_PACING.md) records 36 paired field probes and 80 boss/build snapshots through native 120 Hz updates and collisions. It compares empty Garage, two focused Rare loadouts, mixed rolls and a valid Exotic offense ceiling, with zero/three run-perk cases. A meter's invulnerability is separate from normal-hull survivability. Actual peak field pressure remains close to the prior version while sustained enemy and shot occupancy decrease. Fresh-player fairness validation remains open; these fixtures are not player success rates.

## v148 tactical part loss

All 22 encounters now use authored weapon-support groups. Intact patterns, projectile trajectories, speeds, damage, warning durations, health and attack cadence are unchanged. Once an assembly's supports are all destroyed, its assigned existing packets are omitted. A smaller fan or ring is never re-spaced into a new pattern.

Paired side cannons and Twin Maw jaws lose a complete fan; Hydra's phase-one heads lose their matching fan and the middle head also controls the phase-two beam. Gravebell's weights suppress columns on their side of the active rain band. Other assemblies suppress assigned fan edges, ring spokes, tracking branches or wall/rain lanes. Core-controlled packets remain where authored. Launched shots remain in flight. A beam powered by a destroyed head is canceled immediately, and a new phase starts with its own intact assemblies.

This gives precision part selection a benefit beyond shared HP damage. It intentionally lowers pressure as weapons are dismantled; it does not certify campaign difficulty. The v149 pass measures encounter rhythm and compares starter, focused and mixed builds. [Boss tactics](BOSS_TACTICS.md) records the roster and tests.

## v147 readability boundary

The original roadmap's third priority is visual hierarchy. Decorative foreground is drawn before hazards, enemies, bullets and the fighter; normal scenery receives restrained grading, while Clear Combat retains stronger dimming. Round blockable fire and angular piercing fire keep their collision geometry with stronger contrast outlines. Invulnerable fighter visibility has a higher minimum and remains steady in Reduced Motion.

Smoke emission, growth, density and stump attachment are unchanged. A presentation-only feather reduces each puff's opacity near the fighter and the exact animated positions of intact exposed cores. Hidden, destroyed and protected cores do not create these clear areas. Isolated Art Inspector previews retain full smoke for artwork review. These changes do not alter enemy statistics, rewards, shot timing or collision rules.

## Campaign pressure

Normal approach spawning now applies more pressure during missions 2–5, then approaches fixed caps across missions 6–10. These are multipliers applied to an enemy's base behavior, rather than readings of the equipped build:

| Approach parameter | Mission 1 reference | Mission 10 |
| --- | --- | --- |
| Spawn pressure | 1.00× | 1.60× |
| Travel speed | 1.00× | 1.26× |
| Firing interval | 1.05× | 0.64× |
| Hostile projectile speed | 0.98× | 1.24× |
| Regular-enemy health | 1.00× | 1.90× |
| Lateral movement response | 1.00× | 1.12× |

A shorter firing interval means faster fire. Formation probability rises from 30% to 55%, turret probability from 14% to 24%, and formation spacing tightens from 52 to 42 arena units. Mission 2 introduces one command drone per formation; mission 3 introduces staggered lanes and mission 5 introduces crossings. Firing animation and muzzle tells remain readable. Mission 1 keeps its authored approach and post-elite encounter timeline rather than replacing it with the general spawner.

Ordinary hostile projectiles and regular-enemy contact deal one damage throughout the campaign. The old mission-six jump to two damage is gone. Authored hazards, epic toxin and other special mechanics retain their own rules. This pass does not change any miniboss, main-boss or secret-boss health budget.

## Shorter approaches and responsive boss damage

| Encounter clock | Previous | Current |
| --- | --- | --- |
| Shattered Meridian approach before the elite | 72 seconds | 48 seconds |
| Shattered Meridian post-elite travel | 54 seconds | 36 seconds |
| Other missions' field approach before the elite | 17 seconds | 48 seconds |
| Other missions' post-elite field | Global 38-second apex threshold, including elite combat | A separate 36-second combat clock |

Meridian keeps its approved 48 + 36 seconds of field combat, still one-third shorter than its original 72 + 54. Other Story/Replay missions now have the same full 84-second field structure. Previously their global timer kept running during elite combat, leaving a very short post-elite stretch. The post-elite clock starts after the recovery choice (or the Field Module in a classic run) and freezes during combat intermissions, pause and Garage visits. Enemy formations and each environment's own hazards continue during that field run; it is active gameplay rather than an empty wait. Boss fights, upgrade selection and protected entry add their own time.

Armor now takes **25% of shot damage**. Exposed core hits take full shot output and the fighter's weak-point multiplier. The earlier zero-damage body-hit rule is obsolete. Protected entry, phase transitions, hidden states and epic rituals still block damage.

Body chip damage is routed into the same active phase/core health pool rather than a separate armor bar. It can destroy remaining cores and complete the encounter, so a pilot does not have to maneuver behind a surviving rear appendage to make progress. Precision still matters: exposed cores receive four times the body damage before weak-point bonuses. Boss and miniboss health budgets stay unchanged.

Wreck Reaver's native recesses contain larger gold energy, with a 14-arena-unit core hit radius and a 3.2-second exposed window. Other elites keep their 2.35-second openings. Bloodstar uses 17-unit core hit radii, with 3.2-second exposure in phase one and 2.8 seconds in phase two. Its approved red-to-yellow material progression remains attached to the native body animation.

Elite and boss readouts now show current / maximum HP with up to one decimal place. This displays fractional chip damage directly instead of hiding it behind a rounded-up percentage.

## Equipment pairs

Every gear piece has a slot, intrinsic perk, alignment, rarity and Signal Power. A pair activates when both specified intrinsics are equipped in their correct slots. Rarity does not gate these bonuses: a Common with the right intrinsic can complete a useful build. Storing a piece in the inventory is not enough.

| Pair | Requirements | Pair bonus |
| --- | --- | --- |
| **Absorption Circuit** | Weapon **Pod Synchronizer** + Force Pod **Absorption Siphon** | Adds another 0.4% DOSE per hostile shot blocked by the Force. Absorption Siphon's own 0.6% remains, for 1.0% additional DOSE before other DOSE-generation modifiers. |
| **Charged Bastion** | Weapon **Siege Coil** + armor **Capacitor Plating** | Adds 6% charged fighter-shot damage while at least one shield remains. Siege Coil's own 12% charge bonus remains. Normal fighter shots, Force shots and missiles do not receive the pair bonus. |
| **Salvage Momentum** | Armor **Recovery Weave** + engine **Scavenger Drive** | Gear pickups grant six seconds of movement/charge Surge instead of four. They preserve a longer remaining Surge, such as eight seconds from a successful epic ritual. This does not extend every other source of Surge. |
| **Rear Guard** | Engine **Vector Governor** + Force Pod **Rear Relay** | Adds 8% rear-mounted Force output and 6% deployment/recall speed, alongside those intrinsics' existing benefits. Rear output applies while the Force is actually docked at the rear; the deployed Force fires forward. |

The Garage's **Equipment Pairs** panel shows each pair's effect, active state, and ready/missing requirements for the selected equipment. Pair benefits apply once. Breaking a pair removes its extra benefit on the next new-run build or committed round refit.

Signal Power remains bounded: the average equipped Power grants at most 5% fighter calibration. Pair bonuses do not raise that cap or give every weapon a general damage increase.

## Alignment is a separate layer

Any compatible alignment can appear on a piece with a useful intrinsic. Match two or four pieces for the existing resonance rewards; a four-piece reward includes its two-piece benefit.

| Alignment | Two pieces | Four pieces add |
| --- | --- | --- |
| Vanguard | 4% weak-point output | 3% fighter output and 3% Force output |
| Aegis | One starting shield | One Force interception radius |
| Vector | 5% DOSE generation | 4% charge speed and 4% Force deployment/recall speed |

Starting-shield bonuses apply at run creation. Refitting does not replenish spent shields. An intrinsic pair can use mixed alignments, so completing a pair and completing a four-piece alignment are separate build decisions.

## v146 run reward budget

A miniboss still awards rolled gear and offers one recovery service: repair one hull, add one shield up to four, or add up to 12% DOSE up to 100%. Services with full reserves are disabled; the player can skip. A committed service cannot repeat after a refit or reload.

Each nonfinal apex offers three unowned perks from six. At most three unique perks are active. Once full, the player replaces one or keeps the current build; there are no ranks, prerequisites or repeated purchases. The saved draft stays stable. Gear rewards remain separate and do not auto-equip.

| Perk | Budget |
| --- | --- |
| Precision Relay | Breaking a boss core generates 6% DOSE. |
| Core Surge | Breaking a boss core grants a four-second Surge: +6% movement and charge speed. |
| Bit Reclaimer | Each hostile shot blocked by a defense Bit generates 0.4% DOSE. |
| Second Chance | Once each mission, survive a lethal ordinary hull hit with one hull. |
| Field Nanites | After defeating an apex, repair one hull, up to maximum hull. |
| Delta Reserve | Surplus kit pickups generate 5% DOSE instead of 2%. |

Combat DOSE events retain gear-based DOSE-generation scaling. Recovery recharge is a fixed 12 percentage points, capped at 100%. Core Surge contributes 6% strength independently of Scavenger Drive; active Surges use the strongest strength and longest remaining duration rather than multiplying. Field Nanites must be owned when the apex is defeated; selecting it afterward does not heal retroactively.

This removes the accumulating Module ranks and Doctrine damage tree from new runs. It does not remove existing gear bonuses or establish that every build has equal combat value. Connected damage, defensive uptime and full-run difficulty still need human playtesting.

## Four practical loadouts

These are intrinsic targets, rather than fixed item names or guaranteed drops. Suggested run perks depend on the offered draft and the tools actually collected. A gear pair and a run perk remain separate effects; for example, Absorption Circuit rewards Force blocks while Bit Reclaimer rewards defense-Bit blocks.

| Play style | Weapon / armor / engine / Force Pod intrinsics | Run-perk support |
| --- | --- | --- |
| **Force interception** | Pod Synchronizer / Ablative Memory / Phase Turbine / Absorption Siphon | **Bit Reclaimer** once Bits are collected; **Second Chance** and **Delta Reserve** support survival and Delta readiness. |
| **Shielded charge fire** | Siege Coil / Capacitor Plating / Phase Turbine / Salvage Shepherd | **Core Surge** for a charge-speed window after a core break; **Precision Relay** and **Field Nanites** for precision and recovery. |
| **Salvage mobility** | Core Borer / Recovery Weave / Scavenger Drive / Salvage Shepherd | **Delta Reserve** for surplus kit; **Precision Relay** for core-break charge; **Second Chance** for ordinary lethal-hit recovery. |
| **Rear coverage** | Arc Splitter / Ablative Memory / Vector Governor / Rear Relay | **Core Surge** for repositioning after a break; **Bit Reclaimer** or **Field Nanites** for support rather than another rear-damage multiplier. |

The interception build rewards deliberate Force placement and converts blocks into Delta readiness. The charge build loses its extra 6% when shields run out; Capacitor Plating improves DOSE from shield pickups but does not generate shields on its own. The salvage build uses safer collection and longer mobility windows; Recovery Weave still repairs only the first qualifying gear pickup per stage. Rear coverage asks you to use the rear dock deliberately rather than expecting its output bonus while the Force is deployed ahead of the fighter.

## Garage and round refits

The live Garage now shows set progress directly, including inactive and active two-/four-piece thresholds and mixed sets. Item family badges preview the equipped count after replacement. These displays describe the current classic bonuses listed above; the new foundation's proposed set effects remain separate in its workbench.

Before gear normalization trims unsupported fields or clamps active stats, each item retains its original data once in `legacySource`. Separate rolled variants and current locks remain separate. Checkpoints record their reward rules: new runs use `streamlined-v1`; older untagged and `classic-v1` saves retain classic progression. This does not migrate gear to the standalone foundation model. Unknown future profile versions cannot be silently downgraded; unknown checkpoint rules stay unavailable and preserved.

Gear comparisons prioritize the intrinsic effect, real equipped pair completion and explicit replacement costs. Power remains a neutral numeric comparison. Optional **STATS & COMPARISON** shows each item roll as equipped → candidate, including lost rolls and alignment thresholds; these are not projected totals after every run multiplier. Pair requirements and alignment rules are grouped under the expandable **EQUIPMENT PAIRS & RESONANCE** panel. Describing a candidate never equips it, rebuilds the fighter or writes a save.

Classic loaded runs retain Field Module effects, eligible pools and rank limits, plus Doctrine point costs, prerequisites and the ten-node run limit. A Garage refit refreshes their current-kit context without rerolling choices. New campaigns use the recovery and three-slot perk budget above.

Equip, lock and dismantle keep every inventory column's scroll position, the Garage page position and keyboard focus. Dismantling a focused item moves focus to the closest remaining item or its empty column, and the scroll position clamps to the shorter list. Locks persist after reload. Actions re-check the current item, so a stale action cannot dismantle a newly protected piece or award salvage twice.

After an elite, **VISIT GARAGE** is available during recovery selection. After a nonfinal apex, it is available during the perk choice. Classic runs keep the equivalent access on Module/Doctrine screens. **APPLY & RETURN TO ROUND** commits selected equipment and pair bonuses, then returns to the same pending choice. **MAIN MENU** also commits the refit to the safe checkpoint; Load Game resumes that choice without repeating loot or services.

Refits retain the collected Force kit, missiles, Bits, DOSE and active perks or classic upgrades. Bonuses are rebuilt rather than multiplied over the previous build. Current hull never rises from refitting and is clamped if the new maximum falls; spent shields remain spent. Ordinary menu Garage changes still affect new runs, while a checkpoint restores its recorded build. Older checkpoints without pair fields remain loadable.

## Motion and combat feedback

Regular wings follow bounded stage-specific weaving lanes; drones ease into lane transfers and steady their aim tells; turrets remain stable. Each elite has its own lane sequence and pacing while retaining protected entry, firing preparation, recoil and registered native poses. Main bosses and secret epics preserve their distinct authored routes through phase-speed changes by accumulating movement phase rather than jumping to a new position. Restrained banking follows actual velocity, and Reduced Motion suppresses it.

All 22 boss encounters now detach actual outer appendages from their native sprites. Bloodstar retains its authored tentacle masks and fragments; the other enemies capture fins, jaw blades, wings or pods from the exact current animated pose. A natural joint-to-silhouette sever removes the limb while preserving the central hull and reactor. Internal cores stay solid and scorched, with no enclosed interior cutout. Limbs with multiple supporting cores detach once, after the last member breaks. Damage from ordinary armor chip can trigger the same breakaway as a direct core hit.

The ten minibosses use distinct upper/lower appendage maps tracked through all sixteen atlas frames, including Wreck Reaver's gold socket material. Their middle reactor is protected from either sever. Falling limbs begin at the actual captured art center, rotate and trail smoke; their charred joint stays registered, and hit flashes do not restore them. Detached upper or lower firing ports redirect to an intact forward cannon while preserving the existing shot count and timing. Art Inspector previews restore the original encounter's missing parts and debris when closed, and new main/epic phases begin with their own intact node arrays. Fragments are cosmetic: their expiry does not restore the limb or add collision hazards.

Regular enemies retain their initial maximum HP so their smoke reflects actual damage, including damage from fighter shots and Force contact. Boss smoke follows each section's remaining health; severed outer assemblies smoke from the surviving joint. Smoke expands and becomes denser toward critical damage. The six dedicated smoke checks and Art Inspector preview verification pass.

Shield impacts use cyan, guard protection uses gold, and actual hull loss uses pink. One remaining hull produces a steady **HULL CRITICAL** label. Reduced Motion also gives the invulnerable fighter steady visibility instead of its normal pulsing visibility, and suppresses camera shake. Smoke and debris draw beneath projectiles. Cosmetic particle counts are bounded at 700 normally, 450 with Reduced Motion, or 300 with Clear Combat; smoke yields first as those budgets fill. These limits apply to decoration, not to live bullets or collision objects.

Boss entrances remain music-only: a protected 4.2-second visual warning fades the current theme down, then boss music fades in over 0.65 seconds. No alarm or alarm preference is used.

## Verification

`node tools/verify-game.cjs` preserves classic campaign and checkpoint regression coverage. `node tools/verify-streamlined-integration.cjs` exercises untouched production defaults through actual reward, combat, refit, controller, save/load and completion functions. `node tools/verify-run-progression.cjs` checks the six bounded perk effects, deterministic offers, replacements, skipped rewards, per-mission service/repair ledgers and stale callbacks. Boss-access checks cover body/core damage, forward-shot completion, protection, phase budgets and fractional HP. Movement checks run all 22 boss encounters through the production fixed-step scheduler at 30, 60 and 120 display frames per second. These are simulation checks rather than a measurement of GPU frame rate.

Browser checks used an isolated temporary pilot to verify all four pair activations and inventory scroll/focus retention. The existing pilot was viewed without equipping, dismantling or changing their gear. Equipment text and comparison panels are larger, with two-column layouts on narrower screens. Elite and main-boss combat were visually sampled, including Bloodstar phase-two material alignment. Full-run balance remains a playtesting task; these checks establish bounded behavior and correct perk application rather than proving every build equally effective.

`node tools/verify-detachable-parts.cjs` checks native PNG-alpha coverage and bounded outer-limb area, protected central housings, shared-limb readiness, source-art provenance, once-only emissions, registered silhouette severs, inspector restoration, phase cleanup, falling/spin/expiry and context recovery. It covers every miniboss frame and all main/secret boss phase anatomy while preserving Bloodstar's original fragment path. All ten part checks passed. Browser review sampled source-art breakaways on Wreck Reaver, Twin Maw, Omega Heart and Miasma Throne.

The separate [Power growth audit](BALANCE_AUDIT.md) measures actual firing output, early pickup saturation and the combined reward budget. It includes the subsequent applied Story challenge pass, charge/Force corrections, pickup limits, defensive caps and measured before/after collision results.

## Weapon growth and active defense

Story pickup limits are Force / missile / Bits **1/1/1** in mission 1, **2/1/1** in mission 2, **2/2/2** in mission 3 and **3/2/2** from mission 4. Rush and direct Dev Lab remain fully equipped. Surplus pickups grant 2% DOSE and score, or 5% DOSE with Delta Reserve, while a crystal still changes color. Shields bank at most four. Classic Field Patch heals one hull, otherwise grants a shield, otherwise grants 8% DOSE; classic raw-stat fallback Modules Calibrated Sights and Vector Trim each stop at three ranks.

The short-charge damage intercept is removed: fighter and Force charge packets use `1 + 7 × charge²`, retaining normal and full-charge endpoints. Red / Blue / Yellow normal Force packets total 0.45/0.72/1.05, 0.34/0.60/0.87 and 0.26/0.46/0.66 damage at levels 1/2/3 before their own multipliers. Each red Bit adds 0.07/0.095/0.12. Manual and Sync Force emissions share one 0.24-second gate; a charged packet queues for its next slot. Missiles deal 0.75 each, with 0.85/0.70-second cooldowns for one/two launchers. Conditional gear multipliers remain unchanged; recorded Doctrine multipliers continue on classic runs.

Starting with mission 2, a rare third-cycle amber attack complements blockable pink fire. The 0.65-second targeting tell locks a location, follows the carrier's muzzle and cannot damage anything. A released lance pierces the pod and Bits; ordinary shields and earned guards still apply. Moving off the line avoids it, and killing a regular carrier cancels preparation. Wall attacks announce a fixed broad gap rather than placing it on a stationary fighter. A larger interception radius remains valuable against pink fire, while mobility, recovery and precise carrier kills provide counterplay against amber fire.

`tools/verify-story-balance.cjs` passed twelve dedicated checks. `tools/measure-story-arsenal.cjs` records 60 actual-update emitted-output measurements. `tools/verify-campaign-challenge.cjs` compares native movement and collisions against a frozen pre-pass source; its simple automated pilot is not a human skill model or a full campaign clear test.
