# Regular enemy rendering — v163

Regular wings, drones and turrets now reuse six small still-pose surfaces instead of repainting the same authored atlas cells for every enemy. This continues the original roadmap's performance work. The v159 friend EXE and ZIP remain frozen.

## Implementation

Only exact animation endpoints are cached. Every strict intermediate blend keeps the existing scratch renderer, including its weighted color/coverage composition. Each retained endpoint is baked with that same composition order. Hit brightness, impact movement, chassis wobble, firing tells, Reduced Motion, world transforms and fallback artwork remain in the existing world-rendering path.

The cache checks atlas readiness before reuse and invalidates on source, dimensions or load. Pending/failed images use the existing procedural fallback. Unknown enemy types remain uncached. The cache has a hard six-entry bound; the six canonical surfaces contain 18,600 pixels, or **74,400 bytes of additional RGBA storage** at authored sizes. That is not measured browser heap usage. Existing blend scratch surfaces remain.

Enemy movement, collisions, health, attack budgets, reward rolls, gear and field clocks are unchanged. No new art, sounds or progression systems are added.

## Real-art comparison

The private browser fixture compares the frozen v162 renderer and current renderer at identical native times, poses and settings using actual Canvas2D output.

- **1,776 / 1,776 exact full-enemy RGBA comparisons**, with zero differing bytes in each case. Cases include both wing poses and blend boundaries, drone/turret firing and legacy charge boundaries, hits, Reduced Motion, 1×/2× output density, cold/hot caches, missing animation offsets, custom types and controlled pending/failed atlas states.
- **Three atlas controls pass:** an actual same-URL image reload clears the cache; reloaded output remains exact; a controlled dimension change invalidates and resamples correctly.
- Native cache checks: **8 / 8**. Existing enemy-presentation checks: **6 / 6**. Core game checks: **141 / 141**. Flight School integration: **28 / 28**.

The presentation test now inspects the surface actually drawn into the world, allowing immutable cached endpoints while retaining its animation, coverage, hit and telegraph assertions.

## Crowded-wave measurements

Six private scenarios draw 32 or 64 enemies at 960×540. Each uses four warmup batches followed by 48 alternating-order baseline/candidate pairs. The figures below are the repeat run; both runs are retained. The cache remains across scenarios/runs, so first-time pose preparation can add a few paints in an earlier run.

| Enemies / poses | Offscreen atlas paints, before → after | Median batch ms | p95 batch ms |
| --- | --- | --- | --- |
| 32 idle | 1,536 → 0 | 6.2 → 4.4 | 8.6 → 6.1 |
| 32 mixed flight/charge | 1,868 → 636 | 9.1 → 7.7 | 10.3 → 8.9 |
| 32 continuous blends | 3,072 → 3,072 | 10.5 → 10.4 | 11.5 → 11.2 |
| 64 idle | 3,072 → 0 | 8.0 → 4.7 | 8.9 → 5.4 |
| 64 mixed flight/charge | 3,734 → 1,268 | 11.9 → 9.5 | 12.7 → 10.4 |
| 64 continuous blends | 6,144 → 6,144 | 16.3 → 16.1 | 19.2 → 19.4 |

Mixed batches remove about **66% of offscreen atlas painting**; warmed idle batches remove all of it. World sprite copies still occur. Continuous blends deliberately retain their work. In the initial 64-blend run, median was 16.5 → 16.6 ms and p95 19.5 → 21.4 ms; the repeat above did not reproduce that larger p95 gap. Timing variation remains visible in the retained reports.

These timings include a draw batch and a one-pixel completion read. They exclude simulation, environments, projectiles, collisions and audio, and are **not whole-game FPS or target-device guarantees**. The direct painting counts establish reduced repeated preparation; sustained frame-time/memory testing on other computers remains open.

## Reproduce and evidence

- `node tools/verify-enemy-pose-cache-v163.cjs`
- `node tools/verify-enemy-presentation.cjs`
- `python tools/build-enemy-pose-preview.py`, then use Run Pixels / Run Wave Bench in the [private comparison](http://127.0.0.1:8765/artifacts/enemy-pose-preview.html?v=163).

The fixture uses temporary memory storage and frozen simulation. It does not touch real pilot data or ship in the friend package. [Summary](artifacts/enemy-wave-v163-summary.json), [pixel matrix](artifacts/enemy-pose-v163-browser-pixels.json), [initial benchmark](artifacts/enemy-wave-v163-browser-bench-initial.json), [repeat benchmark](artifacts/enemy-wave-v163-browser-bench.json) and [proof](artifacts/enemy-wave-v163-proof.png) retain the evidence.

Measured game source SHA256: `2a5e34dcfcf3be07d23f7060fe2ee5d44e3a8c0ae10b1bfb90e6b1b41b95acac`. Frozen v162 baseline: `1a3c1a5550fd1588cd3677419985811278fd2016711e6f13f2791e36d9910cf3`. Combat atlas: `80260885dce2bca5737de39b681db2ee4fcccdddd13774902ee23d32bc667a38`.

Fresh-player campaign fairness, physical-controller feel, human audio listening and sustained target-device performance remain the original validation gates. Veteran Campaign stays deferred.
