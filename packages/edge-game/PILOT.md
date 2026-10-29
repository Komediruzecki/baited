# Baited: first Cloudflare pilot

Prepared on 29 October 2026. **No resources or public endpoint have been activated.** The earlier instruction to keep hosting prepared remains the activation boundary. The PC server and tunnel stay stopped. This pilot does not move production or change Twitch settings.

## The smallest useful test

One streamer signs into Studio, enables local Moonshine and starts a round. A different Twitch account sees the secret card in the native Extension and sends clues through normal Twitch chat. Studio sees those clues and confirms a detected catch. OBS shows the public result. Then repeat with the other invited channels.

Use the existing built-in deck only. Card Maker, uploads, custom decks, scanning, R2, D1 and Containers are out of scope. Assets are static; the room and control state live in SQLite Durable Objects.

The proposed isolated hostname is `pilot-baited.maff.app`. It is a proposal in configuration, not a working link. Existing `dev-play-baited.maff.app`, `play-baited.maff.app` and landing domains remain unchanged. Choosing a different pilot hostname means updating the public origin, exact host/origin allowlists, Extension build values and OAuth callback together.

## Limits that can be changed together

See [`wrangler.pilot.jsonc`](./wrangler.pilot.jsonc). Invalid values fail closed.

| Configuration | Prepared value | Meaning |
| --- | --- | --- |
| `EDGE_CHANNEL_LOGIN_ALLOWLIST` | `komediruzecki7,lakeeko,yahwehwastaken` | OAuth must prove an allowlisted identity. A browser-supplied channel name grants nothing. |
| `EDGE_MAX_CHANNELS` | `3` | Allowlist/registered-channel ceiling. Supports up to 10 after review. This is stricter than allowing 10 simultaneous games from an unlimited directory. |
| `EDGE_MAX_PARTICIPANTS` | `100` | Distinct chat identities admitted to each round. A 101st identity remains in normal Twitch chat but is ignored by the game. Pilot implementation will not accept a value above 100. |
| `EDGE_MAX_VIEWER_SOCKETS` | `100` | Concurrent viewer connections per channel; separate from participants. Up to 200 configurable after a deliberate capacity review. |
| `EDGE_CHAT_EVENTS_PER_MINUTE` | `600` | Per-room chat processing budget. Twitch can still deliver more ordinary chat to the ingress. Do not raise this without reviewing the global replay table. |
| `EDGE_BOT_MESSAGES_PER_30_SECONDS` | `15` | Global shared bot budget, configurable from 1 to 18. Not per channel. |
| `EDGE_STUDIO_IDLE_MINUTES` | `15` default | Stop Twitch subscriptions after Studio stops refreshing its authenticated session. Supports 5–60 minutes. Explicit reconnection is required afterward. |
| `EDGE_BOT_OWNER_LOGIN` | `komediruzecki7` | Only this signed-in operator may initiate the Baity account authorization flow. |
| `EDGE_PILOT_ENABLED` | `false` | Admission remains closed until the launch decision. |
| `limits.cpu_ms` | `50` | Per-request CPU guard; not a monthly spending cap. |

Room controls and explicit state refreshes each have a 120/minute budget per role and identity. Viewer joins allow 12/minute per identity; Studio/OBS joins allow 120/minute. Viewer traffic cannot consume the Studio's buckets. Viewer sockets are capped at four per identity. Studio and OBS share eight reserved connection slots. The pilot requires viewers to sign into Twitch; identity sharing is not required. Brief tab visibility changes keep the socket; five minutes hidden releases it.

Frames and commands are limited to 8 KiB. A viewer may send four frames/second; Studio allows 16 for audio progress. Invalid viewer commands close that connection before entering the mutation queue. The gateway additionally allows 600 dynamic requests/minute/IP and 10 OAuth initiations/minute/IP using Cloudflare's approximate, per-location rate limiter. Verify that namespace IDs `2026102901` and `2026102902` are unique in the deployment account before activation. These are abuse controls, not exact global quotas.

The active microphone has a 30-second lease renewed every 10 seconds and is bound to the exact Studio tab. A new round pauses if no audio timing arrives within five seconds, or if progress subsequently stops for 2.5 seconds. Late frames from a paused or finished round are ignored. Renewals return state in their response; there is no follow-up polling GET.

Adding another invited streamer is a small config change: add the exact login, increase `EDGE_MAX_CHANNELS` as needed, review it, and redeploy configuration. Existing cookies do not grant a removed channel continued admission. Before removing a channel, disconnect its Twitch subscriptions and end its active test; do not rely on an allowlist edit alone as cleanup.

These limits bound admitted work, not the number of requests strangers can send to a public hostname. The gateway rate limiter is an additional abuse guard, not a guaranteed invoice ceiling. Twitch video viewers and Baited participants are different populations.

## Credentials and permissions

[`pilot-secrets.env.tmpl`](./pilot-secrets.env.tmpl) contains references only. The new `baited-edge-pilot` item and fields are **not claimed to exist yet**. At activation, create independent random keys in Proton and inject directly into the provider’s secret-binding command. Never write injected values to an env file, terminal output or Git.

| Binding | Purpose |
| --- | --- |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Identify the OAuth application and exchange/refresh Twitch grants. |
| `TWITCH_EXTENSION_SECRET_B64` | Verify Twitch-signed visitor identities for the Extension. Existing Extension shared secret. |
| `TWITCH_EVENTSUB_SECRET` | Separate high-entropy secret for verifying Twitch webhook signatures. |
| `EDGE_TOKEN_ENCRYPTION_KEY_B64` | Dedicated 32-byte random key, standard base64, for stored OAuth credentials. |
| `EDGE_PILOT_SECRET_B64` | Independent 32-byte random key, standard base64, for short-lived Studio/OBS credentials. |

The streamer grant requests `user:read:chat`, `user:bot` and `channel:bot` for the app-token chat subscription and bot permission path. The bot account grants `user:write:chat` and `user:bot`. Granting `channel:bot` is not granting moderator status. Viewers use Twitch’s Extension authorization; they do not need the streamer’s OAuth grant.

Studio cookies are Secure, HttpOnly and SameSite=Lax with a 12-hour lifetime. State-changing control endpoints require the session and CSRF token. Socket capabilities last at most five minutes and refresh while the session is valid. OBS uses a public-display capability in the URL fragment, exchanged through POST; it cannot read the live secret. Credentials and raw audio are not logged.

Broadcaster role protection stops accidental peeking with the broadcaster’s known account. It cannot stop a streamer using another account, watching a friend’s screen or receiving the word in ordinary Twitch chat. This is a social game, not a cryptographic guarantee against its own host.

## Build and review before activation

1. Finish the requested personal Opus review and its fix-verification pass, assess each finding and rerun affected checks. Keep the PR draft if a blocking issue remains. See [REVIEW-DISPOSITION.md](./REVIEW-DISPOSITION.md).
2. Let the existing PR checks validate the application, Extension, landing, review-host and edge package. The new edge checks also build the selected static pilot assets.
3. Build the pilot frontend with `pnpm --filter @baited/edge-game build:pilot-assets`.
4. Build a separately named native Extension ZIP with `EXTENSION_TRANSPORT=edge` and the exact pilot API/Studio origin. [`pilot-extension.env.tmpl`](./pilot-extension.env.tmpl) supplies the public configuration and the Proton reference for the public Extension client ID. A ZIP built with fixture values is not upload-ready.
5. Review the actual Cloudflare account’s remaining included usage. The published allowances are shared with other projects; the $5 plan is not a hard spending cap.
6. Record the chosen hostname, account, commit, time window, initial channels and stop procedure. Obtain the final activation decision before creating bindings, routing or provider workload.

The branch has no automatic deployment workflow. Its prepared config has `workers_dev: false`, `preview_urls: false`, empty routes and `EDGE_PILOT_ENABLED: false`. A local build or PR merge is not a deployment instruction.

## Activation sequence, once authorized

1. Use the existing paid Workers account. Create only the Worker, its two SQLite Durable Object classes and static asset deployment. Do not create an R2 bucket, D1 database or Container for this deck-only pilot.
2. Generate/store the dedicated keys in Proton and supply the six secret bindings without echoing their values. Keep them distinct from fixture and staging keys.
3. Add the exact HTTPS pilot hostname as a reviewed Worker custom domain/route and set the pilot flag true. Keep fixture and synthetic staging flags false.
4. The owner adds the OAuth redirect `https://pilot-baited.maff.app/auth/twitch/callback` to the existing Twitch application. The owner adds the exact HTTPS/WSS pilot endpoints to the Extension’s allowed connections and adds its real Twitch-hosted Extension origin to `EDGE_ALLOWED_ORIGINS` on the Worker. No wildcard origins.
5. The owner uploads the edge pilot ZIP to the intended Hosted Test version. Uploading a ZIP does not update the backend, and updating the backend does not change Twitch’s uploaded assets.
6. Visit Studio over HTTPS. Sign in as `komediruzecki7`, approve the listed scopes, connect Twitch chat and verify the connection status. Authorize Baity separately with the configured bot account if announcements are wanted.
7. Replace the OBS source URL with the URL copied from this pilot Studio. Do not reuse the former PC server’s capability URL.
8. Enable the microphone and wait for Moonshine readiness. A different allowlisted tester opens the native Twitch panel/video overlay. Begin one round and run the checks below before inviting the other channels.

No submission for Twitch review, production tag or public launch is part of this pilot.

## First live acceptance test

| Check | Pass condition |
| --- | --- |
| OAuth | Correct account signs in; non-allowlisted channel is denied; wrong/replayed OAuth state fails. |
| Secret separation | Viewer sees word and clues; broadcaster Extension, Studio and OBS do not see them during the round. |
| Real clues | A second account’s Twitch chat clue arrives once in Studio. |
| Real Moonshine | Speech stays in the browser; spoken target produces a catch for streamer confirmation. |
| Result | Confirmation updates Studio, viewer and OBS consistently. |
| Interruption | Closing/disconnecting the microphone pauses the round; no false escaped win is awarded. |
| Reconnect | Refresh viewer/OBS and restore the current state; expired credentials cannot retain access. |
| Baity | Enabled announcements arrive without duplicate floods; off means no new queued announcements. |
| Stop | Disconnect chat and confirm Twitch subscription removal; close Studio and confirm the idle path separately. |
| Device | Native Twitch desktop, iPhone/tablet and the installed OBS Browser Source are checked with real accounts. |

Local fixture results do not establish these live outcomes. The first run is a functional test, not a load or cost benchmark. Do not launch a synthetic provider load generator under the current authorization.

## Storage, privacy and stopping

Room state includes the current round, bounded hint/review history, scores and command/event replay receipts. Control stores encrypted Twitch credentials, sessions, channel registration, bounded delivery retries and bot metadata. Audio is not sent; short final speech text can be used in catch/review state. Built-in artwork is static and public; the selected live word remains role-restricted.

This pilot does not expose Card Maker or account deletion UI. Data deletion is an operator task with a reviewed exact channel/resource list. Disconnecting ends ingestion; it does not erase stored state or revoke every upstream Twitch grant. Retention/deletion automation is a production follow-up, not an implicit promise of this test.

To end an ordinary test: finish/pause the round, disable the microphone, choose Disconnect chat, confirm subscription removal, sign out and remove the pilot OBS source. Failed Twitch DELETE requests remain in a durable retry queue; the UI must not claim removal before confirmation.

For a full pilot shutdown, disconnect each registered channel while the control service is still reachable, verify the shared bot queue is drained/dropped, close admission, remove public routing and allow existing short-lived socket credentials to expire. A disabled gateway flag alone does not erase namespaces or instantly terminate every existing socket. If OAuth was revoked upstream or Twitch deletion fails, verify removal through the Twitch API before declaring ingestion stopped. Delete cloud data/resources only with an exact, approved retention decision.

## Follow-ups after a successful pilot

Measure actual Cloudflare request, duration and SQLite-write totals during normal use before increasing admission. Then address retained-data deletion/backup, operational alerts, hot-room fanout and sustained failure/load evidence. Custom cards require the separate trusted image scanning, approval and removal design; they must not be enabled by merely adding an R2 binding.
