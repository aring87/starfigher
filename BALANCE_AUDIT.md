# Power growth audit

The original audit below is a **pre-pass baseline**. The subsequent Story playtest confirmed that front-pod interception, rapid arsenal growth and brief-charge efficiency needed changes. See the applied pass and evidence at the end of this document. Its historical DPS and drop-rate tables do not describe the current build.

The three reward channels can work together. Keep their identities: gear defines the loadout, miniboss Field Modules adapt the current run, and main bosses grant one Doctrine Point. Early arsenal acquisition and charge efficiency are larger power spikes than most reward percentages.

## What is actually earned

- Each cleared mission guarantees one elite item and one apex item, plus occasional field gear. Only four equipped items contribute stats.
- The player chooses one Field Module per miniboss. Ten modules can affect the final Story boss.
- Sector entrances 1, 2, 3, 5 and 10 have 0, 1, 2, 4 and 9 earned Doctrine Points. The final boss awards the tenth point after combat ends.
- Most offensive nodes and modules grant 3–6% improvements. Signal Power calibration is capped at 5%. Repeated Garage refits did not multiply existing stats.
- Armor traits are exclusive choices. Recovery Weave, Ablative Memory and Capacitor Plating cannot all be equipped together. The two six-node capstones Hunter Signal and Event Horizon cannot both fit the ten-point budget.

## The main early spikes

The table uses the actual projectile emitters, legal ideal firing cadence, a Red Force, and no gear, Modules or Doctrine. It counts emitted damage before misses, armor, exposure windows or projectile collisions; it is not a boss kill-time prediction. Delta and contact damage are excluded.

| Arsenal | Normal taps | Minimum charge | Full charge |
| --- | ---: | ---: | ---: |
| Fighter only | 6.25 | 11.47 | 6.40 |
| Fighter and first Red Force | 18.75 | 27.31 | 13.12 |
| Red Force level 3 and missiles level 2 | 36.67 | 45.73 | 21.34 |
| Above, plus two Bits | 43.92 | 54.92 | 25.24 |

Values are damage units per second under the stated firing model. The first Force is an intentional kit-completion reward, so later growth should also be compared with that foundation: the full kit's normal output is about 2.34 times the first Force-equipped ship. Comparing everything only with the opening fighter exaggerates the amount of later progression.

The minimum accepted charge takes 0.30 seconds but starts at 3.44 fighter damage. Repeating it produces about 79% more fighter output per second than full charging. Its Force multiplier has a similar early intercept. This efficiency discontinuity deserves a balance pass.

In 256 simulated collection runs, using 70% of spawned enemies killed, 80% of offered combat pickups collected, and ten kills of blocking for a missed pickup, Force level 3 appeared in 50% of runs by mission 1's end, 89% by mission 2 and 98% by mission 3. Those are explicit collection assumptions, not player telemetry. One active combat pickup throttles further drops.

The boss build-health adjustment does not price in Force level, missile level or Bit count. It stayed at 1.00 for all four kit-only references above. This does not mean boss health should simply track total emitted output: armor, target access, attack patterns and weapon accuracy also matter.

## Other outliers worth targeting

- Arc Splitter can add 44% total normal fighter-shot output when both diagonal bolts connect. That is a favorable hit ceiling, not guaranteed single-core damage.
- Pod Synchronizer can combine deployed automatic Force fire with fire triggered by the pilot. In the audited full-kit example, deployment raised emitted tap output from 45.94 to 60.15 damage units per second.
- Shields have no bank limit. Repeatable Field Patch can add a heal or shield at every miniboss. Recovery and Field Nanites provide further recovery where their mutually compatible choices are earned.
- The damage and movement fallback Modules can repeat. Seven Calibrated Sights ranks multiply weak-point output by 1.230; seven Vector Trim ranks multiply speed by 1.316. These are finite-run ceilings, rather than infinite normal-play growth.
- Core-break DOSE rewards depend on the number of cores. Precision Relay and Hunter Signal can generate 18% before DOSE modifiers, favoring phases with many cores. A per-phase budget could keep the build useful without rewarding one anatomy disproportionately.

Guaranteed gear rewards alone are not permanent Surge or immunity. Their timers partly run during protected victory animations, and field gear remains uncommon.

## Recommended balance pass

1. Smooth charge output so brief releases do not overwhelm full-charge sustained damage.
2. Spread advanced Force levels and the second missile/Bit across several early missions, with playtesting around missions 2–5.
3. Review Sync's two firing cadences and Arc Splitter's early all-hit bonus individually.
4. Put a small bank limit on shields and limit repeatable raw-stat fallback ranks. Preserve meaningful recovery and defensive build choices.
5. Normalize core-break DOSE by phase budget, then compare real boss clear times and damage taken across builds.

These are design recommendations. No item values, Doctrine bonuses, Module percentages or drop probabilities were changed during this audit.

Two correctness fixes were applied: checkpoint reload no longer refreshes spent one-use stage defenses, and Delta cannot spend DOSE or damage targets during protected arrival, phase transitions or rituals. Genuine new stages still recharge their stage defenses.

## Evidence

- `artifacts/power-curve-audit.json`: actual emitters, field spawn sampling, production drop rolls and combined illustrative builds.
- `artifacts/gear-power-audit.json` and `artifacts/gear-power-bounds.json`: earned gear snapshots and optimized ceilings.
- `tools/audit-power-curve.cjs`: repeatable isolated audit, with assumptions and checks recorded in its output.

Live balance still needs measured encounter playtests. The audit identifies where to tune first; emitted budgets do not prove that every projectile hits a vulnerable target.

## Applied Story challenge pass — November 14, 2026

The user confirmed their easy first-five-mission playtest was **Story**, not the boosted developer lab. The main defensive issue was demonstrated through actual collisions: front-mounted Force intercepted nearly all aimed shots that could reach a stationary fighter, including the center shot in broad fans. Merely emitting more pink bullets did not reliably increase danger.

The applied changes are:

- Keep mission 1's approach and attack scripts as onboarding; front-load threat growth in missions 2–5, introduce a command formation leader from mission 2, and retain threat cooldown scaling after each boss release.
- Add a clearly marked, rare third-cycle amber lance from mission 2, with a harmless 0.65-second locked-target tell. It bypasses Force/Bits, uses ordinary shield/hull damage, and does not steer after a dodge. Killing a regular caster cancels preparation. Walls show a fixed offset escape gap during a harmless 0.8-second warning.
- Spread Story weapons across mission limits 1/1/1, 2/1/1, 2/2/2 and 3/2/2 in missions 1, 2, 3 and 4 onward. Current/old checkpoint arsenals clamp to those limits while recorded gear bonuses, HP and spent guards remain. Rush/Dev Lab retain the full kit.
- Smooth fighter/Force charge with `1 + 7 × charge²`; keep ordinary fighter damage 1 and full charge 8. Restrict Force packet and missile output. Manual and Sync Force fire share a 0.24-second emission gate; blocked charged packets queue for the next slot.
- Cap shields at four and the two raw-stat fallback Modules at three ranks. Full-bank recovery converts into DOSE. Preserve gear traits, pair bonuses, Doctrine percentages, boss health budgets, first-mission timing and between-round refits.

The 30-second phase-one boss pressure snapshots with one front red Force, no firing and no gear show:

| Mission | Previous hull contacts that caused damage | Current | Current with physical dodging |
| --- | ---: | ---: | ---: |
| 1 | 0 | 0 | 0 |
| 2 | 1 | 7 | 0 |
| 3 | 0 | 9 | 0 |
| 4 | 0 | 7 | 0 |
| 5 | 0 | 9 | 0 |

These are one-seed nonlethal pressure meters with ordinary invulnerability timing, not survivability or full-clear claims. The test raises HP only to allow the same thirty seconds to be observed; a real three-hull stationary pilot loses earlier. The moving comparison uses actual Up/Down inputs, not teleportation. Separate finite-hull scenarios and isolated warning/collision checks cover damage and evasion. Field segments use a deliberately simple bot and do not establish a human difficulty target.

Actual 120 Hz tap-fire measurements in a clear lane show the perfect pickup kit's emitted output at **8.31, 9.19, 10.54 and 11.68** damage/second across missions 1–4, versus **42.16** at every mission before this pass. This includes fighter, Force, red Bits and missiles, but no gear, Doctrine, Modules, Delta, contact or misses. Full-charge and first-Force measurements are also recorded; emitted output is not connected damage or a kill-time forecast.

Evidence: `artifacts/story-balance-verification.txt` (12 checks), `artifacts/story-arsenal-comparison.json` (60 measurements), `artifacts/campaign-challenge-baseline.json` and `artifacts/campaign-challenge-updated.json` (90 attack snapshots, 40 field segments and 30 boss-fight diagnostics per revision). The baseline source remains frozen in `artifacts/challenge-baseline-game.js`. Real browser checks used temporary in-memory storage and verified warnings, parked damage, deliberate evasion, ordinary pod blocks and the four-shield bank without changing the user's real profile.

Arc Splitter and anatomy-dependent core-break DOSE remain separate potential follow-ups. This pass addresses the demonstrated sources of effortless early survival and free arsenal saturation; it does not claim that every build or every full mission is now equally difficult.
