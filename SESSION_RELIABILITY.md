# Session reliability — v156

Field gear could previously disappear when a pilot returned to the menu or restarted before the next elite/apex bank. It was held in the run's pending salvage array, which those exits cleared.

The game now secures pending equipment through the existing Garage bank before a live run returns to the menu, restarts or leaves through the browser's page lifecycle. This uses the existing capacity, equipped-item, lock and overflow-to-Alloy rules. It does not advance the checkpoint, refill resources, award another recovery/perk choice or finalize an attempt. DEV and Flight School remain isolated.

The pause screen explains that equipment stays in the Garage, Main Menu retains the last checkpoint, and Restart Run begins again. Pickup notices are hidden while paused so they cannot cover those actions.

## Verified behavior

- **Gear exits:** ten focused groups pass. Native pickup collisions, twenty menu/reload cycles, ten pagehide/pageshow cycles, restart, protected overflow and pilot ownership are covered. The frozen v155 source reproduces eight failures; its two controls pass. Banking leaves checkpoint and lifetime snapshots unchanged.
- **Sequential campaigns:** four groups pass through two complete Story sequences, a ten-encounter Rush and seven durable selected-mission replays. The run includes 272,241 native updates, 79 loads, 64 Garage returns and 64 encounter clears. Replays reach the 32-item capacity and convert overflow into Alloy. Rush does not unlock full Story mission replays.
- **Runtime soak:** fourteen staged segments run for 870 simulated seconds and 104,400 native updates in one private VM. Peak particles are 483 against the existing 700 cap; the sampled material cache reaches 62 against its 256 cap. Actor-free drains expire effects/player packets, and native restart clears transient arrays. Two surviving homing packets in an actor-free drain are recorded as existing orbit behavior, not treated as evidence of a leak.
- **Browser:** native pickup, pause/menu exit, restart and actual page reload retain the correct unique test item. The checkpoint remains at Mission 1's recorded start. The public v156 menu retains the existing pilot's four mission/apex records and best score. No console warnings/errors appear in either reviewed page.
- Core regression, loss/retry, Garage retry/refit, save compatibility and Flight School integration pass.

The sequential tests use passive invulnerable fields and forced encounter completions. The soak uses a clearly labeled high-hull meter and mocked graphics/audio. These establish lifecycle and bounded logic behavior; they do not establish campaign difficulty, real heap/GPU/mobile performance, physical-controller feel or human long-session stability. Those roadmap checks remain open.

## Reproduce

- `node tools/verify-menu-loot-v156.cjs`
- `node tools/verify-menu-loot-v156.cjs --baseline`
- `node tools/verify-campaign-session-v156.cjs`
- `node tools/verify-runtime-soak-v156.cjs`
- `python tools/build-session-review-preview.py`

The [private session review](http://127.0.0.1:8765/artifacts/session-review-preview.html?v=156) uses a dedicated per-tab QA session-storage key. It never reads or writes real pilot localStorage. Start with the paused native pickup, then use Main Menu/Garage, Restart Run or Reload Tab; Show Report exposes inventory IDs, pending salvage, checkpoint, lifetime totals and the source hash. New Test Pickup resets only this temporary fixture. The abandoned window.name prototype did not preserve writes made during outgoing pagehide; the final review uses storage that survives those writes.

[Play the current game](http://127.0.0.1:8765/?v=156). Detailed evidence is in `artifacts/polish-v156-summary.json`, `artifacts/menu-loot-v156-live.json`, `artifacts/campaign-session-v156.json`, `artifacts/runtime-soak-v156.json` and `artifacts/session-v156-browser.json`.
