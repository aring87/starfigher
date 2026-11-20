# Encounter pacing — v149

The v153 fairness follow-up is recorded in [Campaign playtesting](CAMPAIGN_PLAYTEST.md). It retains these field schedules and all health budgets. Bloodstar steadies during exposed-core windows, and later formation leaders can supply a missing first support weapon. Modeled collection and independent boss snapshots remain separate from human campaign results.

The live change gives later missions distinct attack groups and room to reposition. It does not add another progression system or menu. Mission 1 keeps its approved authored sequence. All Story/Replay missions retain 48 seconds before the elite and 36 seconds of field flight after it; elite fights, service, Garage time and apex arrival are outside those clocks.

## Field beats

These schedules apply to missions 2–10. The interval multiplier modifies the existing sector-scaled enemy batch interval; a smaller value means faster arrivals. It does not change enemy damage, HP, movement or firing speed.

| Segment | Time | Beat | Enemy interval | New hazards |
| --- | --- | --- | --- | --- |
| Approach | 0–5 s | Establish | 1.20× | No |
| Approach | 5–16 s | Pressure | 0.85× | Yes |
| Approach | 16–24 s | Reposition | No new batches | No |
| Approach | 24–39 s | Test | 0.80× | Yes |
| Approach | 39–48 s | Elite approach | No new batches | No |
| Post-elite | 0–10 s | Counterattack | 0.85× | Yes |
| Post-elite | 10–18 s | Reposition | No new batches | No |
| Post-elite | 18–29 s | Test | 0.80× | Yes |
| Post-elite | 29–36 s | Apex approach | No new batches | No |

Existing enemies keep moving and firing; launched bullets and hazards finish normally. Sector currents continue. Repositioning is an opportunity to finish threats, collect drops and choose a lane, not immunity or healing. No new phase banners compete with combat. Existing encounter arrivals retain their field-clearing behavior.

The pure policy in `stage-rhythm.js` reads absolute simulation time. Quiet windows hold positive spawn timers, so pause, loading or returning from services cannot bank missed waves for a burst. No phase cursor or new save fields are needed. Mission 1's authored cursor and checkpoint restoration remain intact.

## Measured field pressure

`node tools/verify-stage-rhythm.cjs` runs actual 120 Hz Story updates in fresh private VM pilots. It compares frozen v148 with v149 across missions 2, 5 and 10, both fields, passive and stationary full-charge references, and seeds 1103, 2026 and 7349: 36 paired comparisons, 72 field simulations. Drawing and sound are mocked. The high-hull meter measures incoming pressure, not survival.

| Aggregate measurement | v148 | v149 | Change |
| --- | ---: | ---: | ---: |
| Enemy births | 4,602 | 3,192 | −30.6% |
| Live enemy occupancy, enemy-seconds | 25,980 | 19,997 | −23.0% |
| Hostile shot emissions | 8,807 | 7,106 | −19.3% |
| Live hostile shot occupancy, shot-seconds | 12,227 | 9,822 | −19.7% |
| Largest observed enemy crest | 43 | 42 | Similar peak |

Birth counts alone exaggerate the pressure reduction: threats continue across quieter beats, and active waves arrive more quickly. Every regroup's final three seconds had fewer live enemies than the three seconds immediately before it. Mean enemy occupancy fell from 15.36 to 4.26 in mission 2, 22.38 to 3.64 in mission 5, and 26.67 to 1.96 in mission 10. These are fixture averages, not player telemetry.

The first candidate cut arrivals about 40% with no active-wave acceleration. It was revised before shipping because the user's earlier Story feedback called for more challenge. The retained candidate preserves crests while reducing constant accumulation. Authored hazards remain less frequent because they no longer start during every available interval.

Evidence: [current per-second rerun](artifacts/stage-rhythm-v155-diagnostics.json), [initial v149 candidate](artifacts/stage-rhythm-v149-initial-diagnostics.json). The aggregate figures above describe the original v149 measurements; the current rerun records its actual v155 source hash. Six check groups cover schedule boundaries, unchanged Mission 1 authored budgets and immediate-predecessor pressure, actual 48/36-second arrivals, stale timers, pause/load/Garage behavior and real regroup occupancy.

## Connected build comparisons

`tools/measure-build-matchups.cjs` runs native Story charge, movement, weak openings, part breaks and swept collisions at 120 Hz. It uses actual mission-capped red Force/missile/Bit kits, valid item rolls and ordinary Story hull/shields. It never uses DEV bonuses or invented damage multipliers.

The five loadouts are empty Garage, moderate Rare Siege + Capacitor, moderate Rare Sync + Siphon, mixed Common/Rare gear across all three sets, and a valid maximum-roll Exotic Vanguard charge ceiling. The last fixture deliberately represents a strong endpoint, not a typical early drop. Four slots cannot all belong to different sets because the game has three alignments. The mixed build uses 2+1+1 and mismatched intrinsics.

The baseline covers 45 outgoing-damage meter snapshots and 15 separate normal-hull snapshots. Twenty additional snapshots test three legitimately earned run perks in missions 5/10. Meter invulnerability is explicitly recorded; its shield-conditioned charge uptime is a best case. Normal-hull pilots follow cores but do not dodge. Neither group establishes human win rates. The pilots do not use Delta.

Selected core-follow/full-charge kill times, zero perks:

| Loadout | Mission 5 apex | Mission 10 apex |
| --- | ---: | ---: |
| Empty Garage, mission-capped kit | 57.36 s | Not killed within 60 s |
| Rare Siege + Capacitor | 47.88 s | 56.05 s |
| Rare Sync + Siphon, deployed Force | 41.56 s | 44.15 s |
| Mixed Common/Rare | 53.15 s | Not killed within 60 s |
| Exotic Vanguard charge ceiling | 42.59 s | 43.06 s |

Focused charge gear benefits full-charge play; mixed Arc gear performs better than those charge-focused guns in the stationary rapid-tap comparison. Sync's deployed auto-fire trades front-pod protection for pressure. At mission 10, four of five non-dodging baseline pilots died before 30 seconds; the Exotic fixture survived with one hull. Three-perk cases change charge and movement timing as well as output, so their effect cannot honestly be reduced to one DPS percentage.

All mission 1 apex snapshots remained unfinished at 60 seconds, while mini encounters ranged from roughly 15 to 30 seconds across the matrix. The pilot follows the nearest core vertically without leading targets or moving forward. First-boss length and rear-core access are therefore explicit human-review items, not evidence for a blind global HP adjustment. Boss HP, per-kill drop probabilities, guaranteed elite/apex awards, random rolls, set effects and perk strength are unchanged. Fewer field kills can mean fewer random-drop opportunities; pickup acquisition and reward pacing remain part of the human review. The full-kit boss fixtures do not establish actual campaign pickup acquisition.

Evidence: [zero-perk results and exact fixture limits](artifacts/build-matchups-v149.md), [earned-perk sensitivity](artifacts/build-matchups-v149_perks3.md). Full JSON companions include applied stats, exact rolls, caps, connected damage, phase times, deaths and source hashes.

## Fresh-player validation still open

Use a separate pilot so the real campaign and equipment remain intact. Play Mission 1, then missions 2, 5 and 10 with appropriate earned gear rather than DEV hull. Observe:

- Can a first-time player recognize a quieter window and choose a new lane without another explanation panel?
- Do active waves demand movement while still leaving readable routes through hazards and amber fire?
- Does breaking a boss weapon visibly open a useful route, and does the first apex finish at a satisfying pace?
- Do focused and mixed loadouts feel different, with enough pickup/drop opportunities and no mandatory recovery choice?

Record mission, build, perk choices, deaths/hull loss and the moment that felt unfair or empty. Seeded diagnostics establish timing and pressure boundaries; fresh-player feedback is still required before calling difficulty final. The v150 pass implements audio distinction, text size and death/retry clarity; listening and hardware playtesting are still required. Veteran Campaign remains deferred.
