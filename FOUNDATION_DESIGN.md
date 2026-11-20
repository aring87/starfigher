# Rolled gear, gear sets and a small run perk track

Status: **the v146 reward track is live for new campaigns; the full gear/combat foundation remains a separate prototype**. [Play v146](http://127.0.0.1:8765/?v=146) for `streamlined-v1` recovery and three-slot perks. Open `foundation-lab.html` through the existing local server to explore the broader proposal. `foundation.js`, `foundation-combat.js` and the full build bridge are not applied to live combat. The workbench uses temporary page state and never reads or writes pilot storage.

The shipped reward model is `run-progression.js`, with `run-rewards-ui.js` and `run-rewards-ui.css` for its decisions and inspection. It leaves random gear affixes, Signal Power calibration, the current two-/four-piece resonance sets and exact intrinsic pairs unchanged. Loaded classic checkpoints keep their Field Modules and Doctrine. There is no automatic migration of their run choices or gear into the prototype.

The v144 compatibility milestone adds original-item archives to the live loader and explicit classic checkpoint rules/build versions. Old saves still restore their recorded build; unknown future profiles are protected from downgrade. The Garage now exposes current set progress and replacement counts. The standalone `foundation-bridge.js` can prepare a frozen player-configuration patch and read-only inventory migration snapshot without touching current resources or merging stat variants. It is tested separately and is not yet applied to live combat.

The accepted direction is permanent Garage gear plus a small temporary run track. **Random stat rolls and gear-set synergy remain core features.** Simplification removes repeated reward systems and unclear stacking, while retaining the hunt for useful combinations.

## Full proposed foundation

| Layer | Its job | Proposed boundary |
| --- | --- | --- |
| Four permanent gear slots | Define the ship and provide loot variety | Each item has one intrinsic, one or two rolled stats, and one gear-set family. |
| Matching gear sets | Reward specialization or a mixed build | One explicit 2-/4-piece system. Two plus two is valid. Four pieces retain their two-piece benefit. |
| Three active run perks | Let a campaign develop without unlimited stacking | Six distinct perks initially; no ranks, prerequisite taxes or permanent carryover. A new perk replaces one when all three slots are occupied. |
| Combat pickups | Supply weapons, support tools and recovery | Keep Force patterns, missiles, Bits, shields and current mission kit limits. Inventory loot does not automatically grant a bundle of combat buffs. |
| Miniboss service | Give a clear intermission benefit | Choose repair one hull, add one shield, or add 12% Delta charge; once per encounter. Garage access remains available. |
| Future elements | Add matchup decisions | Separate from trajectory and Force colors. Introduce after the core damage and reward rules are integrated and playtested. |

The reward portion now replaces separate Field Module and 18-node Doctrine choices in new v146 runs. The full proposal would also remove passive Signal Power damage calibration and the exact-intrinsic-pair bonus layer, and replace the current alignment effects. **Those gear changes are not live.** They require a separate migration and balance decision; v146 keeps the existing gear model and its distinct rolled variants.

## Proposed gear model — not v146

The prototype retains all five rarity names. Common items roll one distinct affix; other rarities roll two. Higher rarity modestly improves the roll floor while the maximum for each affix stays fixed. These counts and ranges are a starting budget, not a final claim about drop satisfaction.

| Slot | Initial roll pool |
| --- | --- |
| Weapon | Fighter damage 2–4%; charge speed 3–6%; core damage 3–5%; missile damage 3–5%. |
| Armor | Maximum hull +1; starting shield +1; Force interception radius +1. |
| Engine | Flight speed 3–6%; charge speed 3–6%; Force handling 4–8%. |
| Force Pod | Force damage 3–6%; Bit damage 3–5%; Force interception radius +1; core damage 3–5%. |

Two items with the same intrinsic can have different rolls and different set families. **They remain separate items.** The legacy preview preserves every original item, ID and roll; it does not merge duplicates, dismantle equipment or replace a saved loadout. Retired or over-budget rolls appear as explicit proposed changes beside their untouched originals. A real migration requires a backup and compatibility checks before cutover.

Same-stat rolls add together before being applied once. A weapon and engine each rolling 6% charge speed produce 12%, rather than silently multiplying into a larger bonus. Source names have precise meaning: fighter damage affects the cannon; missile, Force and Bit damage use their own fields. The larger full-charge packet and its cadence remain part of the base weapon rules.

The test compiler bounds fighter damage rolls to 4%, missile rolls to 5%, and combined charge-speed rolls to 12%. Intrinsics and set conditions remain visible additions. These are per-source stat limits, not a proof that spread, penetration, automatic Force fire and single-target charge have equal combat value.

## Proposed set bonuses — not v146

| Set | Two pieces | Four pieces add |
| --- | --- | --- |
| Vanguard | Exposed-core hits deal 4% more damage. | Breaking a core adds 6% Delta charge. |
| Aegis | One starting shield. | Twelve Force blocks restore one shield, at most once per mission. At full shields the restoration waits until a later block with space. |
| Vector | Force deployment and recall are 8% faster. | The first combat pickup each mission grants a six-second, 10% flight/charge Surge. |

A Vanguard charge build rewards aiming at openings. Aegis works with deliberate Force interception and Absorption Siphon. A two-Vanguard/two-Vector build trades the four-piece trigger for core precision and Force handling. Existing gear intrinsics retain their identity, with explicit corrections:

- Recovery Weave repairs one hull on the first shield pickup each mission.
- Scavenger Drive grants a first-combat-pickup Surge, rather than describing a benefit that every inventory pickup already grants.
- Phase Turbine blocks one contact hit per mission; it does not grant general projectile immunity.
- Salvage Shepherd attracts combat pickups, making it useful even when gear awards are banked directly.

Set-restored shields are not shield pickups. They cannot recursively trigger Recovery Weave or Capacitor Plating. Starting shields apply at new-run construction; advancing a mission or refitting cannot refill them. Surges share a timed pool with maximum duration/strength instead of multiplying repeatedly.

## Live v146 run track

New `streamlined-v1` campaigns have six distinct perks with at most three active. They have no ranks or prerequisites and do not carry over into a new run.

| Perk | Exact effect |
| --- | --- |
| Precision Relay | Breaking a boss core generates 6% DOSE. |
| Core Surge | Breaking a boss core grants a four-second Surge: +6% movement and charge speed. |
| Bit Reclaimer | Each hostile shot blocked by a defense Bit generates 0.4% DOSE. |
| Second Chance | Once each mission, survive a lethal ordinary hull hit with one hull. |
| Field Nanites | After defeating an apex, repair one hull, up to maximum hull. |
| Delta Reserve | Surplus kit pickups generate 5% DOSE instead of 2%. |

After each nonfinal apex, the game offers three unowned choices and an option to keep the current build. The first three choices fill slots; later choices replace an active perk. The draft stays the same after a Garage visit or checkpoint load. The standalone prototype exposes all six cards for designer comparison; the live reward screen uses the saved three-card draft.

Minibosses still award rolled gear and offer one recovery service: repair one hull, add one shield up to four, or add up to 12% DOSE up to 100%. Full reserves disable the corresponding service, and the pilot can skip. Apex gear rewards also remain unchanged. Choosing recovery or a perk does not automatically equip gear. Garage access stays at both safe intermissions, with no healing or shield refill from refitting. Per-mission reward IDs prevent a service, perk choice or Field Nanites repair from being awarded twice after reloading or changing screens. Classic checkpoints continue their original Module/Doctrine route.

## Elemental expansion

Elemental combat is future work, not a v146 feature. The standalone preview uses Neutral, Heat, Ion and Cryo. Names and enemy assignments remain provisional. Elemental rules default off. The proposed first pass uses 1.20× weakness, 0.85× resistance and 1.00× neutral, with no full immunities, dual elements or status stacks.

Red/blue/yellow Force crystals currently mean direct, ricocheting and guided patterns. They remain pattern choices. Future element identity is a separate typed field; it is never guessed from a sprite color or CSS value. Every enemy should expose at most one weakness and one resistance through a clear icon and short briefing/inspection text.

The pure damage contract has an explicit amount, source, element and shot conditions. Source-specific gear applies once, affinity applies once, and the target region applies once. Boss armor remains 25% of the normal hit; exposed-core aim is still the larger reward even when comparing a resistant core with weak armor. Protected arrival, hiding, phase transition and rituals must gate all damage. Delta keeps its scripted policy initially.

Burning, slowing, chain lightning and other status effects are not implemented. They should be designed after affinity feedback and matchup balance work. Any later damage-over-time tick must respect encounter protection, pause state and once-only kill/part rewards.

## Cutover work still required

The reward-only cutover now has versioned rules, a bounded live run model and dedicated recovery/perk screens. The full foundation still needs:

1. A reviewed gear migration using backups of original rolls and explicit handling of retired affixes, while preserving locked gear and distinct rolled variants.
2. One foundation build compiler used by new-run creation, refits and checkpoint restoration; no repeated multiplication over an existing fighter.
3. One source-aware damage path across ordinary enemies, all 22 encounters, ritual guardians and destructible debris, while Delta keeps its explicit exception.
4. Full-foundation checkpoint and refit validation, distinct from v146's reward rules and unchanged gear calculations.
5. Readable elemental matchup feedback before enabling affinities; status effects need their own later design.
6. Measured mission-one, midcampaign and final-campaign playtests for connected damage, time to kill, hit frequency, defensive uptime and gear replacement rates. Fixed caps alone do not establish enjoyable difficulty.

Run `node tools/verify-run-progression.cjs` for the shipped perk model and `node tools/verify-streamlined-integration.cjs` for the live reward route. `node tools/verify-foundation.cjs` checks the separate prototype's deterministic drops, proposed sets, source isolation, protected damage, resource caps and read-only legacy previews. `node tools/verify-foundation-bridge.cjs` checks repeated scalar patches, current-resource separation and archived/current metadata ownership. `node tools/verify-save-foundation-compat.cjs` exercises loader and storage compatibility. Browser review should cover the actual Garage, recovery/perk decisions and the separate workbench. The live game is [v146](http://127.0.0.1:8765/?v=146).
