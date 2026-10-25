# BAIT

**Make the streamer say it.**

Chat gets **banana**. Someone asks about smoothies. The streamer says it. Chat wins.

BAIT runs alongside a normal Twitch stream. Viewers see the secret word on a companion page and drop hints in chat. Microphone recognition detects the word and triggers a shared win.

BAIT is an independent project created with Codex on October 24, 2026. There are no payments or subscriptions.

The source package records that creation date and its original Codex session. This checkout is the October 25 local improvement pass. See [build provenance](docs/build-provenance.md) and the [local Devpost draft](devpost-submission.md). The private [source repository](https://github.com/Komediruzecki/bait) now exists with owner-authorized checkpoint pushes. No hosted URL or final video has been configured by this pass.

## Run it now

Use Node.js 22.12 or newer and pnpm 10. The supplied package records Windows tests with Node 24.22.1 and pnpm 10.7.1. The current Linux pass has 106 passing tests, a successful production build and an isolated Docker smoke check; see [validation](docs/validation.md) for scope.

```sh
rtk pnpm install --frozen-lockfile
rtk pnpm build
rtk pnpm preview:local
```

Open **http://127.0.0.1:3318** and choose **Try the local demo**. The preview helper binds only to loopback, clears Twitch/speech credentials and the encryption key in its child process, refuses a checkout containing `.env`, and stops after three hours or Ctrl+C. It fails if its fixed port is occupied. See [the local preview handoff](docs/local-preview.md) for the active worktree's exact command and output directory.

Start a round, open the viewer room in a separate tab, and expand **Demo controls** to send test chat and a simulated final transcript. The demo needs no credentials and tests the game server with simulated inputs.

A separate [bomb-led motion study](concepts/bait-bomb/README.md) is available on port 3319 for design review. It uses a scripted example and does not connect to providers. Its public development copy is maintained in `packages/bait` on the `feat/bait-dev-landing` branch of the private disjoint-colliders repository, targeting [dev.bait.maff.app](https://dev.bait.maff.app/). The game server is not part of that deployment.

The current landing page also has an illustrated example. Select a different word or replay the exchange to see how a round works. Open `/about` to view it while signed in; the studio’s BAIT logo links there.

The preview uses the compiled application; rebuild after source changes. For interactive source development, `rtk pnpm dev` uses `http://localhost:3000` and is separate from this isolated preview. Use the Proton Pass setup below when intentionally testing live providers.

Keep `PUBLIC_URL` and the address you open identical, including `localhost` versus `127.0.0.1`. BAIT rejects unexpected Host and Origin headers. Keep secret values in Proton Pass; use a reference-only template and `pass-cli run`, as below. Do not create a plaintext `.env` containing credentials.

## What is built

- A streamer studio with round controls, settings, scores, microphone status, and win reversal. It receives no active target.
- A mobile viewer room that shows the word without an account or extension.
- A transparent, read-only OBS browser source with a timer, scores, and success animation.
- An authoritative game engine with difficulty pools, pause/resume, deadlines, cooldowns, automatic rounds, shared streaks, participation records, and `!skip` votes.
- Twitch authorization-code OAuth, encrypted server-side tokens, refresh deduplication, startup/hourly validation, and EventSub chat over WebSockets with recovery.
- Microphone-only PCM capture through an AudioWorklet and a server-to-Deepgram streaming connection. Only final, sufficiently confident, fresh whole-word results can win.
- A Twitch-inspired purple and charcoal interface, Google Material icons, original SVG illustration, reduced-motion support, confetti and a synthesized chime. Fonts and licenses are bundled locally. See [design decisions](docs/design.md).

The automated tests use Twitch and speech provider fixtures. **Live Twitch sign-in, real-channel chat, a physical microphone, and Deepgram transcription have not been tested with credentials in this build session.** Those checks remain required before presenting this as a demonstrated live integration.

## Clues, missions and awards

Ordinary conversation with one secret word remains the default. In **Game settings**, Easy has no forbidden clues, Medium has two, and Hard has four. A violating hint becomes ineligible for an award; it never cancels the community’s win.

After a win, the studio offers **You baited me**. Pick a retained clean hint to give its author a streamer-selected award. Choosing another hint moves the award. Reversing the win removes it.

Optional **three-word missions** use one session clock, including cooldowns between words. Skips replace a target; pauses freeze the clock. Optional **Call the bait** allows one private typed guess per word: a correct guess escapes the round and any active mission, while a miss gives chat 15 extra seconds.

Start with the [quick rules](docs/quick-rules.md). See [mechanics and inspirations](docs/mechanics.md) for exact timing, retention limits and the guest-mode roadmap. The original supplied logo is retained in `public/brand/`; the interface uses a transparent derivative, with header and sidebar crops in CSS.

## Connect Twitch

1. Sign in to the [Twitch Developer Console](https://dev.twitch.tv/console/apps). Your Twitch account needs the account requirements shown there, including two-factor authentication.
2. Register a **Confidential** application in the appropriate application-integration category. Use a name you control. Add this exact OAuth redirect for local use: `http://localhost:3000/auth/twitch/callback`.
3. Store `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in Proton Pass. Store a cryptographically random 32-byte encryption key as 64 hexadecimal characters in a separate `TOKEN_ENCRYPTION_KEY` vault field. Keep the same encryption key when restarting an existing data directory. Do not print these values into a terminal, chat or setup document.
4. In [the reference-only environment template](docs/bait.local.env.tmpl), replace the placeholder vault/item references with your actual `pass://` references. The file must contain references, not resolved secrets. Start the process from the repository root:

```sh
rtk proxy pass-cli run --env-file docs/bait.local.env.tmpl -- pnpm dev
```

5. Choose **Connect Twitch**, and authorize the broadcaster’s account. BAIT reads that account’s own channel. It requests only `user:read:chat` and uses that user access token for `channel.chat.message`. No separate bot account or extension is needed. This follows Twitch’s [authorization-code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) and [chat EventSub authorization](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatmessage).
6. Wait for **TWITCH / your_channel** to show connected before starting. From a different Twitch account, send an ordinary non-spoiler message or `!bait`. Confirm the participant count increases. Use `!skip` once to vote.

Tokens never enter browser storage. An HttpOnly session cookie controls the studio. Twitch credentials are encrypted with AES-256-GCM in `data/bait.json`. Preserve the encryption key across restarts. If you lose it, reconnect affected accounts using a fresh data directory. Never upload `.env` or `data/` to a repository.

## Enable real microphone recognition

For the current Linux rehearsal, use the [Twitch, speech and OBS setup guide](docs/twitch-deepgram-obs-setup.md). Use Deepgram for the first rehearsal if the existing account still has usable starter credit: it is already integrated. Check the account's balance, expiry and billing settings before sending audio. Deepgram advertises $200 starting credit, then paid usage; this is not an unlimited free service. [Current pricing](https://deepgram.com/pricing).

Neither Twitch nor the hackathon requires a speech provider. The static landing needs none. BAIT's current live game requires recognition to detect the spoken target and score automatically. A trusted moderator could confirm a catch manually in a future mode, but that live mode is not implemented. The saved ElevenLabs key has opened a Scribe v2 Realtime session without sending audio; its allowance and billing remain unverified. ElevenLabs remains an alternative that needs an adapter and recognition tests before use.

1. Open the existing [Deepgram Console](https://console.deepgram.com/) account and check its **first project**, where starting credit is assigned. Use that credited project, or confirm a credit transfer with Deepgram before choosing another. Create a key allowed to transcribe streaming audio only after confirming available credit. Provider usage can incur charges to the operator; BAIT does not charge viewers or judges. [Project credit guidance](https://developers.deepgram.com/guides/deep-dives/managing-projects).
2. Store the key in Proton Pass and update the `DEEPGRAM_API_KEY` reference in the template. Restart through `pass-cli run`. See [deployment and secret handling](docs/deployment-runbook.md).
3. In the studio, select **Enable microphone**, read the consent dialog, and allow the browser’s microphone permission. Use headphones and the intended microphone input. A real round requires a connected Twitch channel, configured speech provider and an armed microphone owned by the current studio session. Local demo rounds are explicitly simulated and do not require a microphone.
4. Start a round. The microphone card should say **Listening**. Ask a separate viewer to confirm the word, then say it naturally. Confirm the synchronized win and use **Wrong detection? Reverse win** to verify correction. Losing microphone readiness pauses live play; re-enable it before resuming.

Audio is converted to mono, 16 kHz, signed 16-bit PCM and forwarded during active rounds. Fresh capture buffers are created for each speech generation so pre-round and pre-pause audio cannot spill into the next recognition session. A new provider connection is bound to each round ID and pause/resume epoch. Neither audio nor transcript text is stored by BAIT. Deepgram processing is covered by its own terms; requests set `mip_opt_out=true`. See [Deepgram’s streaming reference](https://developers.deepgram.com/reference/speech-to-text/listen-streaming).

The English target list is literal: plurals, possessives and sound-alike words do not count as the singular target. The current implementation checks the matching word's confidence (at least 0.8), capture timing and round epoch, rather than rejecting an otherwise clear target because another word was uncertain. At a live deadline, an actively listening microphone gets up to 1.5 seconds to deliver a final result for a word already completed before the deadline; this does not extend speaking time. A provider/network failure or sustained audio gap stops recognition and pauses active play. Re-enable the microphone and resume to retry. Normal round changes keep the consented microphone armed while the owning studio session remains ready.

## Share the viewer room and add OBS

In **Studio**, copy the viewer-room URL. Put it in a channel panel or Twitch chat manually. BAIT never posts the target. Viewers keep the page beside the Twitch stream and play through normal chat.

In **Stream setup**, copy the OBS URL. Add an OBS **Browser Source**, set width **1920**, height **1080**, and paste the URL. Its background is transparent. Place it above your scene. Do not use the viewer URL as a stream overlay.

Localhost links only work on the streamer’s computer. Remote viewers need the HTTPS deployment described below. Secrecy depends on the streamer choosing not to visit the viewer page and chat choosing not to spoil the word. Anyone with that link can read the target.

## Deploy for remote play and judges

Run **one persistent Node process** on a host that supports outbound WebSockets, incoming speech WebSockets, SSE and a persistent disk. Static hosting and short-lived serverless functions cannot run this architecture. The production Docker image built and passed an isolated non-root smoke check with a read-only root filesystem and no network. This does not establish a working hosted proxy, persistence configuration or live provider connection.

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

Keep the Twitch credentials, encryption key and Deepgram key in Proton Pass. Supply them to the process with a production reference-only template through `pass-cli run`; do not place secret values in this repository, Docker build arguments or shell history. Add the **exact** production callback `${PUBLIC_URL}/auth/twitch/callback` in Twitch. The [deployment runbook](docs/deployment-runbook.md) describes the configuration and acceptance checks. It is preparation, not evidence of a deployed service.

Terminate HTTPS at your reverse proxy. Preserve the original `Host` header, forward WebSocket upgrades for `/api/speech`, disable response buffering for `/api/*/events*`, and permit long-lived connections. Do not log OAuth callback queries or speech query strings. Production enforces HTTPS in its configured public URL, Secure cookies, security headers and content policy. It disables the local demo even if `ENABLE_DEMO=true`.

For judging, provide an operator-hosted channel and speech service at no charge to judges through the judging period. A hosted URL, judge access to the private repository, broadcaster credentials and a recorded live demo are still needed; the live game has not been publicly deployed. The development landing alone does not provide judge access to gameplay. See [the judge walkthrough](docs/judge-walkthrough.md).

## Tests and verification

```sh
rtk pnpm test
rtk pnpm check
rtk pnpm build
rtk pnpm audit --prod
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

Original BAIT code, illustration and sound are MIT licensed. The user-supplied logo is documented separately in [public/brand/README.md](public/brand/README.md). Material icons, dependencies and fonts retain their own licenses. Run `rtk pnpm run licenses` after dependency changes to refresh the bundled notices. The original package's Codex session ID and its recorded source are retained in [docs/codex-session.json](docs/codex-session.json).

Before publishing the supplied logo, the owners still need to confirm its rights. See the [two-person release checklist](docs/team-and-release-checklist.md). The [tabletop options](docs/tabletop-options.md) document is research for future playtests; those additions are not included in the implemented feature list.
