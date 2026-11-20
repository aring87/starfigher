# Field fairness and readiness guidance — v155

Destroyed debris now stops participating in that simulation step. A rock or mine destroyed by a projectile or Force can no longer consume a shield or damage the fighter afterward. Additional projectiles are left available for their next target. Living debris retains its existing damage, invulnerability response, destruction burst and 15-point award.

First-earned **Delta Ready** and **Shield Ready** help cards now recheck the player's current resource. A card queued during a boss waits if Delta has been spent or the final shield lost before field flight resumes. An already visible card also suspends when its resource disappears. It can return on an actual refill; only valid visible time or acknowledgement records the tip as read. Recovery-service explanations retain their priority.

This pass changes no health budgets, enemy attacks, field schedules, item rolls, synergies, perk strength, artwork or audio.

## Evidence

- `node tools/verify-field-debris-v155.cjs`: seven live check groups pass. Actual charged/tap projectiles, rocks/mines, Force contact, one-hull survivors, shields, invulnerability, extra packets and once-only burst/score are covered. The frozen v154 source reproduces five failures with two survivor controls passing.
- `node tools/verify-guidance-eligibility-v155.cjs`: seven live checks pass. Native collection, Delta use, shield damage, boss victory/intermission, visible dwell, refills, pause and checkpoint ownership are exercised. Frozen v154 reproduces four stale-hint failures with three controls passing.
- The private browser review exercises all six readiness/destruction fixtures through their buttons. Ready cards appear with the resource, spent cards stay absent, both destruction fixtures retain three hull, and neither the review nor fresh public menu emits a console warning/error.
- Core regression, onboarding lifecycle, Flight School integration and combat painter checks pass. Native field timing and admission checks retain the approved 48/36-second segments and existing regroup policy.
- `node tools/verify-field-rhythm-v155.cjs` passes six contract groups, including all twenty field sections and eighteen regroup boundaries. `node tools/verify-stage-rhythm.cjs` passes six groups and 36 paired native-field probes. Current diagnostics are saved as `artifacts/stage-rhythm-v155-diagnostics.json`.

An old rhythm assertion compared exact Mission 1 projectile occupancy to v148. A separate native history probe shows that this mismatch was already present in v154; v155 matches v154 exactly in both passive field sections. The suite now uses v148 for authored definitions and historical rhythm diagnostics, and the frozen immediate predecessor for exact pressure preservation. The measured source hashes and both comparisons remain in the artifacts.

The legacy tool refreshed its old `stage-rhythm-v149-diagnostics.json` output path during this rerun. That file identifies the actual v155 source hash; the same result is preserved under the v155 name above. Future runs use the versioned current output. Published v149 aggregate descriptions remain historical measurements.

## Private browser review

Open [Field Clarity Review](http://127.0.0.1:8765/artifacts/field-clarity-preview.html?v=155). It uses temporary in-memory pilot storage and frozen native-action fixtures. **Delta Spent / Ready**, **Shield Spent / Ready**, **Shot Break** and **Force Break** expose the result and a source-hash report. The test geometry deliberately overlaps actors; it is a collision regression, not naturally earned campaign progression.

The main game is [v155](http://127.0.0.1:8765/?v=155). The [all-boss Story review](http://127.0.0.1:8765/artifacts/encounter-review-preview.html?v=155) remains available.

These checks establish interaction correctness, not novice success rates. Fresh-player campaign pacing, human audio audition, physical-controller feel and longer sessions on target devices remain open roadmap validation.
