# Original detailed sound prompts — Starfighter: Last Signal

These are the original six detailed prompts. The [short versions](AUDIO_PROMPTS.md) remain available separately. Durations are usable event targets; any longer generated tail can be trimmed. These are earlier creation briefs. Supplied effects are installed in v151; see [Sound assets](SOUND_ASSETS.md).

The [500-word versions](AUDIO_PROMPTS_500_WORDS.md) are a separate expanded set.

## 1. Hull hit

Target: **0.30–0.40 seconds** · File: `player-hull-hit.wav`

> One isolated impact on the armored hull of a small futuristic starfighter. A tight metallic crack at the very start, followed immediately by a short, heavy low electronic thud and a descending distorted energy body. Clearly communicates real hull damage without sounding like the ship has exploded. Close, dry, tactile, restrained sub-bass, crisp readable attack, quick decay to silence. Premium arcade space-shooter sound design. One event only; no voice, music, alarm, cockpit chatter, ambience or long reverb.

Mix intent: urgent and lower-pitched than a shield hit. It must remain identifiable under gunfire without a harsh loudness spike. Do not make every hit a cinematic explosion.

## 2. Shield absorbs a hit

Target: **0.20–0.28 seconds** · File: `player-shield-hit.wav`

> One isolated energy shield absorbing a projectile around a small futuristic starfighter. Immediate rounded electric impact, then a smooth upward glassy shimmer that contracts and disappears. Solid protective energy, clean luminous texture, no broken glass. Bright but soft on the ears, short dry tail, precise onset, one event at the beginning. Distinct from a low metallic hull hit. No voice, music, alarm, ambience, repeated pulses or large explosion.

Mix intent: communicate that a shield charge was spent. Longer and fuller than a routine Force block, while less alarming than losing hull.

## 3. Force Pod / Defense Bit block

Target: **0.05–0.09 seconds** · File: `force-block.wav`

> One tiny isolated plasma interception by a compact hovering defense device. A soft rounded electric tick with a very brief airy high-frequency flick, tightly controlled attack, almost immediate decay, dry and close. Protective and satisfying, light enough to repeat often underneath a space-shooter battle. One short event at the start with clean silence afterward. No melody, voice, alarm, ambience, bass impact, metallic crash, long ringing or explosion.

Mix intent: quiet confirmation, never a warning. The engine already limits repeat playback to about one event per 90 ms; the event must not leave long tails that pile up.

## 4. Armored boss surface hit

Target: **0.04–0.08 seconds** · File: `boss-armor-hit.wav`

> One small projectile glancing against dense alien-metal armor. A compact dull metallic tap with a tiny gritty scrape and a low dry electronic tick, immediate onset and extremely short decay. Restrained and slightly resistant, without sounding like a ricochet flying across the room. Quiet repeatable feedback for a side-scrolling space shooter. One event only. No voice, music, alarm, ambience, bright reward chime, large impact or long reverb.

Mix intent: distinguish reduced armor damage from an exposed-core hit without suggesting that armor takes no damage. Playback is limited to about one event per 70 ms.

## 5. Exposed core hit

Target: **0.05–0.10 seconds** · File: `boss-core-hit.wav`

> One precise projectile hit on an exposed alien reactor circuit. A tiny sharp electronic contact and a clean rising energy glint, immediate onset, compact bright texture, very short dry decay. Satisfying confirmation of an effective weak-point hit, distinctly brighter than hitting dull armor, but smaller than breaking a part. Designed for repeated space-shooter combat hits. One event only, followed by silence. No melody, voice, music, alarm, ambience, bass boom or long ringing.

Mix intent: useful targeting feedback, not a loud collectible chime. Playback is limited to about one event per 60 ms.

## 6. Boss core / weapon assembly breaks

Target: **0.28–0.40 seconds** · File: `boss-core-break.wav`

> One compact alien reactor assembly breaking away from an armored spacecraft. Start with a crisp layered metal-and-crystal fracture, a brief pressurized energy release, then a short descending low resonance with a small clear upward energy glint above it. Tactile, powerful, detailed and controlled. Communicates a useful enemy weapon being disabled, not the entire boss dying. Dry close perspective, quick decay to silence. One event only; no voice, music, alarm, ambience, repeated explosions or long cinematic reverb.

Mix intent: clearly larger than a core hit and audible above routine fire. Preserve a short tail so several nearby breaks do not blur together.
