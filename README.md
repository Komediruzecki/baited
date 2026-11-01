# Baited

**Make the streamer say it.**

Chat gets **banana**. Someone asks about smoothies. The streamer says it. Chat wins.

Baited turns ordinary Twitch conversation into a secret-word game. Viewers see the card, the streamer sees the clock, and chat tries to land the word without giving the game away. Studio, the native Twitch Extension and the OBS overlay share one authoritative round.

Built with Codex for the [Codex x TwitchCon Hackathon](https://twitchcon-codex.devpost.com/). Start with the local demo below, or use the [judge walkthrough](packages/app/docs/judge-walkthrough.md) for a short test of the game and its access requirements.

## Try a local round

Use **Node 24** and **pnpm 10.34.3**. From this repository's root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @baited/app build
pnpm preview:local
```

Open [http://127.0.0.1:3318](http://127.0.0.1:3318) and choose **Try the local demo**. No Twitch credentials, speech-provider account or vault access are needed. The compiled preview stops after three hours or **Ctrl+C** and uses a fixed port. Rebuild after source changes.

1. Start a round in Studio. Open the viewer-room link from **Stream setup** in a second tab to see the word.
2. Use **Demo controls** to send simulated chat and speech, or enable the microphone to try local Moonshine recognition.
3. Review the catch, check the shared result, and open the OBS preview from **Stream setup**.

The local demo uses test participants and simulated Twitch input. Real Twitch play requires channel authorization and a reachable backend. [Get Baited running](packages/app/docs/GETTING_STARTED.md) covers that setup.

## How a round works

The built-in deck has 100 illustrated English targets across three difficulties. Viewers get the word and any forbidden clues; the active target stays out of Studio and OBS. A detected catch stops the round before revealing the word. The streamer has 15 seconds to reject a mistaken catch, confirm it sooner, or let it confirm automatically. Confirmed catches can also be reversed.

Optional **Call the bait** gives the streamer one guess per word. With the default rules, a correct guess escapes; a wrong guess gives chat 15 extra seconds. With **Voice guesses** enabled, say **“I am calling the bait, banana, lock in.”** Leave off **“lock in”** to inspect the draft first. A draft lasts 15 seconds and may be announced in chat when Baity is connected and announcements are enabled. Recognition can miss a command; ordinary target speech still counts, including after the guess has been used.

Chat participation, skip votes, streaks, streamer-selected awards and optional three-word missions give the round its shared score. See the [game guide](packages/app/README.md) for the rules and supported surfaces.

## Speech stays local by default

**Moonshine is Studio's live recognizer.** Its English model runs in a browser worker and needs no speech API key. Raw microphone audio stays on the device; final transcript text and timing go to the game server for matching. Baited does not persist that transcript text.

[Speech Lab](https://pilot-baited.maff.app/speech-lab) records one local clip or accepts a WAV, then runs Moonshine and optional Whisper Tiny sequentially on the same audio. It supports replay, WAV download, separate model retries and comparison export. English works with both models; Croatian is a Whisper-only comparison. Model load time, Moonshine's final-phrase delay and Whisper's whole-clip processing time are distinct measurements.

Whisper is limited to Speech Lab. It does not replace Moonshine in Studio or act as a game fallback. Speech Lab sends no audio to a speech service and cannot submit game commands or scores. The legacy Deepgram adapter is a separate, explicit server configuration; it is not needed for the demo or the Cloudflare pilot.

## Hosted pilot and Twitch access

The [Cloudflare pilot Studio](https://pilot-baited.maff.app/studio) serves two invited streamer channels, with a limit of 100 distinct participants per round and 100 concurrent viewer connections per channel. It uses a Worker gateway and SQLite Durable Objects. The project owner has tested live play on desktop and iOS; this is a pilot, not unrestricted public onboarding.

The native Extension remains in **Hosted Test**. Testing requires configured Twitch tester access, and a broadcaster must install and activate it on an allowed channel. A judge opening the Studio URL is not automatically authorized to run a channel or install the Extension. Arrange hosted access with the project team, or use the credential-free local demo. The [judge walkthrough](packages/app/docs/judge-walkthrough.md) explains both paths.

The pilot uses the built-in deck. Custom packs and Card Maker are available in the Node application but are excluded from this hosted pilot. Landing deployment, game deployment and Twitch Extension upload are separate steps. Building an Extension ZIP does not install it or update its backend.

## Repository map

| Package | Responsibility |
| --- | --- |
| [`packages/app`](packages/app/README.md) | React Studio, viewer room, OBS overlay, speech tools, Node server and native Twitch Extension |
| [`packages/game-core`](packages/game-core/README.md) | Shared game rules and versioned recovery checkpoints |
| [`packages/edge-game`](packages/edge-game/README.md) | Cloudflare Worker gateway and per-channel Durable Object authority |
| [`packages/landing`](packages/landing/README.md) | Product landing page and its assets |
| [`packages/review-host`](packages/review-host/README.md) | Preview-host and indexing-policy helpers |

All required source and runtime assets belong to this repository or its declared dependencies. No other repository or submodule is a setup prerequisite.

## Development

Run preview commands in separate terminals:

```sh
pnpm preview:extension   # Local native-panel/config fixtures on port 3322
pnpm dev:landing         # Landing preview on port 4370
```

The Extension workbench uses the real frontend with local fixtures; it does not connect to Twitch or use a microphone. The application preview above uses the compiled build. For source development, `pnpm dev` runs the Node application on port 3000.

Repository checks and build commands:

```sh
pnpm check
pnpm test
pnpm build
pnpm build:extension     # Requires the public Extension client ID and backend origin
```

Keep credentials and local data out of Git. Live configuration uses reference-only templates and secret injection; the [setup guide](packages/app/docs/GETTING_STARTED.md) separates it from the credential-free preview. See [hackathon requirements](packages/app/docs/hackathon-requirements.md) for the submission deadline, judge access and the required post-deadline freeze.

## License and assets

Original project code is covered by the [MIT license](LICENSE). Dependencies, fonts, models and other assets retain their own notices. See [third-party notices](packages/app/THIRD_PARTY_NOTICES.md), [card artwork provenance](packages/app/public/cards/proofs/README.md) and [brand asset notes](packages/app/public/brand/README.md). Import manifests and original license files are preserved with their packages.
