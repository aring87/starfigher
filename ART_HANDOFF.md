# Installed menu art and intro music

The menu uses your supplied violet-eclipse artwork and **Space Blaster** intro music.

For each future audio pass, provide copy-ready ElevenLabs or Suno prompts. ElevenLabs' shown input limit is 500 characters, not 500 words; count spaces and punctuation too, and keep labels and mix notes separate. Use the [500-character prompts](AUDIO_PROMPTS_500_CHARACTERS.md) or the [short variants](AUDIO_PROMPTS.md). This is the user's standing preference. v151 installs all seven supplied effects with procedural fallback; the favorite tiny clip confirms gear receipt. [Sound assets](SOUND_ASSETS.md) records the edited core break, timings and validation.

## Artwork

- Supplied source: `C:\Users\aring\Downloads\starfighter under the violet eclipse.png`, a 1672×941 PNG.
- The game copy is installed at `assets/menu/menu-key-art.png`. The original Downloads image remains unchanged.
- The `--menu-art` hook in `style.css` connects the image as a full-width menu background. Its current left-side controls and artwork stay unchanged, preserving the fighter and eclipse composition.
- The old right-hand mission card returns on a separate pre-launch briefing screen after New Game, Garage launch, or a completed-mission selection. The card shows the selected stage artwork through `--briefing-art`, beside the mission details, hazard, elite, and expected apex. DEPART launches; Back/Escape returns to the origin without replacing a checkpoint.
- Menu buttons remain live controls, independent of the artwork.

## Music

- **Space Blaster** is installed at `music/menu-intro.mp3`: 89.88 seconds, stereo, 192 kbps, approximately 2.16 MB. The unmodified WAV master is retained at `music/menu-intro.wav`; the original Downloads file is unchanged.
- The game copy has a 25 ms fade-in to soften its start and retains the track's natural fade-out. The complete theme loops on title/menu screens; this is a full-theme repeat rather than a seamless musical loop.
- Menu navigation, including the separate mission briefing, keeps the same playback position. Departing or loading a run replaces the intro with the appropriate gameplay theme; returning to the title starts the intro again. Music uses the existing volume and mute controls and pauses for help or a hidden tab.
- If the browser blocks autoplay, the first menu click or key press starts the track. No extra start screen is required.
- Boss arrivals use a protected 4.2-second visual warning while the current theme fades down, followed by a 0.65-second fade into boss music. Arrival audio is always music-only; the former alarm/fade preference has been removed. The transition follows Music volume and master mute and pauses with gameplay, help, or a hidden tab. Generated alarm assets are retired from game playback.

The Story/Rush controls, checkpoint loading, Garage and mission archive remain independent of the artwork and music. Later asset revisions can replace the installed files without rebuilding the menu flow.

## Prepared boss destruction sprites

`assets/destruction/manifest.json` maps each native animation sheet to its retained body and separate exterior assemblies. The build script is `tools/build-destruction-sprites.cjs`. Each original native texel has one owner, so intact core-plus-limb reconstruction preserves the original art. Bloodstar keeps its existing authored destruction sheets.

`assets/destruction/joint-caps.png` contains sixteen new broken armor mounts, created from the Reaver and Twin Maw references. `assets/destruction/ART_PROMPT.md` records the generation prompt. These small solid mounting saddles sit beneath living limbs and finish exposed roots after a break; they do not erase the body. The supplied menu art remains independent of this sheet.

`destruction.js` prepares and caches the sprite layers per encounter. Prism's intermediate source images use the normal loader's prepared transparency, preserving dark machinery while removing their opaque black backing. Falling parts use the actual limb texture and killing pose, including jaw/shell bone transforms. An unfinished texture load queues that pose rather than substituting generic debris.

Regenerate `artifacts/damage-sprite-preview.html` with `python tools/build-damage-sprite-preview.py` to review intact/damaged poses and exact falling sprites using an isolated test pilot. `tools/verify-destruction-sprites.cjs` checks PNG ownership; `tools/verify-destruction-runtime.cjs` checks rendering, readiness and state transitions. These checks supplement visual review rather than judging art quality.

For the entire roster, run `python tools/build-destruction-roster-preview.py` and open `artifacts/destruction-roster-preview.html`. It captures all 22 encounters and 38 phases sequentially, retaining the rendered canvases as source textures leave the cache. Family/phase filters, pose stepping, hit flash and the explicit 16-cell miniboss view expose ownership errors without smoke hiding them. Its test pilot uses temporary memory storage.

Miniboss anatomy is prepared by `tools/destruction-mini-anatomy.cjs`, using the visible firing axis in each native pose. It keeps firing noses and toothed faces attached while fins, arches and crests detach. Later bosses use individual horn, cable, head/neck and tail assemblies; charged Rift blade fans carry their outgoing electricity with them. Native landmarks are registered offline so both the damage art and weakpoint targets follow the same features.

`tools/verify-destruction-animation.cjs` sweeps the prepared animation sources; `tools/verify-mini-muzzle-preservation.cjs` checks measured firing-tip regions that previously fell away with fins. The original source colors and alpha remain reversible across core and part atlases.

Miniboss masters also contain disconnected fragments from adjacent animation cells. `StarfighterDestruction.cleanMiniAtlas` removes those separate components from each loaded cell while preserving every pixel of its connected hull, fins and muzzle. The PNG masters remain unchanged. Both intact rendering and prepared core/limb/debris textures use that cleaned source alpha. Miniboss weakpoint samples use transparent padding outside their own frame, so sampling cannot copy a neighboring pose. `tools/verify-mini-frame-residue.cjs` exercises all 160 source cells and 640 intact/damaged combinations using real PNG data and the production preparation path.
