# Voice guesses and the second-model comparison

## What failed

The live screenshots include `I'm calling the bait.` followed by a separate `Banana.` final. The old parser opened a guessing window but only accepted a bare next word after `the bait is`. That made the actual guessed word fall through to ordinary catch detection. This is a command-state defect, independent of which model transcribes the audio.

The current Moonshine adapter emits completed lines only (`decode_incomplete_lines: false`). A race involving partial hypotheses has not been established. Moonshine 0.1.5's word confidence is a constant placeholder, so it is not an accuracy score.

## Play-test sequence

1. Turn on **Call the bait** and **Voice guesses**. Enable the microphone during an eligible live round.
2. Say **I'm calling the bait.** Wait for **Listening for your guess**.
3. Say the guessed word, for example **banana**. The draft should appear without triggering a catch.
4. Check the draft. Say **lock in**, or use the button. This uses the normal server-side guess and scoring rules.
5. Outside that command window, saying the secret word still counts normally. A wake phrase on its own does not protect arbitrary conversation.

Baity's chat connection is optional for dictation. Posting the draft publicly still requires the bot and announcements to be available. Optional Baity chaos is a separate game rule; disable it for the scoring regression test.

The command window lasts 15 seconds. `Uh`, `Um` and `Okay` do not become guesses or renew that window. A wake phrase alone asks for explicit calling intent; only then does Studio show **Listening for your guess**. Cancel is available during the waiting state as well as after a draft appears. A separate lock-in is still required.

## Local comparison results, 1 November 2026

The five-second sample was taken from the user-supplied recording `2026-10-31_22-10-34.mkv`, starting at 97 seconds. It contains the failed call followed by Banana. Both engines received the same decoded 16 kHz mono PCM within each browser. Browser decoders produced different PCM fingerprints across browsers, so this is not a bit-identical cross-browser benchmark.

| Browser on this Linux PC | Moonshine transcript | Whisper Tiny transcript | Whisper whole-file processing |
| --- | --- | --- | --- |
| Headless Chromium 151 | Ah, bait, but I'm calling the bait. Banana. | I'm going to beat the boat. | About 1.6 seconds |
| Headless Firefox 153 | Ah, bait, but I'm calling the bait. Banana. | I'm going to beat the boat. | About 15 seconds |

These are functional smoke measurements, not controlled performance or accuracy estimates. OBS load, CPU contention and OS cache state were not controlled; RAM was not measured. Moonshine replays in real time, so its five-second replay duration is not comparable to Whisper's file-processing time. The sample supports keeping Moonshine as the live default and fixing the parser independently. It does not establish either model's general accuracy.

Cancellation during load and transcription left no worker running and no late results. Strict worker CSP worked without adding JavaScript `unsafe-eval` to Whisper. Existing Moonshine policy was unchanged. Only same-origin static GET requests were used for Whisper; the audio file did not leave the browser. Chromium's routed test reported Vite HMR connection warnings; speech inference completed. Firefox completed without browser errors.

## Model choice

| Engine | Audio processing | Current role | Open measurement |
| --- | --- | --- | --- |
| Moonshine Tiny Streaming | Streamer's browser worker | Existing live English engine | Actual command recall and phrase boundaries under OBS load |
| Whisper Tiny multilingual, q8 WASM | Streamer's browser worker | Opt-in local-file comparison, not live scoring | English/Croatian quality, first load, latency, memory, CPU |
| Browser SpeechRecognition | Depends on browser; may use a vendor server | Separate future opt-in experiment | Availability and privacy; not a reliable Firefox fallback |
| Cloudflare Workers AI speech | Audio sent to hosted inference | Not enabled | Consent, audio-minute cost, latency and rate limits |

The Whisper q8 encoder and merged decoder total 40,852,675 bytes (about 39 MiB) before tokenizer/config/runtime. That is download size, not RAM usage. Load one engine at a time. Model files can be served as static assets while inference stays in the browser; serving assets on Cloudflare does not require Workers AI. No paid inference or audio uploads are enabled by this work.

MercuryPitch's short-command voice pipeline was inspected read only at revision `1103e05eea5667eb9a23b380bc027974ed6e74ed`. Useful ideas are native-rate capture, 16 kHz resampling, short utterances, a dedicated worker and generation-scoped cancellation. Its AGPL source was not copied. Its timeout and stale-finally weaknesses must not be imported: a timed-out model worker needs to be terminated, and old callbacks must not reset a newer run.

## Comparison protocol

Use the same consented audio files for Moonshine and Whisper, decoded to the same mono 16 kHz PCM. Start with English. Run with OBS idle, then with the real recording scene active. Keep the page visible. Record the engine/version, device/browser, cold/warm model load, total processing time, output text and command outcome. Do not compare packet-processing timings directly with whole-utterance inference timings.

Include correct calls, the observed `bake`/wake-word mishearings, separate finals, ordinary target-word speech, unrelated conversation, silence, cancellation, repeated finals and round changes. A machine-generated transcript is a search aid, not ground truth: listen and label the test clips manually. No default engine switch is justified until real Windows Firefox + OBS tests pass.

Croatian cards and Croatian speech are separate features. Whisper Tiny multilingual includes Croatian, but Croatian command grammar and live game detection still need their own implementation and recordings. A language selector in the bench is not proof of Croatian gameplay readiness.

## Run the local comparison

The page is `/speech-lab`. Moonshine remains available in built local previews. Whisper is a development-only option and accepts clips up to 60 seconds. English and Croatian are selectable for file transcription; this does not wire Croatian commands into live gameplay.

Assets are prepared explicitly outside the repository. The committed `scripts/speech-bench/asset-lock.json` pins each model/runtime file by URL, size and SHA-256. Preparation and development-server startup validate the lock. Browser model/WASM caches are disabled, and the local asset route uses `Cache-Control: no-store`. OS filesystem caching may still affect timings.

For this workstation, the existing prepared directory is:

```text
/run/media/maff/Game_Shared/agent-out-live/baited/2026-11-01/064744be67ec4ecbbb0717757063eedd/scratch/whisper-assets
```

To prepare a new directory, reserve a registered `agent-out` run first, then run `python3 packages/app/scripts/prepare-speech-bench.py --output /absolute/registered/run/scratch/whisper-assets --download`. Set `BAITED_SPEECH_ASSET_DIR` to it when starting the development server. The asset middleware deliberately accepts only prepared registered output directories. It is a developer bench, not a portable end-user installation flow.

1. Choose an engine and load it.
2. Choose a consented local audio file. Set the language and record the actual OBS/device state in the label.
3. Run the comparison and inspect/export the result.
4. Stop and unload. Switch engines and repeat on the same file.
5. Label recognition mistakes by listening to the original audio, then compare the command outcomes. Do not use one model's transcript as the ground truth for the other.

The optional runtime/model files are not copied into the production frontend or Twitch ZIP. The app build can emit a small worker entry script, but it cannot load Whisper through the production UI or missing development asset route.

## Primary references (checked 1 November 2026)

- [Whisper Tiny model card](https://huggingface.co/openai/whisper-tiny)
- [Quantized model files](https://huggingface.co/Xenova/whisper-tiny/tree/main/onnx)
- [Transformers.js local model and cache configuration](https://huggingface.co/docs/transformers.js/api/env)
- [ONNX Runtime Web threading and runtime configuration](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- [Browser SpeechRecognition availability and processing caveats](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

## Release boundary

These changes are prepared in a private task branch based on the latest Baity chaos work. They do not update the hosted pilot or the Twitch Extension ZIP by themselves. Parser and microphone changes belong to Studio; the native viewer Extension does not run speech recognition. Deploying only a new viewer ZIP cannot fix this Studio bug. Video draft v1 is preserved. Video v2 begins when the additional footage is supplied.
