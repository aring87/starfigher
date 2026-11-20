# Boss tactics and weapon loss

v148 implements priority 4 of the [original roadmap](ROADMAP.md). All ten elites, ten apex bosses and two secret epics have authored weapon-support groups independent of sprite loading and cosmetic debris. The existing health, phases, exposure windows and intact attack cadence remain.

Breaking an assigned outer assembly now weakens its attacks. This is an omission of existing projectiles: surviving fan angles, ring spokes, wall positions, rain columns, speeds, damage and warning times are preserved. Removing a weapon never redistributes its volley into an earlier safe gap. Core-controlled attacks and pressure lances remain available where authored. Shots already launched remain in flight. New phases begin with their own intact weapons.

Arrival cards give one tactical hint. A completed assembly break briefly shows its name and **DISABLED** beneath the health bar. A shared assembly does not announce or disable until all its supports are destroyed. This feedback uses the existing break sounds and introduces no additional menu or targeting line.

## Elites

All elites use upper and lower outer assemblies, with a separate central reactor. Wreck Reaver's paired volley, Forge Gnawer and Hollow Maw stop a broken side cannon's entire salvo. Their surviving side keeps its original fan. An old muzzle flash also stops when its cannon breaks; it is not moved to the center.

The remaining patterns omit packets assigned to lost hardware while retaining core-controlled packets. Abyss Stalker's fins reduce secondary tracking fire; Vesper Shard, Seed Tyrant and Gravity Lancer gain clearer ring arcs; Cinder Seraph loses fan lanes; Relay Warden and Signal Executor lose the relevant supporting branches of their mixed attacks. Wreck Reaver also retains its aimed and ring patterns between paired volleys.

## Apexes and secrets

| Encounter | Tactical response and weapon loss |
| --- | --- |
| Bloodstar | Use Force against aimed fire; broken tentacles remove assigned barrage spokes or fan lanes. Its two reactor housings remain internal. |
| Twin Maw | Destroy one jaw to stop its complete fan. In phase two, each jaw has two supporting cores; breaking only one support does not shut it down. |
| Helix Crown | Move through rotating gaps. Destroyed crown shells remove assigned spokes without rotating the survivors into new positions. |
| Rift Wraith | Reposition after warps. Broken blades thin its fan and the existing wall rows; the wall's announced gap does not move. |
| Iron Bloom | Hold a gap in the ring. Lost mandibles and beak remove their assigned spokes from the layered barrage. |
| Void Leviathan | Evade its lunge. Tail losses weaken secondary homing shots and outer fan lanes; front-mouth/core fire remains. |
| Prism Warden | Read the rotating layers. Broken fins remove their assigned arcs while the original layers keep their speed and angle. |
| Gravebell | The horn weakens pursuit. Left and right chain weights remove columns from the corresponding side of the active rain band, retaining a core-controlled column. |
| Solar Hydra | Each phase-one head owns its matching fan. The middle head also powers the phase-two beam: breaking it prevents or interrupts that beam. The other fire continues. |
| Omega Heart | Use Force against pink fire and reposition around amber attacks. Tendrils thin the assigned lanes of its alternating patterns. |
| Null Cathedral | Dismantle tendrils between rituals to thin its changing patterns, then destroy the active guardian during the ritual. |
| Miasma Throne | Strip firing heads and rear spines between rituals. The active guardian and toxin-ward rules remain central to its later phases. |

## Validation and limits

The v154 [encounter fairness review](ENCOUNTER_REVIEW.md) additionally checks spent-phase contact, secret-ritual homing and piercing, and temporal collision coverage for fast exposed cores. The authored support groups and surviving projectile patterns remain unchanged.

The pure support model covers all 22 encounters and 38 phases. Live integration compares 228 intact volleys against the frozen v147 implementation, and 660 real part-loss trials verify exact projectile subsets and unchanged cadence. It also checks shared Twin Maw supports, Hydra beam cancellation, Gravebell's rain bands, asset-independent effects, phase resets, launched shots, protected arrivals and rituals, feedback expiry and isolated attack contexts.

`node tools/verify-encounter-tactics-model.cjs` checks the support catalogue. `node tools/verify-encounter-tactics-integration.cjs` exercises the production attacks and damage paths. `python tools/build-tactics-preview.py` creates private seeded side-by-side attack snapshots using the actual renderer; it does not import a real pilot or saved inventory.

These checks establish the intended tactical consequences and preserve existing intact patterns. They do not prove full-campaign balance. Priority 5 still needs encounter-rhythm measurements, representative build comparisons and fresh-player feedback. Veteran Campaign remains deferred.
