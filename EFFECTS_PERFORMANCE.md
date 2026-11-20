# Smoke and debris updates — v164

Particle and debris drag now calculate once per nonempty effect group in each simulation step. Previously each effect recalculated the same value for each velocity component. Each group still uses its actual `dt`; no drag value persists between steps.

At the existing normal limits of 700 particles and 100 debris, this reduces explicit drag exponentiation calls from **1,600 to 2 per step**. At 120 steps per second with those groups continuously full, that is 192,000 versus 240 calls. This describes removed arithmetic, not a measured frame-rate improvement. Browser optimization, rendering and other simulation work affect actual performance.

Position updates still use the old velocity before applying drag. Velocity multiplication order, lifetimes, filtering, effect order, emission thresholds and random draws remain intact. Normal, Clear Combat and Reduced Motion retain their existing effect budgets. Art Inspector retains its actual elapsed-time updates and restores the original effects on exit. Rendering, art, damage smoke, falling parts, hitboxes, health, gear and campaign timing are unchanged.

The regression compares frozen v163 production functions against current functions with exact numeric/state equality, including seeded emission and expiry. Evidence is in [the focused report](artifacts/effect-drag-v164-verification.json). Run `node tools/verify-effect-drag-v164.cjs`, `node tools/verify-damage-smoke.cjs`, `node tools/verify-training-integration.cjs` and `node tools/verify-game.cjs` to repeat the checks.

All **8 focused groups**, **6 damage-smoke checks**, **28 Flight School integration checks** and **141 core checks** pass. The focused comparison includes five single-step sizes, 180 mixed trajectory steps, 240 full-update steps for each display setting, maximum/empty effect groups and 45 Art Inspector steps followed by combat-effect restoration. These use disposable VM pilots with drawing/audio mocked; no real player data is accessed.

Baseline: `artifacts/effects-v163-baseline-game.js`, SHA256 `2a5e34dcfcf3be07d23f7060fe2ee5d44e3a8c0ae10b1bfb90e6b1b41b95acac`. Current game SHA256: `ecc44a86bee7348e754ca5e2c38894e85e59d71464adab2507607ecf29d8d8d2`.

This remains local-browser development. The v159 friend EXE and ZIP stay frozen. Sustained performance on other computers, fresh-player difficulty, physical-controller feel and human audio review remain open.
