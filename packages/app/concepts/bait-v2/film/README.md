# The Spicy Mountain

An original, staged BAIT Extension concept. This is a rendered illustration of a round, not a recording or evidence of live speech recognition. Fictional streamer, game, dialogue and chat names.

The composition follows Opus's BAIT v2 design direction and 32-second storyboard. The desktop master is 1920×1080; the phone master is independently arranged at 1080×1200. Both share `timeline.js`, have the same chapter positions, and use local fonts and assets. Generated images are not remote runtime dependencies.

## Source and asset provenance

- `masters/film-16x9.html` and `masters/film-9x10.html`: editable HTML scene, chat and captions. `index.html` mirrors the desktop master for discovery; production preparation copies the selected master to an isolated renderer project.
- `film.css`: composition coordinates and sprite cells. No CSS transitions, timers or random visual state.
- `timeline.js`: paused GSAP timeline registered after fonts load. Direct seeking determines every visual state.
- `art/mossbyte-poses.png`: original ChatGPT image generation, six expressions in a transparent 3×2 sheet. Green beanie, headset, cream hoodie and warm plum outlines. Talk, squint, smug, shout, facepalm, laugh.
- `art/little-isle.png`: original ChatGPT image generation. A fictional pixel island-builder scene with turquoise sea, a hut and an unmistakable crater. No third-party game footage.
- `art/effects-sheet.png`: original ChatGPT image generation. Three orange hook-bomb emotes, two hammer poses and a smoke puff, arranged in a transparent 3×2 sheet. No Twitch emotes.
- `art/volcano.png` and `art/bait-bomb.png`: copies of previously approved project assets. Originals are unchanged. The eruption is built independently from original SVG shapes and shares the island crater anchor.
- `art/inter.woff2` and `art/russo-one.ttf`: existing local project typography. `art/gsap.min.js` is the existing pinned GSAP 3.15.0 distribution.
- `audio-entry.js`: deterministic export of existing Sound Lab recipes from `client/sound-lab`. Deal at 1.9s; catch at 23.3s, after confirmation. No synthetic speech, background room recording, or invented celebration cue.

Original generation receipts for this mockup are preserved in the active registered render run under `deliverables/art-proof/`. Art approval status and delivery facts are in `../media/render-status.json`.

## Gameplay fidelity

The staged round starts at 0.8s. Candidate detection stops it at 19.6s: the source's elapsed-time rounding gives 19 seconds, and the final active countdown is 01:42. The pending state shows a dash, reveals VOLCANO, stays silent, and keeps 3 wins / 1 streak. Only the 23.3s Confirm catch click changes the score to 4 / 2 and plays the catch cue.

The verbatim invalid-hint reason is `Forbidden clue: lava`. That message disqualifies the hint from Streamer's pick; it is not a foul against the whole round. The film's staging labels and page transcript must remain visible in the delivered experience.

## Reproduce locally

Use HyperFrames **0.8.198**, GSAP **3.15.0**, Node 22.12 or later, a compatible cached headless Chromium, FFmpeg with libx264/libsvtav1/libaom-av1/libopus, and FFprobe. The current toolchain was installed locally with package scripts disabled. No global install, upload, telemetry, key or publishing step is required.

Create an active registered `agent-out` allocation before rendering. Set the following paths to that run and the local pinned toolchain. Keep temporary files and caches inside the active run, not inside a completed proof run or the repository.

```sh
export BAIT_SOURCE=/home/maff/foss/worktrees/twigame/bait-v2-mockup/concepts/bait-v2/film
export BAIT_RENDER_RUN=/absolute/path/to/active/registered/run
export HF_TOOLCHAIN=/absolute/path/to/local/toolchain
export HYPERFRAMES_BROWSER_PATH=/absolute/path/to/chrome-headless-shell
export HYPERFRAMES_NO_TELEMETRY=1
export HYPERFRAMES_NO_UPDATE_CHECK=1
export HYPERFRAMES_NO_ORPHAN_CLEANUP=1
export HYPERFRAMES_SKIP_SKILLS=1
export HYPERFRAMES_EXTRACT_CACHE_DIR="$BAIT_RENDER_RUN/scratch/cache/extract"
export HYPERFRAMES_FONT_CACHE_DIR="$BAIT_RENDER_RUN/scratch/cache/fonts"
export HYPERFRAMES_HISTORY_ROOT="$BAIT_RENDER_RUN/scratch/cache/history"
export TMPDIR="$BAIT_RENDER_RUN/scratch/tmp"
export NODE_COMPILE_CACHE="$BAIT_RENDER_RUN/scratch/cache/node"
export XDG_CACHE_HOME="$BAIT_RENDER_RUN/scratch/cache"
rtk proxy mkdir -p "$TMPDIR" "$BAIT_RENDER_RUN/deliverables" "$BAIT_RENDER_RUN/scratch/raw-logs"
rtk proxy node "$BAIT_SOURCE/prepare.mjs" "$BAIT_RENDER_RUN"
rtk proxy timeout 120 node "$BAIT_SOURCE/export-audio.mjs" "$BAIT_RENDER_RUN"
rtk proxy timeout 600 node "$HF_TOOLCHAIN/node_modules/hyperframes/bin/hyperframes.mjs" check "$BAIT_RENDER_RUN/scratch/desktop" --json
rtk proxy timeout 600 node "$HF_TOOLCHAIN/node_modules/hyperframes/bin/hyperframes.mjs" check "$BAIT_RENDER_RUN/scratch/phone" --json
rtk proxy timeout 1200 node "$HF_TOOLCHAIN/node_modules/hyperframes/bin/hyperframes.mjs" render "$BAIT_RENDER_RUN/scratch/desktop" --format mp4 --fps 30 --quality looks --low-memory-mode --output "$BAIT_RENDER_RUN/deliverables/master-desktop.mp4"
rtk proxy timeout 1200 node "$HF_TOOLCHAIN/node_modules/hyperframes/bin/hyperframes.mjs" render "$BAIT_RENDER_RUN/scratch/phone" --format mp4 --fps 30 --quality looks --low-memory-mode --output "$BAIT_RENDER_RUN/deliverables/master-phone.mp4"
```

For a timing review, use 15fps and `--quality draft`, with distinct draft output paths. The media status receipt must identify drafts. All long-running producers need their own deadline. Do not delete another run's assets or caches to make room; request a larger allocation instead.

Posters come from 2.8s. Seven chapter frames come from 2.5, 5.8, 10.4, 16.5, 19.7, 22.3 and 30.3s. Chapter starts are 0, 4.2, 7.4, 13.4, 17.6, 20.4 and 28.4s. `../media/captions.vtt` and `transcript.json` provide the accessible text.

The delivered videos are 32 seconds at 30 fps (960 video frames): 1280×720 for desktop and 720×800 for phone. MP4 uses H.264 High with yuv420p and AAC-LC; WebM uses AV1 Main, 8-bit, with Opus. The AV1 codec parameters are `av01.0.05M.08,opus` for desktop and `av01.0.04M.08,opus` for phone. WebM container duration is 32.008 seconds because of audio packet padding. Exact byte counts, SHA-256 hashes and full-decode results are in `../media/render-status.json`.

The player stays muted initially. Sound is an explicit, nonpersistent choice. No live service, microphone or OBS connection is made by this film.

## Art review corrections

Opus accepted all three generated sheets with fixes, without regeneration. Actual source alpha measurements corrected the review's by-eye transparency assumption: both sprite sheets are RGBA with fully transparent regions, plus a low-alpha glow. The composition removes that glow with an alpha-only SVG filter, crops above the hoodie bands, aligns each pose and mirrors the hammer-down frame. The original source PNG hashes remain unchanged. The facepalm hand was inspected at 400% in the composed frame.

The island remains a completed hut under repair, as accepted in the art review. The eruption is built from three original SVG jet poses, flat orange glow steps, deterministic lava arcs and a slope tongue. Short camera moves replace the long drift. The original BAIT logo appears unchanged on the bookends; generated bomb emotes stay in chat. Chapter stills now use settled frames at 16.5s and 30.3s.

Source font license texts and GSAP's original copyright/terms notice are retained in `art/licenses/`. The soundtrack continues to use the existing project's Sound Lab implementation and its attribution.

The mockup review moves the catch still to 22.3s so reduced-motion visitors see Confirm catch and Not said before scoring. Both face-down card labels use lilac, reserving yellow for the secret. The phone pick list now covers only the panel/chat area and leaves the game, facecam and pick award visible.
