# Local speech preview

The default speech provider is now `moonshine`. It runs in a dedicated browser
worker in the standalone BAIT studio. It is not loaded into the viewer panel or
OBS overlay. The streamer explicitly loads the model and grants microphone
access. Audio stays on that computer; finalized text, SDK word metadata,
and word timing go to the authenticated game server. BAIT does not persist them.

This is a local preview, not a claim that recognition has passed real-stream
acceptance. **The published Moonshine runtime's word confidence is a constant
placeholder of `1.0`, not a model probability.** The existing Deepgram `0.8`
threshold therefore provides no confidence filtering for Moonshine. Do not
describe these values as calibrated confidence or use them to claim scoring
accuracy. **Moonshine catches require the broadcaster's confirmation.** A local
file benchmark measures inference and replay timing; it does not replace a real
microphone round with headphones, speaker feedback and the intended OBS scene.

## Runtime and model

- Package: `@moonshine-ai/moonshine-wasm@0.1.5` (locked in pnpm).
- English `TinyStreaming`, explicit model selection, no speaker identification,
  no key terms, no target word or game context passed to the model.
- This published runtime's catalog selects
  `https://download.moonshine.ai/model/tiny-streaming-en/quantized_26_07_30`.
  Do not substitute the newer weights mentioned in the repository's main-branch
  documentation without testing a matching runtime.
- Model download: **83,956,787 bytes**, including the matching
  `decoder_kv_with_attention.ort` needed for real word timing. Runtime files add
  about 13 MB unpacked. Model files are cached by the SDK in the browser's
  `moonshine-models-v1` Cache Storage bucket. They are not committed to Git.
- The published SDK's three-argument catalog helper omits the attention file.
  BAIT explicitly adds it from the same revision directory, then uses the SDK's
  in-memory file-map loader with `word_timestamps=true`.
- Runtime JavaScript and WASM are served from the installed package at
  `/moonshine/runtime/`. Model downloads go directly to `download.moonshine.ai`.
  No speech content is sent there.
- SIMD + WASM threads require a secure, cross-origin isolated context. The
  server sets COOP `same-origin`, COEP `require-corp`; production CSP permits
  `wasm-unsafe-eval`, same-origin workers and the model-download host only.
  This belongs in the standalone broadcaster page, not a Twitch Extension iframe.

SDK and selected English model license: MIT. The full upstream notice is in
`licenses/moonshine/LICENSE`. Source:
<https://github.com/moonshine-ai/moonshine/tree/main/language-bindings/wasm>.

The npm package records source revision
`234f60faa0eb388b01cdf7e60aca232af37aefda`. At that revision,
[`core/word-alignment.cpp:368`](https://github.com/moonshine-ai/moonshine/blob/234f60faa0eb388b01cdf7e60aca232af37aefda/core/word-alignment.cpp#L368)
sets every aligned word's confidence to `1.0f`. The attention decoder does provide
DTW-derived timing in `core/transcriber.cpp`; this is separate from confidence.

## Capture and scoring

The existing audio worklet sends 16 kHz PCM only to the local worker. Each round
or resumed segment creates a new stream; paused/reset/disconnected audio is
discarded. The buzzer flushes the last partial microphone packet before finalizing
the model; ordinary pause/reset still discard it. Inference backlog greater than two seconds stops capture and asks
the broadcaster to reconnect. Model-loading cancellation cannot open a late
microphone permission request.

The websocket accepts no binary audio in Moonshine mode. It requires the studio
cookie, CSRF token, same origin, current round ID/epoch and the same live
microphone lease that armed the capture. Final-line sequence numbers and a
bounded, paced sample clock reject stale or malformed submissions. Only complete
lines with timed words can be evaluated. Empty VAD completions are dropped by the
client before assigning a wire sequence. Strict word match, pre-buzzer word end
and the 1.5-second settlement window remain. The shared confidence cutoff cannot
reject Moonshine mistakes because its SDK supplies placeholder scores.

A matching Moonshine final stops the round in **Check this catch**. Only then is
the target revealed in the studio and overlay. No score, participation history
or hint award is recorded while the catch is pending. Auto-start and the mission
clock wait for the broadcaster. **Confirm catch** records one win and opens any unexpired hint
awards; **Not said** rejects it and requires a new target, since the old word has
been revealed. Decisions require the owning studio session, CSRF token and current
round ID; repeat/stale decisions cannot score again. Restarting the server abandons
an unconfirmed catch without awarding it. Deepgram retains its automatic scoring
and existing reverse-win control.
A complete line must end on the current capture clock and arrive fresh. An early
target in that fresh line can count even if the sentence lasted more than five
seconds; individual target capture still must belong to the active epoch and end
before the buzzer. A long line finalized after the settlement window cannot count.

A browser transcript is not proof of what was spoken. The broadcaster owns this
casual game and can inspect or modify their client. These checks prevent replay
and cross-session scoring, not cheating by that broadcaster. The hidden target
never goes to the studio while a round is active, or to the model at any time,
including as a keyword hint.

## Speech bench

Open `/speech-lab` on the same local game server. This page is separate from game
scoring and never uploads audio or transcript text.

1. Choose **Load Moonshine** and wait for the download/compile to finish.
2. Select a local WAV (mono 16 kHz preferred; the browser decodes/downmixes other
   supported audio). Limit: five minutes and 25 MB.
3. Label the run `baseline`, leave OBS idle, then choose **Run benchmark**.
4. Repeat the same file with the intended OBS recording scene and a new label.
5. Download the JSON reports. They record model revision, actual final words and
   SDK word confidence fields (placeholders in this version), model load time,
   cumulative worker audio-packet processing time,
   p95 packet-processing duration, replay scheduling delay and final-line lag
   from the last word's estimated end. Packet-processing includes the SDK calls
   that skip inference below its update interval; it is not isolated model timing.

Synthetic speech is useful for a repeatable load smoke test. Record both
teammates separately for accuracy acceptance. Include target utterances,
near-misses, ordinary conversation, silence, laughter and BAIT effects. Compare
with OBS's rendering/encoding skips and a recording without speech inference.
The bench is deliberately silent; audio is processed, not played through speakers.

## Deepgram fallback

Set `SPEECH_PROVIDER=deepgram` explicitly and inject `DEEPGRAM_API_KEY` from a
Proton Pass reference template. There is no automatic cloud fallback or silent
audio upload. Restart the server after changing provider. The consent screen
names the selected provider. `preview:local` always selects Moonshine and clears
live service credentials.
