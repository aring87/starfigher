# Flight School

The v159 friend build reviews all five First Flight drills and adds a short Story recap after the core objectives. It covers random rolls, permanent Garage equipment, named pairs, two/four-piece sets, miniboss recovery and the three-slot perk track. Support weapons and Delta stay in optional details. Advanced salvage guidance now includes menu/restart/page-close banking. See [friend playtest](FRIEND_PLAYTEST.md).

The [current game](http://127.0.0.1:8765/?v=159) teaches permanent rolled Garage gear, miniboss recovery and the small run-perk track. New campaigns use `streamlined-v1`: up to three unique active perks from six, with replacement or keep-current-build choices after nonfinal apexes. Classic loaded checkpoints retain their earlier Module/Doctrine rules.

Keyboard and controller bindings are shared with the parent game. The isolated child imports input preferences, and its Controls panel can update only those preferences through a same-origin, source-checked message. Pilot data, equipment and checkpoints remain isolated. Lesson text, objective labels and the per-lesson control panel follow the current device and bindings without resetting lesson evidence. The panel lists all assigned fire keys or buttons, each movement direction, precision and the lesson-specific action. Controller movement also lists the always-available left stick. A/Cross advances a completed lesson; build workshops use fixed controller menu navigation. Parent controller polling is suspended while the child is open.

Story's **Play Short Intro** opens **First Flight**, a five-lesson route: `move`, `fire`, `force`, `mount`, `cores`. The intro mount drill teaches deployment, a deployed pink-shot interception and a front recall; rear mounting is reserved for the full course. Concise intro copy keeps advanced progression out of the first flight.

The main-menu **Flight School** opens all eleven optional lessons below. Both courses support retry, skip, exit and route-local replay. Each lesson waits for successful practice evidence. Graduation requires demonstrated objectives for every lesson in the selected course; skipping or jumping to the last lesson cannot falsely complete it.

Story New Game still offers Play or Skip on every new run. Completed short-intro practice opens the actual Garage. Four concise steps highlight permanent slots, item effects/random rolls/equipping, set and named-pair synergies, and inventory protection/dismantling. A reading example is shown only when there is no owned gear; it is never added to inventory. Finish, Skip Guide, Back or Escape returns to the exact pending briefing, where **Depart** starts Story after the ordinary checkpoint confirmation. Aborted practice and the optional full school keep their existing return paths. Short-intro completion (`introComplete`) and full-school completion (`trainingComplete`) are separate. The simulator owns temporary storage, rewards and equipment; parent checkpoints and equipment remain outside it.

## Lessons

| Lesson ID | Practice evidence |
| --- | --- |
| `move` | Travel 80 pixels, including 30 while using precision flight |
| `fire` | Release a quick shot, then a charge of at least 70% |
| `force` | Collect a red Force crystal |
| `mount` | Deploy, block a pink shot, dock at the rear, then dock at the front |
| `spectrum` | Collect blue, fire blue, collect yellow, then fire yellow |
| `support` | Collect and fire missiles, collect a Bit and block a shot, collect a shield and absorb a hit |
| `delta` | Fill the practice meter from 80% and activate Delta |
| `cores` | Hit armor, then an exposed core |
| `salvage` | Collect a practice Asterprint |
| `synergy` | Select Siege Coil and Capacitor Plating to assemble Charged Bastion |
| `progression` | Route permanent equipment to Garage, miniboss rewards to recovery, and nonfinal apex rewards to run perks |

The workshop uses real equipped-slot requirements from `game.js`: the Siege Coil weapon intrinsic plus the Capacitor Plating armor intrinsic activate **Charged Bastion**, adding 6% charged fighter-shot damage while a shield remains. Selecting a different real intrinsic demonstrates why power or rarity alone cannot activate that pair. These cards only change the local workbench.

The reward lesson distinguishes a one-time recovery service from a run perk. Miniboss recovery offers repair one hull, one shield up to four, or up to 12% DOSE up to 100%; it can be skipped. Apex perks occupy at most three slots, with no ranks or prerequisites. The six are Precision Relay, Core Surge, Bit Reclaimer, Second Chance, Field Nanites and Delta Reserve; the [Player Guide](PLAYER_GUIDE.md) lists their exact effects. Random gear affixes, Signal Power calibration, current two-/four-piece sets and intrinsic pairs stay in the live game. The full foundation workbench and elemental combat remain separate future work.

## Controller bridge

`training.js` injects its own scoped CSS and exports `window.StarfighterTraining`. It does not access storage or modify game objects.

```js
const school = StarfighterTraining.create({
  root: gameShell,
  begin: () => beginPractice(),
  setupLesson: id => preparePracticeScene(id),
  finish: result => returnFromPractice(result),
  pauseToggle: () => togglePracticePause(),
  isPaused: () => practiceIsPaused(),
  isPractice: () => practiceSceneIsActive(),
});

school.start({course: 'intro', continueStory: false}); // Five essentials.
// Omit course, or use course: 'full', for all eleven optional lessons.
school.note(type, payload);
school.tick(dt, state);
school.close();                   // Remove UI silently; no finish callback.
school.retry();                   // Retry the current practice lesson.
```

`active` reports whether the controller shows the offer or school. `lessonId` identifies the current practice lesson, or is `null` outside practice. `StarfighterTraining.lessonIds` contains the stable eleven full-course IDs; `introLessonIds` contains the five First Flight IDs. The controller exposes its selected `course`.

The parent owns the Story intro choice and iframe lifecycle; it never creates a lesson controller. Only the private practice document creates this module. A refused `begin` or false `isPractice` gate leaves no lesson UI, and leaving practice closes it. Pause → Restart invokes `retry`; Pause → Main Menu exits practice. The legacy `school.offer({onTrain, onSkip})` interface remains available to callers, but the shipping parent uses its own briefing choice to avoid a second offer at departure.

Supported gameplay notes are `shot({charge,color})`, `pickup({type,color})`, `podBlock`, `bitBlock`, `shieldHit`, `delta`, `armorHit`, `weakHit`, and `gear`. Relevant pickup types are `crystal`, `missile`, `bit`, `shield`, and `gear`. Notes must come from successful gameplay actions, not attempted button presses.

The state snapshot supplies `x`, `y`, `precision` (or `focus`), `podMode`, `dockSide`, `dose`, and optionally `paused`. Nested `pod.mode` / `pod.dockSide` are accepted too. Paused evidence is ignored. The module owns the workshop and reward-routing interactions.

Live lesson cards occupy the right 32% of the flight area below the HUD. Keep practice objects in the left two-thirds. The workshop and final reward exercise use a wider centered card. Ensure each gameplay scene replenishes missed pickups and useful practice shots until the pilot completes or skips it.

## First-earned guidance

`onboarding.js` exports `StarfighterOnboarding.create({root,getScope,getSeen,remember,isAllowed,getAnchor})`. The game supplies profile persistence, Story/context gating and decision-screen anchors. The controller owns only presentation; it never reads storage or changes combat.

`show(id)` queues an unseen catalogue hint. `tick(dt)` advances visible time, `dismiss()` acknowledges a visible note, `close()` clears pending UI, and `dispose()` removes the controller. `activeId` and `queuedIds` expose presentation state. The original persisted IDs include missile, bit, shield, delta, gear, module, doctrine and synergy; classic decision guidance stays compatible with older pilot records. New recovery/perk screens explain their own exact effects.

Floating Story notes wait until a safe field interval and last nine visible seconds or until acknowledged. Decision notes mount in normal flow and remain until acknowledged or committed, so timed collapse cannot move a choice beneath the pointer. Gear waits for the Garage; synergy waits for a real equipped pair. One hint appears at a time. Pause/help/training hide and freeze notes, and changing profile scopes clears old queues. Learned IDs are normalized and saved in `progress.onboardingSeen`; full-school graduates already know the advanced guidance.

## Verification

- `node tools/verify-training.cjs`: full and intro routes, evidence gates, replay, pause/retry, skip safety, completion and cleanup.
- `node tools/verify-training-integration.cjs`: the five-lesson intro through real movement, charge, pickups, Force interception/front recall and armor/core collisions; URL validation and unchanged parent saves.
- `node tools/verify-onboarding.cjs`: bounded queues, visible dwell, decision anchors, pause, scope isolation and cleanup.
- `node tools/verify-onboarding-integration.cjs`: pickup/threshold hooks, boss/pause gates, classic decision commits, Garage pairs, per-pilot persistence and developer/Rush exclusions.
- `node tools/verify-streamlined-integration.cjs`: the live recovery/perk route, checkpoint continuity and the new-run ruleset boundary.

Browser review should complete the five drills with actual inputs, return to the briefing, access optional advanced lessons, assemble a real equipment pair and inspect recovery/perk instructions. Also check pickup-tip pause/resume and classic decision guidance when loading an older checkpoint. Private review pilots must not import or change the real pilot's equipment or checkpoint.
