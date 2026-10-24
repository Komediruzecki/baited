# BAIT

**Make the streamer say it.**

Chat gets **banana**. Someone asks about smoothies. The streamer says it. Chat wins.

BAIT runs alongside a normal Twitch stream. Viewers see the secret word on a companion page and drop hints in chat. Microphone recognition detects the word and triggers a shared win.

BAIT is an independent project created with Codex on October 24, 2026. There are no payments or subscriptions.

## Run it now

Use Node.js 22.12 or newer and pnpm 10. This build was tested on Windows with Node 24.22.1 and pnpm 10.7.1.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:3000** and choose **Try the local demo**. Start a round, open the viewer room in a separate tab, and expand **Demo controls** to send test chat and a simulated final transcript. The demo needs no credentials and tests the game server with simulated inputs.

The landing page also has an illustrated example. Select a different word or replay the exchange to see how a round works. Open `/about` to view it while signed in; the studio’s BAIT logo links there.

To test the compiled application:

```sh
pnpm build
pnpm start
```

Keep `PUBLIC_URL` and the address you open identical, including `localhost` versus `127.0.0.1`. BAIT rejects unexpected Host and Origin headers. Restart the server after editing `.env`.

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
3. Copy `.env.example` to `.env`. Set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` locally.
4. Generate a 32-byte encryption key and put the result in `TOKEN_ENCRYPTION_KEY`:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

5. Restart BAIT, choose **Connect Twitch**, and authorize the broadcaster’s account. BAIT reads that account’s own channel. It requests only `user:read:chat` and uses that user access token for `channel.chat.message`. No separate bot account or extension is needed. This follows Twitch’s [authorization-code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) and [chat EventSub authorization](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatmessage).
6. Wait for **TWITCH / your_channel** to show connected before starting. From a different Twitch account, send an ordinary non-spoiler message or `!bait`. Confirm the participant count increases. Use `!skip` once to vote.

Tokens never enter browser storage. An HttpOnly session cookie controls the studio. Twitch credentials are encrypted with AES-256-GCM in `data/bait.json`. Preserve the encryption key across restarts. If you lose it, reconnect affected accounts using a fresh data directory. Never upload `.env` or `data/` to a repository.

## Enable real microphone recognition

1. Create a [Deepgram](https://console.deepgram.com/) project and a key allowed to transcribe streaming audio. Provider usage can incur charges to the operator; BAIT does not charge viewers or judges.
2. Put the key in `DEEPGRAM_API_KEY` in `.env`, then restart.
3. In the studio, select **Enable microphone**, read the consent dialog, and allow the browser’s microphone permission. Use headphones and the intended microphone input.
4. Start a round. The microphone card should say **Listening**. Ask a separate viewer to confirm the word, then say it naturally. Confirm the synchronized win and use **Wrong detection? Reverse win** to verify correction.

Audio is converted to mono, 16 kHz, signed 16-bit PCM and forwarded during active rounds. Fresh capture buffers are created for each speech generation so pre-round and pre-pause audio cannot spill into the next recognition session. A new provider connection is bound to each round ID and pause/resume epoch. Neither audio nor transcript text is stored by BAIT. Deepgram processing is covered by its own terms; requests set `mip_opt_out=true`. See [Deepgram’s streaming reference](https://developers.deepgram.com/reference/speech-to-text/listen-streaming).

The English target list is literal: plurals, possessives and sound-alike words do not count as the singular target. Confidence below 0.8 is rejected. The current adapter uses a conservative confidence check on all words in a final segment. Long or delayed final segments can be rejected; this favors avoiding false wins. A provider or network failure stops recognition and shows an error. Re-enable the microphone to retry. Normal round changes keep the consented microphone armed.

## Share the viewer room and add OBS

In **Studio**, copy the viewer-room URL. Put it in a channel panel or Twitch chat manually. BAIT never posts the target. Viewers keep the page beside the Twitch stream and play through normal chat.

In **Stream setup**, copy the OBS URL. Add an OBS **Browser Source**, set width **1920**, height **1080**, and paste the URL. Its background is transparent. Place it above your scene. Do not use the viewer URL as a stream overlay.

Localhost links only work on the streamer’s computer. Remote viewers need the HTTPS deployment described below. Secrecy depends on the streamer choosing not to visit the viewer page and chat choosing not to spoil the word. Anyone with that link can read the target.

## Deploy for remote play and judges

Run **one persistent Node process** on a host that supports outbound WebSockets, incoming speech WebSockets, SSE and a persistent disk. Static hosting and short-lived serverless functions cannot run this architecture. A Dockerfile is included; the container image itself has not been built in this session.

Set:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
PUBLIC_URL=https://your-owned-host.example
ENABLE_DEMO=false
DATA_DIR=/a/persistent/writable/directory
```

Set the Twitch credentials, encryption key and Deepgram key as host secrets. Add the **exact** production callback `${PUBLIC_URL}/auth/twitch/callback` in Twitch. Build with `pnpm install --frozen-lockfile && pnpm build`, then run `pnpm start`.

Terminate HTTPS at your reverse proxy. Preserve the original `Host` header, forward WebSocket upgrades for `/api/speech`, disable response buffering for `/api/*/events*`, and permit long-lived connections. Do not log OAuth callback queries or speech query strings. Production enforces HTTPS in its configured public URL, Secure cookies, security headers and content policy. It disables the local demo even if `ENABLE_DEMO=true`.

For judging, provide an operator-hosted channel and speech service at no charge to judges through the judging period. A hosted URL, repository remote, broadcaster credentials and recorded live demo are still needed; no public deployment was created here. See [the judge walkthrough](docs/judge-walkthrough.md).

## Tests and verification

```sh
pnpm test
pnpm check
pnpm build
pnpm audit --prod
```

The suite covers game transitions, complete-word matching, confidence and transcript age, audio capture gating/resampling, authorization boundaries, encrypted persistence, OAuth exchange fixtures, token refresh, EventSub deduplication/reconnect/revocation, simultaneous chatters, and real HTTP/SSE synchronization.

Read [validation results](docs/validation.md) for the exact tested scope and remaining live checks. [Architecture](docs/architecture.md) explains the trust boundaries and operational limits.

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

Original BAIT code, illustration and sound are MIT licensed. The user-supplied logo is documented separately in [public/brand/README.md](public/brand/README.md). Material icons, dependencies and fonts retain their own licenses. Run `pnpm run licenses` after dependency changes to refresh the bundled notices. The genuine Codex session ID and its source are recorded in [docs/codex-session.json](docs/codex-session.json).
