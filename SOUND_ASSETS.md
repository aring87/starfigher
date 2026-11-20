# Supplied gameplay sounds — v151

All seven supplied WAVs are installed. Downloads are unchanged; matching source masters are retained under `assets/audio/source/`. Playback uses prepared 48 kHz mono PCM16 WAVs under `assets/audio/sfx/`, with the existing SFX volume, mute and mix buses. No new sound generation was needed.

| Supplied file | Game event | Prepared length |
| --- | --- | ---: |
| exposed core hit.wav | Positive, nonlethal exposed-core damage | 0.214 s |
| armor hit.wav | A successful armor-chip transaction | 0.193 s |
| force bit block.wav | Force Pod or Defense Bit intercepts pink fire | 0.220 s |
| shield hit.wav | Shield/guard prevents hull damage | 0.281 s |
| hull hit.wav | Hull damage, including epic damage mechanics | 0.250 s |
| core weapon break.wav | A core or attached weapon assembly breaks | 0.589 s |
| A_tiny,_satisfying_J-1794956770209.wav | Actual gear receipt through `collectGear` | 0.094 s |

The favorite tiny sound is a gear confirmation, including field, elite and apex gear. It does not play on every shot, menu click or surplus combat pickup. Its original tonal character is retained; the long near-silent remainder is removed. Other supplied effects retain their source character without pitch shifting.

## Core break edit

The supplied two-second recording contains an initial decay, a long quiet valley, then a second louder cluster that ends abruptly. The live edit makes one event:

1. Use source 1.184–1.245 s for the immediate metal/crystal fracture.
2. Bring source 1.784–1.858 s forward for the low impact, at 0.85 gain.
3. Use source 0.130–0.620 s for the natural fading body, at 0.85 gain.
4. Join those pieces with 12 ms and 24 ms equal-power crossfades, then a 1 ms entrance and 55 ms exit fade.

This removes the long gap and abrupt loud ending. The strongest bass lands near the opening fracture instead of much later. The edited event ends cleanly at 0.589 seconds.

Other hit masters had their main attacks around 0.35 seconds into the file. Their silent lead-ins are removed; measured prepared attack onset is 2–8 ms. Shield uses the first impact/swell, omitting a separate later swell. All prepared clips have zero-valued endpoints, a peak of 0.8 before in-game gain, and no clipped samples. These are waveform measurements, not a claim that a speaker/headphone listening review has been completed.

## Runtime behavior

`sfx-samples.js` prefetches encoded bytes without opening an audio device. The game creates its usual gesture-authorized AudioContext; the bank then decodes each asset once for that context. A ready sample replaces its procedural cue. If loading, decoding or source creation fails, the original synthesis plays immediately. Missed samples are never queued for later replay.

Core, armor and block playback retain their existing cooldowns. Foreground hull, shield and part-break cues still reduce routine details briefly. Each sample has a fixed overlap limit; muting stops active sampled voices, and hidden pages cannot start new ones. Sample gains are staged separately from source normalization, before the shared limiter. Shots, charging, supplied intro music and the music-only boss transition retain their previous sound designs.

## Rebuild and review

- `python tools/build-game-sfx.py` rebuilds all prepared effects from workspace source masters. It checks format, onset, headroom and clean endpoints.
- [Asset edits and measurements](artifacts/game-sfx-assets-v151.json) record source/output hashes, trims, fades and WAV metadata.
- [Original waveform audit](artifacts/new-sfx-audit.md) explains the source material and placement decisions.
- `node tools/verify-sfx-samples.cjs` checks caching, decoding, failure handling and overlap limits.
- `node tools/verify-sampled-sfx-integration.cjs` checks actual class/bank routing, fallback, mute, gain, cooldowns and gameplay event placement.
- `python tools/build-sfx-audition.py` builds [the native audition page](http://127.0.0.1:8765/artifacts/installed-sfx-preview.html?v=151), with separate cue buttons and original/edited core-break players. This page never opens a pilot save.

The browser rendered [an 8.5-second combat mix](artifacts/installed-sfx-v151.wav): 16 sampled cue starts, zero synthesis fallbacks for those mapped cues, peak 0.2572 and zero clipped samples. [Native result](artifacts/native-sfx-v151.json). Its ordered cue list is on the audition page. Playback quality and final loudness should still be judged by listening on the intended speakers or headphones.

For future sound requests, continue supplying [prompts within the 500-character field](AUDIO_PROMPTS_500_CHARACTERS.md), counting spaces and punctuation. The existing prompts remain useful for variants; this pass edited and installed the files the user supplied.
