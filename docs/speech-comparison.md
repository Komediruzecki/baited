# Speech Lab: one clip, both models

Moonshine remains the live game recognizer. Whisper is an experimental comparison at `/speech-lab`, available when that host was built with the prepared model assets. It cannot submit a guess, catch a word, or change a round.

## Try a phrase

1. Pause the game and turn off Studio's microphone. Keep the comparison tab visible.
2. Open `/speech-lab`, choose a 5, 10 or 15 second recording, then select **Record a phrase**. Approve microphone access if prompted. No model download comes before that permission request.
3. Say one short phrase. Recording stops at the selected limit; **Finish recording** stops it earlier. The microphone closes before either model loads. Listen back to the retained clip.
4. Choose English and **Both models**, then **Compare both models**. Moonshine replays the clip at its original speed, unloads, and Whisper transcribes the same samples. Loading starts automatically. For Croatian, choose **Whisper only**; Moonshine's model is English-only.
5. Check the transcripts against what you said. **Run Moonshine again** or **Run Whisper again** retries the same clip with that model. Test once with OBS idle and once while OBS records, noting the state in the run label.

**Cancel recording** releases the microphone. **Stop comparison** terminates the current model worker. Both actions leave the previous clip and any completed reports available for retry. Hiding or leaving the tab also stops active work; late callbacks cannot add a result. Close other speech-test tabs yourself; this is not a cross-tab exclusivity guarantee.

A local uncompressed WAV follows the same comparison flow. The file limit is 25 MB, checked before reading or decoding, with up to one minute for Whisper or five minutes for Moonshine. Format and duration are checked before the browser decoder runs. Only one model worker is resident at a time in this lab tab.

Audio stays in browser memory. No recording is saved or uploaded. The last eight text-and-timing reports remain until a new clip replaces the current one, **Discard clip** is selected, or the page closes. **Download comparison JSON** exports reports only when clicked. Model load time is separate from recognition: Moonshine's final phrase lag and Whisper's whole-clip processing measure different things, and neither is end-to-end game latency. Missing timing samples appear as unmeasured, not zero. Raw word timestamps are diagnostic output, not validated scoring timestamps. They may extend beyond the input or be zero-duration. No confidence probability is invented.

## Why this does not score games yet

On November 1, 2026, one five-second clip took the following time to transcribe using the pinned q8 model and one WASM thread:

| Browser | First inference | Warm inference |
| --- | ---: | ---: |
| Chromium 151 | 1.971 s | 1.750 s |
| Firefox 153 | 18.679 s | 16.840 s |

This is one local machine, with no OBS load, not a general accuracy or performance benchmark. Both browsers produced an inaccurate command transcript on that clip. The game accepts fresh speech within five seconds and has a 1.5-second settle window at the buzzer. These measurements do not justify enabling Whisper as a drop-in replacement.

Before live scoring, measure latency under OBS load, validate timing and command handling on recorded examples, bound the inference queue, test noise and silence, and explicitly handle the model's missing confidence scores. Do not relabel delayed output as newly spoken speech or loosen the live game's timing checks to make a benchmark pass. Browser speech recognition is not enabled as an automatic fallback because some implementations transmit audio to their provider.

## Build and delivery

The model is `Xenova/whisper-tiny`, revision `5332fcc35e32a33b86612b9a57a89be7906102b1`, with Transformers 4.3.1 and the ONNX runtime pinned in `packages/app/scripts/speech-bench/asset-lock.json`. No inference service, R2 bucket, or paid model API is required for this comparison.

The pilot asset builder uses an explicit opt-in:

```sh
BAITED_SPEECH_ASSET_DIR=/absolute/registered/prepared-assets \
BAITED_PILOT_ASSETS_OUT=/absolute/registered/pilot-assets \
pnpm --dir packages/edge-game build:pilot-assets
```

Use an existing prepared directory under registered agent output. The builder does not download a model or read credentials. It validates each source against the checked-in lock. Files above Cloudflare's 25 MiB per-asset limit are split into transport chunks; the browser validates each chunk and the complete reconstructed file. The original assets are not modified.

Without `BAITED_SPEECH_ASSET_DIR`, the build ships an unavailable marker and no Whisper model. An enabled build also copies the complete model/runtime license notices to `/licenses/speech-bench/`, linked from Speech Lab. Deployment must point Wrangler's asset directory at the resulting build, using the established pilot deployment procedure. Never upload the model inside the Twitch Extension ZIP.

The Whisper worker's fetch adapter accepts only pinned, same-origin asset reads and verifies their hashes. Runtime JavaScript modules load through same-origin imports; their hashes are checked at build time, not by that fetch adapter. The worker's production CSP restricts connections to the same origin. The comparison makes no game API calls and creates no game session. The Twitch Extension ZIP is unaffected by these hosted Studio and diagnostic changes.
