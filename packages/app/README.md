# Baited application

**Make the streamer say it.** Viewers get a secret word and try to bring it into the streamer's conversation. Studio runs the round, chat supplies the hints, and the OBS overlay shows the clock and result.

[Get Baited running](docs/GETTING_STARTED.md) covers the local demo and real Twitch setup. The [judge walkthrough](docs/judge-walkthrough.md) provides a short, credential-free test. Commands here run from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm --filter @baited/app build
pnpm preview:local
```

Use Node 24 and pnpm 10.34.3. Open [http://127.0.0.1:3318](http://127.0.0.1:3318), then choose **Try the local demo**. The preview uses the compiled build, clears live credentials from its child process, binds to loopback by default and stops after three hours or Ctrl+C. It refuses a package-local `.env` and fails if its fixed port is occupied. Rebuild after source changes.

## Game and surfaces

- **Studio:** round controls, settings, scores, microphone status, catch review and win reversal. It receives no active target.
- **Viewer card:** the word and forbidden clues. The Node application offers a standalone viewer room; the Cloudflare pilot keeps secret cards inside Twitch's viewer Extension.
- **OBS overlay:** a transparent, read-only clock, score and result display. Use the overlay URL from Stream setup, not the viewer URL.
- **Native Twitch Extension:** viewer panel, mobile view and video overlay. The broadcaster's own session sees the card back. Hosted Test access and activation are separate from running the backend.
- **Baity:** optional chat announcements, status commands, skip votes and moderator controls. An announced voice draft is the streamer's unconfirmed guess, never a lookup of the secret target.

The built-in deck contains 100 illustrated English targets. Easy has no forbidden clues, Medium has two and Hard has four. A violating hint is ineligible for a streamer-selected award; it does not cancel the community's win. After a catch, **You baited me** lets the streamer select a retained clean hint. Changing or reversing that award does not create an extra community win.

Optional three-word missions share one clock, including cooldowns between words. Optional **Call the bait** gives one guess per word. With Baity chaos off, a correct guess escapes the word and any active mission; a wrong guess adds 15 seconds for chat. [Quick rules](docs/quick-rules.md) and [mechanics](docs/mechanics.md) describe the wider rules.

**Baity chaos** is off by default. If enabled, a correct guess can give chat the win instead: a one-in-four chance when chat has a streak of at least three, at most once per chaos session. The result identifies Baity's intervention.

The Node application also includes channel-owned card packs, pronunciation rehearsal and a pixel/ASCII artwork editor. Those authoring tools expose card words and should be opened off stream. They are excluded from the Cloudflare pilot, which uses the built-in deck. See [Card Maker](docs/card-maker.md) and [the artwork editor](docs/card-art-studio.md) for that separate feature set.

## Moonshine in Studio

**Moonshine is the default live recognizer** (`SPEECH_PROVIDER=moonshine`). Its English Tiny Streaming model downloads about 84 MB on first use, then runs locally in a browser worker. It needs no speech-provider account or API key. Use headphones and grant microphone permission from Studio; wait for the model and microphone to become ready before starting a round.

Raw microphone audio stays in the browser. Final transcript text and word timing go to the Baited server for matching. Baited does not persist that transcript text. The active target is withheld from Studio until the round ends. A microphone or provider failure pauses active play.

A detected catch stops the round before revealing the word. The catch confirms after 15 seconds unless the streamer rejects it; the streamer may also confirm sooner. A confirmed win can be reversed. Rejecting a catch does not reopen the revealed word for a guess.

Whole-word matching, capture time, round epoch and microphone ownership are checked. The installed Moonshine SDK supplies a constant confidence value, so it cannot establish recognition accuracy. Up to 1.5 seconds of settling lets final speech from before the buzzer arrive. This does not extend the guess deadline, and unfinished utterances may miss the settling window.

### Voice guesses

Enable **Voice guesses** explicitly while Call the bait is available. Say **“I am calling the bait, banana, lock in.”** No artificial pauses are required. To check the draft first, leave off **“lock in”**, then say it within 15 seconds. Expiry never submits a guess.

Recognized, eligible commands are handled before catch detection. Recognition is not guaranteed: an unrecognized phrase is ordinary speech, and saying the target can trigger a catch. After the one guess has been used, calling wording no longer protects speech for that word.

With Baity connected and announcements enabled, a separately prepared draft can appear in chat. A combined guess and lock-in skips the intermediate draft announcement. Your stream can hear the spoken command regardless of the bot. Canceling a draft does not retract an already requested chat post. Typed guesses remain available without public draft announcements.

## Speech Lab

Open `/speech-lab` on the running app. Pause your game and turn off Studio's microphone first. Record one 5, 10 or 15-second clip, or choose an uncompressed WAV up to 25 MB. Both-model comparisons accept up to one minute; Moonshine-only comparisons accept up to five minutes.

The same retained audio runs through one model at a time. You can replay or download the clip, retry either model, and export completed results and failure details as JSON. A failed model does not discard the clip or another model's successful result.

English comparison supports Moonshine and Whisper Tiny. Croatian is available only for Whisper. Whisper requires its optional model files on the host; its availability is shown in the page. It is a Speech Lab comparison only, not a Studio recognizer or automatic fallback.

Model load time, Moonshine final-phrase lag and Whisper whole-clip processing time measure different things. None is end-to-end game latency. The lab sends no audio to a speech service, opens no game session and cannot score or submit commands.

The legacy Deepgram adapter remains an explicit Node-server choice with `SPEECH_PROVIDER=deepgram` and an injected `DEEPGRAM_API_KEY`. That mode sends microphone audio through the server to Deepgram. It is not required for Moonshine or used by the Cloudflare pilot.

## Real Twitch and hosted play

The [Cloudflare pilot](https://pilot-baited.maff.app/studio) has been tested live by the project owner on desktop and iOS. It currently allows two invited streamer channels, with 100 distinct participants per round and 100 concurrent viewer connections per channel. Public browsing does not grant channel access. The native Extension remains in Hosted Test and requires configured tester access plus installation and activation on an allowed channel.

For a local real-channel rehearsal, follow [Get Baited running](docs/GETTING_STARTED.md). Twitch OAuth credentials and a stable encryption key are required; Moonshine still needs no speech API key. Store secret values in Proton Pass and inject them with the reference-only template. Never commit resolved credentials or local game data.

For OBS, copy the URL from Studio's **Stream setup** into a Browser Source at **1920 × 1080**. Its background is transparent. Keep the viewer target out of the captured scene. Localhost URLs work only on that computer; remote play needs HTTPS, the correct Twitch configuration and a reachable game backend.

The Node server and the Cloudflare Worker are separate hosting options. A static landing page does not host gameplay. The Node server needs a persistent process and storage; the Cloudflare pilot uses the shared game core with per-channel Durable Objects. Neither a frontend build nor an Extension ZIP configures or deploys a live service.

## Development and verification

```sh
pnpm dev                         # Source development on localhost:3000
pnpm preview:extension           # Native panel/config fixture workbench on 127.0.0.1:3322
pnpm --filter @baited/app check
pnpm --filter @baited/app test
pnpm --filter @baited/app build
```

The automated tests cover game transitions, speech matching and timing, microphone lifecycle, authenticated commands, persistence, OAuth/EventSub fixtures and synchronized views. They do not establish recognition accuracy on every device. CI and a real microphone/Twitch check answer different questions.

## Source and licenses

```text
client/         React Studio, viewer, OBS and speech tools
extension/      Native Twitch viewer/config frontends
public/         AudioWorklet, browser runtime assets, cards and fonts
server/         Node game host, OAuth, EventSub, speech and persistence
shared/         Typed contracts and shared card content
tests/          Node test suite and provider fixtures
docs/           Setup, architecture, mechanics and submission guidance
licenses/       Third-party notices and license texts
```

The shared game authority lives in the sibling [game-core package](../game-core/README.md). Original project code is MIT licensed. Preserve [third-party notices](THIRD_PARTY_NOTICES.md), model and font licenses, [card artwork provenance](public/cards/proofs/README.md), [brand asset notes](public/brand/README.md) and [build provenance](docs/build-provenance.md). The supplied logo's rights remain a separate owner confirmation recorded in its asset notes.
