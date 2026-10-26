# BAIT

### ⏳ Not submitted yet

Nothing has been sent to Devpost.

Local working draft, 25 October 2026. This file is prepared for owner review. It has not been entered into a Devpost form. Account registration and exact custom field IDs could not be read because the connector needs reauthentication. The public event pages were checked separately; see the source links below.

Use the [requirements checklist](docs/hackathon-requirements.md) for eligibility, team setup and the conflicting published dates.

## One-line Summary

Chat gets a secret word and tries to make the streamer say it. BAIT turns the slip into a shared win.

## Problem

Chat can react to a stream, but joining a game often means interrupting it. BAIT gives viewers a shared objective that works through ordinary conversation while the streamer keeps playing or talking.

## Solution

Viewers open a companion page to see the secret word. They drop hints in Twitch chat while the streamer tries to avoid the trap. The studio and OBS overlay keep the word hidden. When the microphone recognizes the whole word, the server ends the round and reveals a win for chat. If the timer runs out, the streamer escapes.

The target might be banana. A viewer asks about smoothie ingredients. The streamer answers naturally, then realizes why everyone was asking about fruit. That example illustrates the intended play; the final video must show a real Twitch exchange.

## Why This Matters

The audience has a common objective, and the streamer can keep their usual content going. Everyone can understand the reveal. Viewers need no BAIT account or installed Extension. The streamer can pause the game or reverse an incorrect detection.

## How We Used AI

The implemented speech adapter forwards consented microphone audio to Deepgram for streaming speech recognition. Only eligible final results can trigger a win. No language model invents winners or decides which chatter caused a response. After a win, the streamer can manually choose a clean hint for a separate award.

Physical microphone recognition through the real provider remains an acceptance gate. Local simulated transcripts and provider fixtures must not be presented as successful live recognition.

## How We Used Codex

The supplied package records Codex work on the game engine, Twitch OAuth/EventSub connection, speech bridge, role-specific views, interface and fixture tests. Its original session evidence is retained in `docs/codex-session.json`.

The October 25 improvement pass uses Codex to audit the archive, reproduce defects, implement local fixes, improve the preview and prepare this packet. Final check results are recorded in `docs/validation.md`, rather than inferred from an implementation request. The original main-build candidate and the later improvement chat are listed separately in [build provenance](docs/build-provenance.md).

## Key Features

- A studio for round controls, microphone consent, difficulty, timing and score correction.
- A mobile viewer page with the active word, clock and shared result.
- A transparent OBS browser-source page with no active target in its server response.
- Chat participation and distinct-user skip voting.
- Optional forbidden clues, three-word missions on one clock, and one private typed guess per word. A missed guess gives chat 15 seconds.
- A streamer-selected clean-hint award, with reassignment and reversal.
- A clearly labeled local demonstration using simulated chat and speech.

These features exist in source and have fixture/local evidence as recorded. Real Twitch, physical microphone, actual OBS capture and hosted judge access require separate proof. Six-word showdown, risk/reward mission bonuses and guest microphone relay are future proposals, not current capabilities.

## Architecture

React renders three role-specific views. One persistent Node/TypeScript process owns words, deadlines, scores and transitions, then broadcasts server-sent events. Twitch OAuth authorizes the broadcaster's own chat feed. EventSub supplies messages. An AudioWorklet captures consented PCM and a server-side WebSocket bridge sends it to the speech provider. Encrypted OAuth tokens and bounded game records use one persistent data directory.

Built with: TypeScript, React, Node.js, Express, Vite, Twitch API, Twitch EventSub, WebSockets, Server-Sent Events, Web Audio API, Deepgram, OpenAI Codex.

## Testing Instructions

Use [the judge walkthrough](docs/judge-walkthrough.md). It distinguishes a two-minute local simulated test from real Twitch acceptance. The repository needs all source, assets and run instructions. The operator must supply hosted access and provider usage free to judges; judges should not need to purchase a transcription plan or handle secrets.

## Public Demo Link

`TODO_LIVE_HTTPS_URL`; not created or verified.

Twitch demonstration channel: `TODO_TWITCH_CHANNEL_URL`.

Judge access instructions and scheduled operator availability: `TODO_JUDGE_ACCESS_AND_AVAILABILITY`.

## Public Repository Link

[Komediruzecki/bait](https://github.com/Komediruzecki/bait), a private GitHub repository created with the owner's authorization. `origin` is configured, and the working branch is `feat/bait-preview`. Record the final reviewed revision in the entry. Judge access is still pending: the official private-repository option requires sharing with `testing@devpost.com`; no collaborator invitation has been sent by preparing this packet. Confirm source and logo rights before granting external access.

The imported source is preserved on `main` and tag `paolo-original-2026-10-24`. Use the [feat/bait-preview candidate branch](https://github.com/Komediruzecki/bait/tree/feat/bait-preview) for the improved build and identify its final reviewed revision in the entry so judges do not unknowingly test the original baseline. Private repository access is required for either link.

## Demo Video

`TODO_YOUTUBE_URL`; no final video exists.

Target length: 2:45, including actual Twitch play and actual Codex build footage. See [the shotlist](docs/demo-script.md). The FAQ allows unlisted YouTube videos; private videos are unsuitable. Check playback in a signed-out browser. Do not show simulated inputs as real speech/Twitch proof.

## Screenshot Shot List

1. A connected studio before play, with the active target absent.
2. A narrow viewer card showing the word and rules; label this role clearly.
3. A real Twitch hint and the matching live spoken-word result.
4. The OBS reveal over the stream and a streamer-selected award.
5. A relevant Codex implementation/test result, cropped to remove private material.

Screenshots from the source ZIP are historical local demonstrations. New preview captures are local evidence unless a live setup is explicitly recorded. Do not label either as a published service.

## Submission Readiness Notes

- Deadline: **2 November 2026, 23:00 Europe/Zagreb** (14:00 PST / 22:00 UTC). Target an internal review on 1 November.
- Both team members must confirm eligibility and source/asset rights. One representative invites the other through Manage Team; the invite must be accepted.
- The event permits multiple substantially different projects. This draft covers BAIT only.
- Formal rules and the schedule disagree on judging dates. Keep the submitted version and free judge access available through the later formal endpoint, **16 November 2026, 02:00 Zagreb**. Ask the organizer if clarification is needed.
- Keep English materials, runnable source, verified links, actual Twitch/Codex footage and the main build session ID ready. After the owner authorizes final entry, click Submit and verify the event shows Submitted; saving a draft is insufficient.
- The owner separately authorized creation of the private repository and checkpoint pushes. No terms acknowledgment, registration, judge invitation, deployment or final entry has been performed by preparing this file.

Sources checked 25 October: [official rules](https://twitchcon-codex.devpost.com/rules), [requirements](https://twitchcon-codex.devpost.com/), [FAQ](https://twitchcon-codex.devpost.com/resources), [schedule](https://twitchcon-codex.devpost.com/details/dates). The FAQ's 21:00 UTC deadline conversion conflicts with the stated Pacific deadline; 22:00 UTC is the correct conversion on 2 November.

## Known Limitations

- The viewer URL exposes the word by design. Secrecy relies on the streamer not opening it and chat avoiding spoilers.
- Speech recognition depends on the microphone, accent, noise, provider latency and literal English target matching. Live accuracy and latency are not yet measured.
- The app requires one persistent process and disk. It is not a static site or a released Twitch Extension.
- Local browser screenshots of the overlay do not prove an actual OBS recording.
- Current test status and remaining defects belong in [validation](docs/validation.md); only verified results should be copied into the final description.

## TODO Official Form Fields

The exact authenticated form and field IDs remain unverified. Do not invent form-specific answers or mark these completed:

- Project title: BAIT, owner approval pending.
- Tagline: the one-line summary above, owner approval pending.
- Main Codex session candidate: `01a16ee8-4685-73a1-8477-a738186e6ffc`; owners confirm against the original build session.
- Additional implementation provenance: `01a16ffb-42f5-7b02-b9bf-6e7e3e2dc1e7`, current local improvement chat.
- Team representative and accepted teammate: `TODO_REPRESENTATIVE`, `TODO_TEAMMATE_ACCEPTED`.
- Repository: verify the final pushed revision and judge access at the private URL above. YouTube, live demo and judge access instructions: replace the labeled placeholders after verification.
- Any further required questions: inspect the real form before final entry.
