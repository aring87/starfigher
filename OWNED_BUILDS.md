# Earned build discovery and calm intermissions — v161

This pass continues the original roadmap's build review. It improves access to existing combinations and fixes frozen-screen camera jitter. The v159 friend package remains frozen.

## Earned gear evidence

The diagnostic follows 64 empty private Story pilots through actual guaranteed elite/apex reward branches. Victories are staged. Every recovery and perk is skipped; field drops and secret substitutions are excluded. It generates and banks 1,280 unique items, with real ownership, capacity and run-finalization checks.

| After mission | Could assemble a named pair | Highest-Power-per-slot activates one | An owned opportunity is missed entirely |
| --- | ---: | ---: | ---: |
| 5 | 51 / 64 | 15 / 64 | 36 / 64 |
| 10 | 62 / 64 | 22 / 64 | 40 / 64 |

On entry to missions 2/5/10, median highest-Power loadouts are 111/120/139. Their native boss-health multipliers are 1.0123/1.0482/1.0557. At Mission 10, assembling an owned pair costs a median 2–4 Power, depending on the pair. These are alternatives drawn from the same inventory; a pair's practical benefit still depends on the shield, Force position, block or pickup it requires.

This supports making owned combinations easier to discover. It does not establish human success rates, favor every pair over mixed gear, or justify another raw-stat buff. [Full results](artifacts/earned-builds-v161-review.md) record every mission; [JSON](artifacts/earned-builds-v161.json) includes actual items, policies and native compiled stats. The measured source hash differs from final source only in later help-copy changes; gameplay rules are unchanged by this pass.

## In-game changes

The collapsed Equipment Pairs panel now counts inactive pairs the pilot already owns. Open it to distinguish **EQUIPPED**, **IN STORAGE**, and **NOT OWNED** requirements. Stored requirements name the matching item. A wholly owned inactive pair says **OWNED · EQUIP TO ACTIVATE**; it becomes **ACTIVE** only when the required pieces are equipped.

Relevant item cards name an owned partner, its slot and exact intrinsic. Existing Power, roll, set-loss and intrinsic trade-offs remain visible. This is read-only guidance: no auto-equipping, new drops, extra item strength or changed checkpoint build. Actual combat compilation still occurs at new-run start or a committed round/refit action.

Battlefield camera shake now runs only during active combat. Previously a hit or boss arrival could leave nonzero shake frozen behind Pause, recovery, perk and loss screens. Idle redraws kept choosing random offsets at 10 Hz. Frozen scenes now stay still; active combat shake, its remaining duration, and Reduced Motion retain their behavior.

## Verification

- Eight owned-pair groups cover all four pairs, stored/partial/active states, representative names, escaped names, no preview side effects, banking/dismantling, and manual round refit without free recovery.
- Nine native camera trace groups pass. The exact v160 baseline reproduces five frozen-screen failures, with four controls passing. Tests inspect the actual transform after camera placement, not a duplicated condition.
- Existing core game: 141 checks. Gear comparisons: nine. Gear sets: five. Flight School integration: 28. Streamlined lifecycle and controller navigation: 31. All pass.
- Private browser review confirms two stored combinations, manual equipment activating exactly one, preserved expanded-panel state, Large text at 1280×720 with no horizontal card overflow, and Pause immediately after a native hull hit. No warning/error logs appear.

The browser uses an explicitly staged, temporary-memory pilot. Native tests mock graphics/audio. Human campaign difficulty, physical-controller feel, listening and target-device frame times remain open. Synchronous fragment capture is a candidate for a later measured performance pass; no crop, destruction artwork or cache budget was changed here.

[Play v161](http://127.0.0.1:8765/?v=161) · [Private pairs/pause review](http://127.0.0.1:8765/artifacts/owned-pairs-preview.html?v=161)
