# Microphone reliability and a floating Studio

Prepared on 30 October 2026. This document describes the prepared, locally verified source changes; it does not record a live deployment or Windows hardware acceptance.

## Two microphones can serve different jobs

The streaming microphone sends the stream's audio through OBS or the console. Baited's standalone Studio microphone feeds Moonshine in the PC browser. Studio must receive the streamer's voice, but it does not need to be the same physical device. Starting a PS5 stream does not keep the PC awake or grant its browser microphone access.

The browser cannot record while its PC is asleep. Revoked permission, an unplugged device, an interrupted audio context or an expired Studio session also requires recovery. Baited must distinguish those conditions from a brief renewal request failure.

## Verified problems in the current implementation

1. The first failed microphone lease renewal stops capture immediately, even if the server lease has time left.
2. Track mute and audio-context interruption are not observed. A stream object can remain present while no usable audio is arriving, leaving the UI marked ready until the server detects the gap.
3. Studio waits for Moonshine loading before creating and resuming Web Audio. That can lose the browser's initial click authorization.
4. Incoming speech errors lose their server reason and display a generic rejection. A global error can also be outside the current viewport.
5. A deterministic Room test reproduced continuous valid audio pausing after roughly 30 seconds without the separate browser heartbeat. Background timer throttling can therefore stop an otherwise healthy capture.

These reproductions establish application defects. They do not prove which one caused lakeeko's particular Firefox/Windows interruption.

## Repair rules

- Persist the cancellation revision. An initial enable issued before that cancellation cannot recreate its lease if its request arrives late. This is a request-ordering fence, not a permanent ban on a capture identifier.
- Keep one capture owner. Ignore stale permission grants, worker responses, renewal results and socket callbacks after cancellation or replacement.
- Resume Web Audio in the explicit enable action. Observe device and context health; stop stale audio processing when capture is interrupted.
- Bound enable, disable and renewal checks to 10 seconds, including queued connection setup. Abandoning a request prevents late dispatch; a late successful enable is compensated with a bounded disable for that exact old lease. Use single-flight lease renewal with a real request abort. Retry temporary network/provider failures only within the permitted recovery window. Authentication, ownership and expired leases fail closed.
- Let validated, current-owner audio refresh an existing, unexpired lease at a bounded persistence cadence. The session, socket, lease, round, epoch and sample clock must all match. Invalid, late or superseded audio cannot renew or create a lease.
- Preserve the audio-gap pause and server authority. A sleeping PC cannot accumulate a valid round win while no audio is being checked.
- Keep the cause and next action inside the Microphone card. A browser device error may indicate contention; it cannot identify which other application owns a device.
- Require a user action after device loss, system interruption, permission loss or session expiry. Recovering network connectivity must not silently restart recording or resume a paused round.
- A healthy background Studio remains usable. Do not copy a policy that disables capture merely because the tab is hidden.

MercuryPitch was inspected read-only. Its acquisition serialization, cancellation generations, typed error handling and audio-context lifecycle are useful references. Its reference packages declare AGPL-3.0-or-later, so this repair independently implements the relevant ideas rather than transplanting their source. Its hidden-tab release policy does not fit Baited's active background listening.

## Local verification

The continuous-audio regression reproduced a pause at 30,080 ms before the repair. The Room suite then passed 40 integration cases; eight focused cases, including a further concurrency regression, passed after independent review. They cover exact ownership, expired and stale leases, malformed frames, receipt-time expiry, durable recovery, SQL/alarm rollback and preservation of newer admission counters while renewal awaits. Seven further focused cases passed for cancellation ordering, durable recovery/rollback, replacement ownership and safe error codes. Valid audio refreshes at most once per 10 seconds. Audio loss still pauses after 2.5 seconds.

The combined browser-controller tests passed 77 cases covering permission/model cancellation, track/context/worklet interruption, bounded enable/disable/renewal, cancellation during connection setup, retry limits, safe error metadata and persistent feedback. App and edge typechecks passed during implementation. The pilot frontend built successfully. Headless Chromium exercised the actual emitted Studio at 390, 820 and 1440 pixels: a simulated unavailable device produced an in-card alert, the styled retry control reopened consent, and no horizontal overflow or page errors appeared. These are local fixture results, not a claim that lakeeko's Windows hardware was exercised.

The requested irch Opus review did not start because its runner account mapping was unavailable. Independent source reviews found and repaired the unbounded request and attachment-merge gaps. CI on the latest PR head remains the complete repository gate.

## Firefox/Windows acceptance sequence

1. Open the pilot Studio, allow the intended input device and enable the microphone. Check its level and an opt-in transcript phrase.
2. Start a test round. Leave Studio behind the game or another tab for several minutes. Return and verify the round and transcript still receive speech.
3. Disconnect the input device, then reconnect it. The Microphone card must explain the interruption, the round must pause, and recording must stay off until explicitly re-enabled.
4. Temporarily block the microphone permission. The error must name permission and explain how to retry; it must not blame another application.
5. Test a short network interruption separately from PC sleep. Preserve valid ownership during a bounded temporary renewal failure; after a lost/expired capture, reconnect explicitly and resume the round.
6. Test two Studio tabs. The second tab must not silently claim or revive the first tab's microphone lease.

Browser fakes and local Cloudflare-runtime tests do not replace these real-device checks. Keep Studio and its transcript out of a public display capture if they contain private operator information.

## Proposed floating Mini Studio

A compact operator view could show the round timer, microphone state and last interruption, pause/resume, catch reject/confirm, and a short command reference. It must never show the active secret card or create a second microphone capture.

Use `documentPictureInPicture` only after feature detection and a user click. Render from the existing Studio state/capture owner; closing the floating view returns controls to the original page and does not change consent. Normal video Picture-in-Picture cannot provide arbitrary interactive Studio controls.

For unsupported browser versions, use a compact normal browser window. On Windows, PowerToys Always On Top can pin it with **Win + Ctrl + T**. The website cannot force a normal window to remain above other applications. This is a proposed follow-up, not an implemented control in this repair.

Sources checked 30 October 2026: [Document Picture-in-Picture](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API), [current browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/DocumentPictureInPicture.json), [Firefox video Picture-in-Picture](https://support.mozilla.org/en-US/kb/about-picture-picture-firefox), [PowerToys Always On Top](https://learn.microsoft.com/en-us/windows/powertoys/always-on-top).
