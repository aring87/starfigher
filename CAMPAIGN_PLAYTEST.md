# Campaign fairness review — v153

This pass begins the next roadmap review. Its measurements identify targeted changes; fresh-player campaign difficulty remains open. No Veteran Campaign, gear levels, elemental system or new reward track is introduced.

## Applied changes

**Bloodstar settles during exposed-core windows.** Its accumulated vertical movement phase advances at half rate while cores are open. Its center and velocity remain continuous, and attack, opening, animation and phase-transition clocks run normally. Closed-core movement, native core registration and 360 base HP remain intact. All other boss routes are unchanged.

**Formation leaders carry a missing first support.** In Story and Mission Replay, the existing larger drone at the head of a four-enemy formation carries a first missile from Mission 2 if none is owned. From Mission 3 it carries a first Bit once a missile is owned. Force must already be owned; an active combat pickup blocks another drop. A kill does not automatically equip it. Missed pickups can be offered again by a later leader. Collected arsenal supplies the guard, including after checkpoint load or retry, so there is no new pity counter or save schema.

Ordinary random upgrades, Force colors/levels, mission kit caps, shields, item counts, rarity/stat rolls, gear sets, run perks and approved 48/36-second field clocks are unchanged. The independent field-gear roll still runs on a carrier kill. Rush and DEV tests retain their prior rules. Ending a first-copy drought can bring a later random second copy forward; that indirect growth remains part of the combat review.

## What the evidence establishes

- **First-boss aim/travel time:** normal projectiles can reach the surviving rear cores and chip the shared health pool. The measured bottleneck was keeping moving cores lined up over projectile travel time. Twelve color/kit comparisons use actual Force Level 1, three hull, zero shields and no gear/perks/Delta. Their invulnerable meter measures outgoing damage, not survival.
- **Movement continuity:** four natural 30-second traces cover both Bloodstar phases and Reduced Motion: 14,400 native updates with advancing clocks and bounded movement. Reduced Motion changes presentation without changing the center path.
- **All-ten boss pressure:** forty independent snapshots, plus twenty-four late-boss follow-ups, use actual attacks, collisions and sector scaling. Parked front-Force references take substantial damage in Missions 2–5. The final boss is the pressure peak; a simple vertical-moving reference's phase-two losses come from homing/wall/ordinary shots rather than an unavoidable amber lance. It cannot read every mechanic, break parts, fire or use Delta/builds, so this does not prove human fairness.
- **Pickup droughts:** sixty native field censuses supply all-ten spawn budgets. The drop model uses 32 seeds for each of three explicit kill/collection policies. Carrier sensitivities assume one leader killed per six or twelve kills; missed pickups block another for ten attempted kills. Neither assumption is player telemetry.
- **Gear rewards:** sixteen private award-path campaigns produce exactly two distinct items per elite/apex pair, 160 pairs total. No result establishes that late Uncommon items are useless or warrants inflating rarity or roll strength.

For the same scripted forward-positioning/leading pilot, first-Force-only Bloodstar clear times change as follows:

| Force Level 1, no missiles or Bits | Frozen baseline | v153 |
| --- | ---: | ---: |
| Red | 70.44 s | 62.03 s |
| Blue | 74.38 s | 68.29 s |
| Yellow | 79.58 s | 75.82 s |

These are finite outgoing-damage comparisons, not expected novice clear times or win rates. Support-equipped rows are recorded separately. The change helps every tested color without requiring a missile/Bit drop.

At 70% kills / 80% collection, the model has a first missile in 24/32 baseline runs by Mission 2 and a first Bit in 27/32 by Mission 3; the live carrier policy reaches 32/32 for both under both carrier sensitivities. At 40% kills / 60% collection, Mission 2 first missiles change from 13/32 to 30/32 and Mission 3 first Bits from 16/32 to 32/32. Mission 1 pickup results stay identical. These describe the stated model only.

## Private playable comparison

Open [the Story balance test](http://127.0.0.1:8765/artifacts/campaign-balance-preview.html?v=153). It uses in-memory pilot storage and normal Story resource rules, with no DEV bonus hull or shields. The comparison link opens the frozen pre-pass gameplay with the same tools. Nothing in this page changes a real pilot.

1. For natural progression, select Mission 1, Full mission, Empty Garage, Fighter only and no perks. Reset, then Play. Drops, services, perks and later missions advance through the real game flow.
2. For a repeatable boss comparison, choose a mission and Apex approach or Elite only. A mission-capped Red kit and fixed moderate Rare builds are explicitly staged fixtures. They do not demonstrate what a player naturally earns.
3. Reset restores the chosen starting seed; input timing and subsequent random calls affect later outcomes. It is not a recorded-input replay. Play/Freeze and one-second stepping allow inspection. Compact Tools leaves the game visible. Standard keyboard/controller controls and the ordinary Garage/retry screens still operate. A fresh Mission 1 keeps contextual guidance; staged comparison fixtures suppress already-known notes.
4. Show Report exposes the setup, source hash, real kit/resources, phase arrival times, acquired pickups and run counters. Copy that report with a note describing any unfair or empty moment.

## Human review still required

Use a fresh temporary pilot and keep actual observed outcomes separate from the fixture tables:

- First mission: discover/collect Force, distinguish armor from exposed cores, learn part breaking and finish the apex without prolonged confusion.
- Missions 2–3: encounter the support carriers, collect their drops and learn the new tools without an early maximum-kit jump.
- Missions 4–5: compare naturally earned mixed gear with a deliberate pair/set build; assess damage taken, recovery choices and fight duration.
- Missions 9–10: read combined homing/wall/beam patterns with the actual earned kit, use positioning and meaningful part breaks, and assess whether the final challenge feels earned.
- Record build, kit, perks, encounter time, deaths/hull loss, missed pickups and the precise unreadable attack or inaccessible target. Do not infer human success rates from invulnerable meters.

## Reproducible evidence

- `node tools/verify-first-support-drops.cjs`: real spawning, drops, collection, first-copy guards, single-pickup gate, independent gear, save/reload and retry.
- `node tools/measure-boss-aim-v153.cjs --candidate=live`: nine aim-policy snapshots. `--candidate=baseline` uses the frozen source.
- `node tools/verify-bloodstar-motion-candidate-v153.cjs --candidate=live`: natural live motion traces and Reduced Motion.
- `node tools/measure-first-boss-kits-v153.cjs`: twelve baseline/live color and kit snapshots.
- `node tools/audit-sector-pressure-v153.cjs` and `--late`: all-ten and late-boss pressure/source snapshots.
- `node tools/measure-campaign-rewards-v153.cjs --live --carrier-every=6 --reuse-fields=artifacts/campaign-rewards-v153.json --skip-awards --label=v153-live-carriers6`: native drop sensitivity with cached baseline spawn budgets. Use `--carrier-every=12` and a separate label for the second targeting assumption.
- `python tools/build-campaign-balance-preview.py`: rebuild both isolated playable pages.

Detailed results: [first-boss kits](artifacts/first-boss-kits-v153.json), [boss aim](artifacts/boss-aim-v153-live.json), [motion](artifacts/bloodstar-motion-live-v153.json), [sector review](artifacts/sector-pressure-v153-review.md), [reward review](artifacts/campaign-rewards-v153-review.md). Artifacts record the measured source hash; subsequent cache-tag or help-copy changes can produce a different file hash without changing those combat rules.
