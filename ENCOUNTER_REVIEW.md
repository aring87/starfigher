# Encounter fairness review — v154

This follow-up fixes reproducible interaction defects across the existing roster. It keeps the v153 Bloodstar exposure motion, first-support carriers, random gear rolls, gear sets, run perks and 48/36-second field clocks. No new player mode, progression layer, art asset or sound is introduced.

## Changes

**A completed phase commits before contact from its spent body.** A valid phase-finishing shot formerly depleted its health pool, then body contact could kill a one-hull pilot before the transition or victory handler ran. This affected all ten main bosses and both epics. Contact now requires positive health in the current phase. Existing transitions, ritual starts and once-only victory/reward handling run normally. Living phases still hurt on contact; no new invulnerability timer is granted.

**Ritual homing tracks the active guardian.** Missiles and yellow Force previously omitted guardians and steered toward the protected, offscreen epic owner. During an unresolved ritual, the target list now includes only its active, live, positive-health guardian in place of that owner. Dormant/dead guardians and finishing rituals do not become targets. Ordinary enemy, miniboss and boss tracking—including existing protected-arrival tracking—is preserved.

**A piercing packet hits a guardian once.** Red Force Level 3 and Null Lance could spend their extra target budget hitting the same guardian on consecutive ticks. A piercing hit now advances the packet beyond the guardian and resets its previous x coordinate, matching ordinary-enemy collision handling. It can still hit one subsequent actor. Nonpiercing packets retain their existing behavior.

**Fast exposed cores receive temporal collision coverage.** Most target motion is small, but measured phase-two native-pose changes reach roughly 38 arena units for Rift Wraith and 54 for Gravebell within one 120 Hz step. Current-position-only checks can miss a shot crossing that motion. The game now snapshots intact exposed cores before simulation time/pose changes and checks the shot's relative path over that one step.

The temporal check requires the same live actor, phase, node array and node identity, matching clock/dt, and exposure/damageability at both samples. Records are consumed after collision handling and are never serialized. Closed, hidden, protected, destroyed, stale, paused, zero-time and actor-only histories cannot add temporal hits. The original current-position test remains the fallback. Native artwork, material registration and hit radii are unchanged. Linear travel between adjacent native-pose samples is the chosen collision interpretation; it does not add rendered intermediate poses or permanent larger targets.

## Validation

- Actual full-charge and tap emitters verify final/phase-ending hits against legal remaining health pools, overlapping one-hull Story pilots, existing protections, living contact and once-only rewards. The final-victory suite includes 720 follow-up native updates.
- The moving-core suite covers all 22 encounters and 38 phases, genuine near misses, invalid-history guards and 30/60/120 display-rate parity. The two natural large-motion reproductions change from no damage/unconsumed packets to exactly one precision hit.
- Homing direction/eligibility controls cover both epics and all four corners, inactive/dead/zero-health guardians, resolved rituals and unchanged ordinary tracking.
- Actual Red Force front/rear and Null Lance packets verify single guardian damage and the remaining target reaching a subsequent actor. Fighter/Force Level 2 controls stay single-hit.
- Ritual budget probes use ordinary Story kit caps, no gear/perks/Delta and physical movement/Force contact. Yellow cases retain their deadlines. The late phase-three Red/Blue checks clear all four corners after removing double hits: roughly 4.8–6.3 seconds within the existing seven-second window. These are scripted, invulnerable outcome probes, not human success rates.
- A warmed mocked-render logic comparison measured about 0.004–0.005 ms extra per simulation step for two representative encounters. That does not establish GPU, mobile or long-session performance.

Guardian health, seven/eight/nine-second ritual windows, toxin consequences, boss health, attack cadence and part-weapon suppression are unchanged. Human campaign fairness, visual judgment on actual devices and physical-controller feel remain open.

## Private playable review

Open [Encounter Review](http://127.0.0.1:8765/artifacts/encounter-review-preview.html?v=156). It uses temporary in-memory pilot storage and ordinary Story resource rules. The current page follows the shipping build; its comparison link loads the frozen v153 gameplay with the same tools.

- Mission 1–10 plus **Elite only** or **Apex approach** covers the twenty standard encounters.
- The two **Secret** choices cover Null Cathedral and Miasma Throne. **Epic start** can begin at Phase 1 or directly after phases 1–3 for ritual review.
- **Kit** offers natural collection or explicitly staged mission-capped Red, Blue or Yellow kits. Fixed Rare builds and up to three validated perks are comparison fixtures, not naturally earned progression.
- Reset, Play/Freeze and one-second stepping keep the normal keyboard/controller actions. After a staged encounter loss, **Reset Test Fixture** repeats that setup; a full-mission test keeps ordinary checkpoint retry. Show Report exposes real kit/resources, phase/ritual state, guardians, counters and the raw source-file hash. Compact Tools preserves the full game viewport.
- A fresh Mission 1 retains contextual guidance. Staged fixtures suppress already-known notes. Starting seeds reset the random stream; different input timing can change later rolls.

The main game menus and the ordinary DEV Lab remain unchanged. DEV still has its explicit extra test resources; this page is the separate place to compare normal Story rules without touching a real save.

## Evidence and commands

- `node tools/verify-final-hit-contact.cjs`
- `node tools/verify-epic-phase-contact-v154.cjs`
- `node tools/prototype-moving-core-sweep-v154.cjs --live`
- `node tools/audit-epic-ritual-v154.cjs --live`
- `node tools/verify-epic-guardian-projectiles-v154.cjs`
- `node tools/measure-epic-late-colors-v154.cjs`
- `python tools/build-encounter-review-preview.py`

The frozen full pre-pass source is `artifacts/boss-fairness-v154-baseline-game.js`. The epic-only probe snapshot was taken after the first final-contact guard but before homing/piercing changes; its exact hash is recorded, and that contact difference does not affect the isolated guardian cases. Moving-core candidate/baseline/live sources are identified separately in their reports. Do not overwrite the shipping source with a private candidate file.

See [phase/contact results](artifacts/final-hit-contact-v154-verification.json), [moving-core results](artifacts/moving-core-live-v154-verification.json), [epic homing/budget results](artifacts/epic-ritual-v154-live.json), [guardian packet results](artifacts/epic-guardian-projectiles-v154.json), and [late-color ritual budgets](artifacts/epic-late-colors-v154-live.json).
