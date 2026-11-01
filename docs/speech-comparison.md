# Whisper microphone comparison

Moonshine remains the live game recognizer. Whisper is an experimental comparison at `/speech-lab`, available when that host was built with the prepared model assets. It cannot submit a guess, catch a word, or change a round.

## Try a phrase

1. Pause the game and turn off Studio's microphone. Keep the comparison tab visible.
2. Open `/speech-lab`, select **Whisper Tiny**, and load it. About 59 MB of model and runtime files are served from the same host. Model reads bypass the browser cache; runtime module imports may use it.
3. Choose English or Croatian, then select **Test microphone (5 seconds)**. Approve microphone access if prompted.
4. Say one short phrase. Recording stops after five seconds; **Finish sample** stops it earlier. The microphone closes before transcription starts.
5. Compare the returned text with what you said. Test once with OBS idle and once while OBS records. Note the OBS state in the run label.

**Cancel sample** or **Stop and unload** releases the microphone and terminates the model worker. Switching models also unloads the previous model in this tab. Close other speech-test tabs yourself; this is not a cross-tab exclusivity guarantee.

A local WAV can be replayed through both models to compare the same audio. The file limit is 25 MB, with up to one minute for Whisper or five minutes for Moonshine. Only one inference runs at a time.

Audio stays in browser memory. No recording is saved or uploaded. The last eight text-and-timing reports remain in the tab; **Download comparison JSON** exports them only when clicked. Raw word timestamps are diagnostic output, not validated scoring timestamps. They may extend beyond the input or be zero-duration. No confidence probability is invented.

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

Without `BAITED_SPEECH_ASSET_DIR`, the build ships an unavailable marker and no Whisper model. An enabled build also copies the complete model/runtime license notices to `/licenses/speech-bench/`, linked from Speech bench. Deployment must point Wrangler's asset directory at the resulting build, using the established pilot deployment procedure. Never upload the model inside the Twitch Extension ZIP.

The Whisper worker's fetch adapter accepts only pinned, same-origin asset reads and verifies their hashes. Runtime JavaScript modules load through same-origin imports; their hashes are checked at build time, not by that fetch adapter. The worker's production CSP restricts connections to the same origin. The comparison makes no game API calls and creates no game session. The Twitch Extension ZIP is unaffected by these hosted Studio and diagnostic changes.
