# Baited technology and architecture

Verified from source on 26 October 2026 at `d93edb9780f0607112e83debcbab154758f0a3a1`. This note supports the Devpost draft and team handoff. It is not a deployment, test or submission receipt. The active visual redesign may be ahead of this snapshot.

## Workspace

The private [Komediruzecki/baited](https://github.com/Komediruzecki/baited) pnpm workspace contains:

| Package | Responsibility |
| --- | --- |
| `packages/app` | Node server, React Studio and standalone viewer, OBS overlay, native Twitch viewer/configuration files, game and card assets, tests and runtime docs. |
| `packages/landing` | HTML/CSS/JavaScript landing, artwork and films, TypeScript Cloudflare Worker and deployment configuration. |
| `packages/review-host` | Local review-host support used by the landing workflow. |

The root requires Node.js 22.12 or later and pins pnpm 10.34.3. Extension version 0.0.1, app package version 0.1.0 and landing release versions are separate identifiers; do not use one as proof of another's release.

## Stack and concrete uses

These are manifest declarations, not a report of every resolved lockfile version.

| Technology | Use and source |
| --- | --- |
| TypeScript; JavaScript | App, server, shared contracts and tooling; native Extension and landing also contain plain JavaScript. |
| React / React DOM 19 | Studio, standalone viewer and OBS presentation; `packages/app/client/main.tsx`. The native Twitch panel is not a React build. |
| Node.js; Express 5.1 | HTTP routes, OAuth, room management, event streams and game lifecycle; `packages/app/server/app.ts`. |
| Vite 6; tsup 8; tsx 4 | App development, browser bundle, Node server build and TypeScript execution. |
| Moonshine WASM 0.1.5 | Browser-local English TinyStreaming model; `packages/app/public/moonshine-worker.js`. |
| WebAssembly; Web Workers | Run the speech model away from the UI thread. Model assets are downloaded when needed and cached; local inference does not mean no initial network download. |
| Web Audio; AudioWorklet | Microphone processing and 16 kHz PCM delivery to the local worker; `client/microphone.ts`, `public/pcm-worklet.js`. Also procedural sounds in `client/sound-lab`. |
| Twitch OAuth / Helix / EventSub | Broadcaster authorization with `user:read:chat`; WebSocket subscription to `channel.chat.message`; `server/twitch.ts`. |
| Twitch Extensions JavaScript Helper | Native viewer/configuration authorization and lifecycle; `extension/client.js`. The panel polls a read-only authenticated API. |
| WebSockets; `ws` 8 | Twitch EventSub and the Studio-to-server local speech protocol. The chosen Moonshine path sends transcript JSON and sample counts, not microphone PCM. |
| Server-Sent Events | Studio, standalone viewer and OBS state updates from the same game instance; native Extension polling is a separate transport. |
| `jose` 6; Zod 4; Helmet 8 | Extension JWT verification, boundary validation and HTTP security headers. These controls are implementation details, not a claim of a completed security audit. |
| Node crypto; disk-backed store | AES-256-GCM token encryption and queued file writes; `server/store.ts`. There is no database service dependency in this build. |
| Cloudflare Workers; Wrangler 4 | Landing deployment. The game server currently runs on the Linux test computer, not inside a Worker. |
| Named Cloudflare Tunnel | HTTPS route to the PC-hosted game backend at `play-baited.maff.app`. The process must be running for remote tests. |
| OBS Studio Browser source | Presents the public HUD in the stream. OBS does not perform Moonshine inference. |
| Node test runner; Playwright | App/Extension unit and integration checks; landing browser checks. This documentation pass did not rerun the complete code test suite. |
| AI coding agent; AI image generation | Implementation, debugging, checks and integration; separately generated card illustrations. A separate AI design review has also supplied design guidance. Do not describe all design decisions as coming from one tool. |

## One round, across the three screens

1. The broadcaster signs into Studio through Twitch OAuth, explicitly enables the microphone and starts a round.
2. The server selects the target and forbidden clues. The viewer role receives those fields; the active Studio and overlay round views do not.
3. A native Twitch panel authenticates using Twitch's signed JWT and reads the viewer state for that channel. Broadcaster-role panel requests receive the Studio projection to avoid an accidental spoiler.
4. Viewers type clues in Twitch chat. EventSub delivers the real chat messages to the server. Distinct viewers can vote with `!skip`; the default threshold is three and is configurable.
5. AudioWorklet PCM stays in the browser and goes to the Moonshine worker. Finalized text, timing/sequence metadata and sample counts travel over the authenticated application WebSocket. The target is not supplied to the speech model.
6. The game checks finalized text against the active round. Round/epoch, sequence and timing checks reject stale or duplicated results. A match creates a pending catch and freezes the decision state.
7. The broadcaster confirms or rejects the catch. Only a confirmed catch records a chat win. An eligible clue can receive a separate manual award; the model does not decide which message caused the streamer to speak.
8. Studio/viewer/OBS receive their corresponding updates. OBS receives a result word only for caught or escaped outcomes, and never receives the active target or a pending-review word. Its history omits words.

This describes code behavior. It does not establish that the user has accepted every edge case on every device.

## Speech and data boundaries

- **Chosen path:** Moonshine is the configured default. No Deepgram key is needed for it. The repository still includes an explicitly selectable legacy Deepgram adapter; it is not required to run the chosen Moonshine configuration.
- **Local audio, networked game:** microphone audio stays on the streamer computer in Moonshine mode. Transcript text and metadata go to the game server. Avoid the inaccurate claim that no speech-derived data leaves the browser.
- **English model:** the integrated worker uses TinyStreaming English. Do not promise multilingual recognition or a tested device-support list.
- **Human decision:** recognition proposes a catch. The streamer decides before scoring. SDK confidence metadata must not be presented as a measured accuracy percentage.
- **Browser conditions:** secure contexts and cross-origin isolation are part of the worker setup. The earlier runtime failure was an observed CSP incompatibility; the worker-specific fix is separate from loosening the main page.
- **Sound:** explicit enable/mute controls, procedural Web Audio recipes from the owner's Keys Sound Lab with its retained MIT notice. Studio is the sound source; the OBS overlay stays silent to avoid duplicate output.
- **State:** one authoritative in-process game map with disk persistence. Horizontal scaling and permanent managed hosting are future work, not present claims.
- **Access:** Studio uses a cookie session and mutation guards. Native Extension state reads use verified Twitch JWT claims and channel binding. The OBS URL has a separate read key; redact it in public media.
- **Retention:** raw chat clues are temporarily held in memory for round review and bounded in code. The persistent game snapshot is not an audio archive. Treat the active privacy page and exact code as the policy source; this note does not add a broader retention promise.

## Card inventory and editable text

Read-only inventory on this source snapshot found:

| Check | Result |
| --- | ---: |
| Playable targets in `server/words.ts` | 78 |
| Unique targets | 78 |
| Clue definitions in `server/cards.ts` | 78 |
| Playable targets with matching PNG artwork | 78 |
| Missing target artwork or clue definitions | 0 |

Difficulty selection has 27 easy, 26 medium and 25 hard targets. Easy uses zero extra forbidden clues, medium two and hard four; the target itself is always off limits in chat.

Images are artwork only. The app and native panel render target/clue text and controls separately. Typography, clue-chip layout and experimental card treatments can therefore change without regenerating the illustration. The new 60-card expansion brings the present total to 78, not 100. Do not describe the planned 1,000-word catalogue or deluxe variants as released.

## Verification ledger

| Claim | Evidence class | What is still unproven |
| --- | --- | --- |
| Default speech provider is Moonshine; role-specific target filtering; pending-catch confirmation; real EventSub transport | Source inspection at the revision above | Source inspection alone is not end-to-end acceptance. |
| 78 complete illustrated playable targets | Read-only file inventory during this documentation pass | Final redesign's layout and readability still need review. |
| Owner's Studio microphone became ready after the worker CSP fix | User report in the task; earlier hosted browser record in the personal project README | Broad hardware/browser performance and general recognition accuracy. |
| Paolo saw the card and real Twitch chat clues reached Studio | Owner's explicit report from the remote Hosted Test | Repeatable reviewer access or public installability. |
| Several real Moonshine tests worked well | Owner's qualitative report, no count or accuracy percentage supplied | A controlled accuracy benchmark across voices, noise and microphones. |
| OBS showed matching scores after refreshing its Browser source | Owner's explicit confirmation | Automatic reconnect recovery and every transient result animation. |
| A third tester saw a blank gray panel in Firefox | User-reported unresolved/deferred issue | Cause and fix. Do not claim full Firefox support. |
| Landing/application test scripts exist; earlier CI/test receipts are recorded elsewhere | Repository scripts and dated project records | No fresh whole-suite test result was produced by this docs-only pass. |
| Devpost fields were updated online | **Not established** | Connector reauthentication, saved field readback and final submission remain separate. |

## Source and rights handoff

Keep the original package's build/session and license provenance; do not rewrite the historical record after renaming the project. The original build session candidate is `01a16ee8-4685-73a1-8477-a738186e6ffc`; this later implementation thread is `01a16ffb-42f5-7b02-b9bf-6e7e3e2dc1e7`. Owners must choose the correct session if a final form asks where most work was built.

Use the original Baited wordmark and approved assets. Preserve notices for fonts, model/runtime dependencies and the adapted procedural sound code. Commercial card games are design/mechanics references, not permission to copy their branding or card artwork.

No secrets, full OAuth callback URLs, cookie values, transcript recordings or overlay read keys belong in this note or the public Devpost story. Private repository access and any future public release remain owner decisions.
