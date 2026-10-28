# Baited

**Make the streamer say it.**

Start with [Baited setup](docs/GETTING_STARTED.md) for a local round, microphone recognition and the path to a real Twitch test. **Moonshine is the default and needs no Deepgram account or API key.** The [v0.0.1 local Extension guide](docs/baited-local-test.md) contains detailed Twitch installation steps. The [master plan](docs/master-plan.md) records gameplay, creative follow-ups and review preparation.

Chat gets **banana**. Someone asks about smoothies. The streamer says it. Chat wins.

Baited runs alongside a normal Twitch stream. Viewers see the secret word in the Twitch panel or companion page and drop hints in chat. Moonshine listens locally in the streamer's browser. It proposes a catch; the streamer confirms it before chat earns a win.

Baited is an independent project created with Codex on October 24, 2026. There are no payments or subscriptions.

The source package records that creation date and its original Codex session. See [build provenance](docs/build-provenance.md) and the [local Devpost draft](devpost-submission.md). This application now lives in `packages/app` of the private [baited repository](https://github.com/Komediruzecki/baited), alongside the separate landing package.

## Run it now

Use Node 24 and the repository's pinned pnpm 10.34.3. Older tool versions in [validation records](docs/validation.md) describe earlier runs, not the current setup requirements.

Install from the repository root using its pinned pnpm version. Application commands below run from `packages/app`; from the repository root, use `pnpm --filter @baited/app <command>`. Paths in the application guides are relative to this package unless a guide explicitly records an older absolute worktree path.

```sh
pnpm install --frozen-lockfile
pnpm --filter @baited/app build
pnpm preview:local
```

Open **http://127.0.0.1:3318** and choose **Try the local demo**. The preview helper binds only to loopback, clears Twitch/speech credentials and the encryption key in its child process, refuses a checkout containing `.env`, and stops after three hours or Ctrl+C. It fails if its fixed port is occupied. See [the local preview handoff](docs/local-preview.md) for the active worktree's exact command and output directory.

Start a round, open the viewer room in a separate tab, and expand **Demo controls** to send test chat and a simulated final transcript. The demo needs no credentials. Simulated inputs remain available; enabling the microphone also lets you rehearse local Moonshine recognition.

A separate [bomb-led motion study](concepts/bait-bomb/README.md) is available on port 3319 for design review. It uses a scripted example and does not connect to providers. The current landing source is [the sibling landing package](../landing/README.md). Its deployment remains independent of the game server; moving the source does not deploy the application or switch the live domains.

The app's `/about` page retains an illustrated example: select a different word or replay the exchange to see how a round works. The standalone landing is the sibling package; its requested `baited.maff.app` domains do not host the game server.

The preview uses the compiled application; rebuild after source changes. For interactive source development, `pnpm dev` uses `http://localhost:3000` and is separate from this isolated preview. Use the Proton Pass setup below when intentionally testing Twitch.

Keep `PUBLIC_URL` and the address you open identical, including `localhost` versus `127.0.0.1`. Baited rejects unexpected Host and Origin headers. Keep secret values in Proton Pass; use a reference-only template and `pass-cli run`, as below. Do not create a plaintext `.env` containing credentials.

## What is built

- A streamer studio with round controls, settings, scores, microphone status, and win reversal. It receives no active target.
- A mobile viewer room that shows the word without an account or extension.
- A transparent, read-only OBS browser source with a timer, scores, and success animation.
- A native Twitch Extension: a viewer panel, and a video overlay that deals the card onto the stream. Viewers see the word; the broadcaster's own session sees the card's back.
- An optional chat bot that announces rounds, nudges, results, streaks and the streamer's pick, answers `!bait help`, `!bait score`, `!bait streak` and `!bait top`, and lets moderators `!bait start`, `!bait pause` and `!bait resume`. It never posts a word while its round is live. See [Chat bot](docs/chat-bot.md).
- Chat win streaks shown as fire, with seven badges from Spark at two in a row to Ultraviolet at fifty, on OBS, the Extension, the viewer room and the studio.
- One card everywhere: the landing's Cut Open card, with the Glass finish and the Prism back, on the Extension overlay and panel, the studio, the viewer room and the OBS reveal. The OBS boxes around it are Twitch-style and set in the original Baited Pixel font.
- An authoritative game engine with difficulty pools, pause/resume, deadlines, cooldowns, automatic rounds, shared streaks, participation records, and `!skip` votes.
- Twitch authorization-code OAuth, encrypted server-side tokens, refresh deduplication, startup/hourly validation, and EventSub chat over WebSockets with recovery.
- Microphone-only PCM capture through an AudioWorklet. Moonshine runs in a browser worker by default; its proposed catches require broadcaster confirmation. Deepgram remains an optional server-side adapter for automatic scoring.
- Eighteen original ChatGPT-generated pixel illustrations, a bomb-led landing study, reduced-motion support, and opt-in Sound Lab effects adapted from Keys. Fonts and licenses are bundled locally. Open `/card-proofs` to review the illustrated deck and audition the sounds.

The automated tests use Twitch and speech provider fixtures. Workspace checks do not replace a real-channel rehearsal with Twitch sign-in, a physical microphone, viewer interaction and OBS. Deepgram testing is relevant only if you deliberately enable its optional adapter; it is not a requirement for the Moonshine path.

## Clues, missions and awards

Ordinary conversation with one secret word remains the default. In **Game settings**, Easy has no forbidden clues, Medium has two, and Hard has four. A violating hint becomes ineligible for an award; it never cancels the community’s win.

After a win, the studio offers **You baited me**. Pick a retained clean hint to give its author a streamer-selected award. Choosing another hint moves the award. Reversing the win removes it.

Optional **three-word missions** use one session clock, including cooldowns between words. Skips replace a target; pauses freeze the clock. Optional **Call the bait** allows one private typed guess per word: a correct guess escapes the round and any active mission, while a miss gives chat 15 extra seconds.

Start with the [quick rules](docs/quick-rules.md). See [mechanics and inspirations](docs/mechanics.md) for exact timing, retention limits and the guest-mode roadmap. The original supplied logo is retained in `public/brand/`; the interface uses a transparent derivative, with header and sidebar crops in CSS.

## Connect Twitch

1. Sign in to the [Twitch Developer Console](https://dev.twitch.tv/console/apps). Your Twitch account needs the account requirements shown there, including two-factor authentication.
2. Register a **Confidential** application in the appropriate application-integration category. Use a name you control. Add this exact OAuth redirect for local use: `http://localhost:3000/auth/twitch/callback`.
3. Store `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in Proton Pass. Store a cryptographically random 32-byte encryption key as 64 hexadecimal characters in a separate `TOKEN_ENCRYPTION_KEY` vault field. Keep the same encryption key when restarting an existing data directory. Do not print these values into a terminal, chat or setup document.
4. In [the reference-only environment template](docs/bait.local.env.tmpl), replace the placeholder vault/item references with your actual `pass://` references. The file must contain references, not resolved secrets. Start the process from `packages/app`:

```sh
pass-cli run --env-file docs/bait.local.env.tmpl -- pnpm dev
```

5. Choose **Connect Twitch**, and authorize the broadcaster's account. Baited reads that account's own channel. It requests `user:read:chat` and uses that user access token for `channel.chat.message`, plus `channel.chat.message_delete` and `channel.chat.clear_user_messages` so hints that moderators remove leave the review. Only if the streamer later allows the optional [chat bot](docs/chat-bot.md) does Twitch ask for `channel:bot` as well. This connects the game backend to chat; installing the native viewer panel is a separate step in the [Extension guide](docs/baited-local-test.md). This follows Twitch's [authorization-code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) and [chat EventSub authorization](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatmessage).
6. Wait for **TWITCH / your_channel** to show connected before starting. From a different Twitch account, send an ordinary non-spoiler message or `!bait`. Confirm the participant count increases. Use `!skip` once to vote.

Tokens never enter browser storage. An HttpOnly session cookie controls the studio. Twitch credentials are encrypted with AES-256-GCM in `data/bait.json`. Preserve the encryption key across restarts. If you lose it, reconnect affected accounts using a fresh data directory. Never upload `.env` or `data/` to a repository.

## Enable real microphone recognition

Moonshine is the default (`SPEECH_PROVIDER=moonshine`). It needs no speech-provider account or API key. The English Tiny Streaming model downloads about 84 MB on first use, then runs in a worker on this computer. Model files are cached by the browser. See [Moonshine implementation and limits](docs/moonshine.md).

1. Open the studio and choose **Enable microphone**. Read the consent message, allow microphone access, and use headphones.
2. Wait for the model and microphone to be ready. Start a round and have a separate viewer give hints through chat.
3. If Moonshine detects the target, the round stops and reveals the word for review. Confirm only if you actually said it. Rejecting the catch ends that revealed word without awarding chat a win.
4. Rehearse your normal speaking voice and your real OBS scene before relying on it. The [speech bench](/speech-lab) can compare the same local WAV with OBS idle and recording; it does not send the file to a speech service.

The installed Moonshine SDK supplies a constant `1.0` in its word-confidence field. It is not a probability and cannot filter misrecognition. This is why Moonshine requires confirmation. Fresh capture times, whole-word matching, round epochs and session ownership are still checked. Active rounds get up to 1.5 seconds after the buzzer to deliver a final result for speech completed before the deadline; long unfinished utterances can miss that window.

Raw Moonshine microphone audio stays in the browser. Final transcript text travels to the Baited server for matching and is not persisted by Baited. The studio never receives the active target until the round has ended. A provider failure pauses an active round.

Deepgram remains an optional legacy adapter, selected with `SPEECH_PROVIDER=deepgram` and a Proton Pass-injected `DEEPGRAM_API_KEY`. That mode sends microphone audio through the server to Deepgram and scores qualifying final results automatically. Its [older provider setup guide](docs/twitch-deepgram-obs-setup.md) is only for that choice. Leave `SPEECH_PROVIDER=moonshine` for the default local recognition path. ElevenLabs has no adapter in this build. Neither the static landing nor Moonshine requires a cloud speech account.

## Share the viewer room and add OBS

In **Studio**, copy the viewer-room URL. Put it in a channel panel or Twitch chat manually. Baited never posts the target, including through its optional chat bot. Viewers keep the page beside the Twitch stream and play through normal chat.

In **Stream setup**, copy the OBS URL. Add an OBS **Browser Source**, set width **1920**, height **1080**, and paste the URL. Its background is transparent. Place it above your scene. Do not use the viewer URL as a stream overlay.

Localhost links only work on the streamer’s computer. Remote viewers need the HTTPS deployment described below. Secrecy depends on the streamer choosing not to visit the viewer page and chat choosing not to spoil the word. Anyone with that link can read the target.

## Deploy for remote play and judges

Run **one persistent Node process** on a host that supports outbound WebSockets, incoming speech WebSockets, SSE and a persistent disk. Static hosting and short-lived serverless functions cannot run this architecture. Build the application image from the repository root with its root `Dockerfile`; it installs and packages this application without the landing package. The workspace image passed a local non-root smoke check with a read-only root filesystem, writable temporary data directory, no provider credentials and a localhost-only published port. Health, production session state, built client assets and the bundled Moonshine runtime responded successfully; its 73 production dependencies matched the installed application lockfile graph. This does not establish a working hosted proxy, durable persistence configuration or live provider connection.

Set:

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PUBLIC_URL=https://your-owned-host.example
ENABLE_DEMO=false
DATA_DIR=/a/persistent/writable/directory
TRUSTED_PROXIES=
```

The loopback bind suits a reverse proxy on the same host. A container may need `0.0.0.0` on its internal interface; restrict the published port to the intended proxy path. Set `TRUSTED_PROXIES` only to actual proxy IPs/CIDRs and require that proxy to overwrite forwarding headers.

Keep the Twitch credentials, encryption key and any optional Deepgram key in Proton Pass. Supply them to the process with a production reference-only template through `pass-cli run`; do not place secret values in this repository, Docker build arguments or shell history. Add the **exact** production callback `${PUBLIC_URL}/auth/twitch/callback` in Twitch. The [deployment runbook](docs/deployment-runbook.md) describes the configuration and acceptance checks. It is preparation, not evidence of a deployed service.

Terminate HTTPS at your reverse proxy. Preserve the original `Host` header, forward WebSocket upgrades for `/api/speech`, disable response buffering for `/api/*/events*`, and permit long-lived connections. Do not log OAuth callback queries or speech query strings. Production enforces HTTPS in its configured public URL, Secure cookies, security headers and content policy. It disables the local demo even if `ENABLE_DEMO=true`.

For judging, provide an operator-hosted channel and game backend at no charge to judges through the judging period. Moonshine can supply local speech recognition without a separate speech-provider account. A hosted game URL, judge access to the private repository, broadcaster credentials and a recorded live demo are still needed; the live game has not been publicly deployed. The development landing alone does not provide judge access to gameplay. See [the judge walkthrough](docs/judge-walkthrough.md).

## Tests and verification

```sh
pnpm test
pnpm check
pnpm build
pnpm audit --prod
```

The suite covers game transitions, complete-word matching, confidence and transcript age, audio capture gating/resampling, authorization boundaries, encrypted persistence, OAuth exchange fixtures, token refresh, EventSub deduplication/reconnect/revocation, simultaneous chatters, and real HTTP/SSE synchronization.

Read [validation results](docs/validation.md) for the exact tested scope and remaining live checks. [Architecture](docs/architecture.md) explains the trust boundaries and operational limits.

The private repository includes a read-only GitHub Actions test/build workflow on pushes and pull requests using Node 24. A local passing check and a pushed checkpoint do not establish a passing CI run; the remote workflow result must finish and be verified separately.

## Project files

```text
client/         React studio, viewer room, OBS view, microphone controller
public/         AudioWorklet, original favicon, bundled fonts
server/         Game engine, OAuth, EventSub, speech bridge, persistence
shared/         Public typed contracts; no word bank or credentials
tests/          Node test suite with local provider fixtures
docs/           Research, architecture, submission copy, demo script
licenses/       Third-party notices and full license texts
```

Original BAIT code, illustration and sound are MIT licensed. The user-supplied logo is documented separately in [public/brand/README.md](public/brand/README.md). Material icons, dependencies and fonts retain their own licenses. Run `pnpm run licenses` from `packages/app` after dependency changes to refresh the bundled notices. The original package's Codex session ID and its recorded source are retained in [docs/codex-session.json](docs/codex-session.json).

Before publishing the supplied logo, the owners still need to confirm its rights. See the [two-person release checklist](docs/team-and-release-checklist.md). The [tabletop options](docs/tabletop-options.md) document is research for future playtests; those additions are not included in the implemented feature list.
