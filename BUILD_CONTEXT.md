# Gear rolls and perk clarity — v160

This development pass continues the original roadmap's build-choice review. The v159 friend executable and ZIP stay frozen. Fresh-player campaign difficulty is still an open validation gate.

## Fair random rolls

The old random-sort stat selector favored some entries in each slot's four-stat pool. A partial Fisher–Yates sample now chooses distinct stats with equal opportunity. Each integer value inside an authored roll range is also equally likely; rounding previously favored middle values over the endpoints.

A fixed-seed diagnostic generates 10,000 native items per rarity, 50,000 in total. For example, the Common weapon stat proportions changed as follows; the intended probability is 25% for each stat:

| Stat | Frozen v159 | v160 |
| --- | ---: | ---: |
| Fighter damage | 28.19% | 25.88% |
| Charge speed | 27.74% | 25.44% |
| Critical chance | 18.82% | 23.88% |
| Core damage | 25.25% | 24.80% |

Rare weapons' critical-chance inclusion changes from 35.69% to 49.48%, near the intended 50% for two distinct stats. Exact integer buckets confirm equal probability across each range, including minimum and maximum values.

Rarity chances, stat counts, roll bounds, Power calculation, intrinsics, set/pair effects, kit caps and reward budgets retain their authored values. Existing items keep their IDs, rolls, locks and equipped slots. Future random sequences differ because the selection algorithm consumes random draws differently. These distribution checks do not establish player survival, damage uptime or campaign difficulty.

## Choices explain their current use

- Bit Reclaimer says when a Defense Bit must first be collected, or shows the actual equipped count. It remains a valid forward-looking choice.
- A new Field Nanites offer explicitly starts at the next apex and gives no immediate heal. Inspection retains its next-apex explanation.
- Second Chance inspection distinguishes ready and used mission charges. Replacement previews preserve that context. Final-build screens avoid suggesting another apex is pending.
- Scavenger Drive describes its actual 10% movement/charge Surge, rather than implying it creates the baseline gear-pickup Surge. Its six-second pair stays intact.
- Vector Governor describes handling for both mounting sides, matching the existing deployment/recall code.

Context adds no reward or stat changes. A perk preview, inspection, refit or reload cannot replenish a spent guard or retroactively heal the prior apex.

## Verification

- `node tools/verify-gear-rolls-v160.cjs --baseline`: reproduces biased stat selection and middle-value weighting in frozen source.
- `node tools/verify-gear-rolls-v160.cjs`: six groups pass, including 50,000 generated items and exact integer buckets.
- `node tools/verify-build-context-v160.cjs`: nine groups cover real rendering, selection/replacement, resource ownership, gear semantics and save/load.
- Core game: 141 checks. Streamlined lifecycle/controller navigation: 31. Gear comparisons: nine. First-support drops: 14. Flight School integration: 28. Intro-to-Garage: eight. All pass.
- Private browser review confirms missing/owned Bits, ready/spent Second Chance, replacement/cancel and next-apex healing context. Large text fits a 1280×720 window with the primary actions visible and no horizontal overflow. Selecting Field Nanites resumes Mission 2 with the staged one hull still intact; no immediate repair occurs. No warning/error logs appear.

Browser fixtures use temporary memory storage and explicitly staged kits, never a real pilot. Native tests mock graphics/audio. Physical-controller feel, fresh-player balance and target-device performance remain open.

[Play v160](http://127.0.0.1:8765/?v=160) · [Private context review](http://127.0.0.1:8765/artifacts/build-context-preview.html?v=160)
