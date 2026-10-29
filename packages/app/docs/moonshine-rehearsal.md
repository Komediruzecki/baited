# Moonshine, cards and sound rehearsal

October 25, 2026. Local worktree: `feat/bait-preview` in the private `Komediruzecki/bait` repository. No deployment was made in this pass.

## What changed

Moonshine Tiny Streaming English is the default. The model runs in a worker in the broadcaster’s standalone browser studio. It downloads 83,956,787 bytes of model files on first use, then uses the browser cache. It requires no speech-provider key. Final transcript text reaches BAIT for matching; raw microphone audio stays in the browser.

A candidate catch stops the round before revealing the target. **Confirm catch** awards the win; **Not said** rejects it and ends the exposed word. Auto play and mission time wait for this decision. The viewer and overlay say **Check this catch** until confirmation. Deepgram remains an optional automatic-scoring adapter.

The six approved illustrations have twelve additions, all generated with the same image model. Original files are unchanged. `/card-proofs` shows the eighteen cards with a staged reveal. The same artwork appears on the viewer’s active target when one of these words is dealt. Artwork does not expose an active target to the studio.

Six Sound Lab cues are adapted from Keys: deal, countdown, catch (Supernova), escape (Confetti), correction and a Blackhole alternative for audition. Sound requires an explicit enable each visit. The studio is the automatic output; the OBS overlay is silent. Pending catches are silent, confirmed catches sound once, and new rounds cancel any remaining boom. Browser locks prevent duplicate outputs within one browser profile, not across different browsers or OBS processes.

## Measured speech workload

One real-time replay per condition, using the same 53.227-second mono 16 kHz WAV. The twelve utterances were generated with eSpeak NG (`en-us`, speed 155): six target sentences and six negatives. This is a repeatable synthetic workload, not a measure of human-voice accuracy.

| Measurement | OBS idle | OBS recording |
| --- | ---: | ---: |
| Replay elapsed | 53.235 s | 53.234 s |
| p95 audio-packet processing | 65.10 ms | 61.07 ms |
| p95 final-line lag from last recognized word | 813 ms | 720 ms |
| Target words found | 4 / 6 | 4 / 6 |
| Negatives containing a false target candidate | 1 / 6 | 1 / 6 |

Packet processing includes `addAudio`, `transcribe` calls and final flush. Some calls are throttled by the SDK; this is not an isolated model-inference measurement. Final-line lag excludes the wait from a target spoken early in an unfinished sentence. A single short run cannot establish a performance improvement.

Both runs missed **banana** and **penguin**. Both found **microwave**, **dragon**, **volcano** and **monocle**. The negative sentence containing **dragonfly** was transcribed as **dragon fly**, which would falsely propose a catch if the target were dragon. This is why automatic scoring is not enabled for Moonshine.

The runtime emits `1.0` for every word’s confidence, including incorrect words. The published package source initializes it as a placeholder in `core/word-alignment.cpp`; it is not a probability. The raw benchmark JSON was produced before its explanatory metadata was corrected. Its numeric measurements are preserved unchanged; `evidence/moonshine-comparison.json` records the correction. [Upstream implementation at the package revision](https://github.com/moonshine-ai/moonshine/blob/234f60faa0eb388b01cdf7e60aca232af37aefda/core/word-alignment.cpp#L368).

## OBS scope

OBS 32.2.2 encoded a muted synthetic 1080p60 motion source with CPU x264, veryfast, 2500 kbps. It skipped 0.7% of encoding frames alone and 0.6% during the recording containing the Moonshine replay. The normal OBS profile was untouched. The installed OBS package lacks Browser Source, so this does not demonstrate the BAIT overlay in OBS or a real broadcast. See [the OBS probe](obs-load-probe.md) for exact timing, process measurements and evidence.

## Verification

- 134 automated tests passed, including session/CSRF/round-bound confirmation, duplicate decisions, stale audio, empty completed speech lines, final partial PCM flush, long final sentences, mission freezing sound deduplication and hint expiry during pending review.
- All six sound recipes rendered nonzero, finite stereo samples at 48 kHz with no clipping at the default 35% volume. Peak values ranged from 0.010 to 0.266. This is a rendering check, not a subjective listening or stream-mix acceptance test.
- Desktop and mobile card selection/reveal were verified in the browser. The real studio confirmation control was exercised using a labeled synthetic WebSocket transcript: review kept zero wins, then one click produced exactly one win. This was a protocol fixture, not a microphone claim.
- The synthetic speech replay used the actual installed WASM runtime and browser worker. `crossOriginIsolated` was true. No speech-provider credential was used.

Evidence is in the registered run `/run/media/maff/Game_Shared/agent-out-live/twigame/2026-10-25/bc3311e50e1a4f3cab679e1668ec8a36`, under `evidence/`. The saved comparison, synthetic-corpus transcript, raw benchmark JSON, OBS logs and sound-render report distinguish fixture checks from real input.

## Next real rehearsal

1. Open the local studio, enable the microphone and wear headphones. Speak naturally, with and without game sound, including targets near the buzzer and similar words such as dragonfly. Confirm and reject catches deliberately. A physical microphone has not passed acceptance yet.
2. Add Browser Source support to the local OBS installation, then use BAIT’s overlay URL from Stream setup. Capture studio browser audio once. Keep the viewer page off the broadcast.
3. Connect the intended Twitch broadcaster account using vault-injected credentials. Use a second viewer to check real chat and the shared viewer page. A localhost viewer link only works on this computer; remote play needs a separately approved hosted game.
4. Record a full round with the actual game, camera and audio scene. Check recognition, dropped frames, sound mix, reconnect behavior and capture privacy. No Twitch broadcast or deployment occurred in this pass.

The mechanical design scan found only two body-font warnings for Inter. It is retained to match the existing studio body type; card headlines and the BAIT mark use Russo One. The scan was not treated as a visual acceptance test.
