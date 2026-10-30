# Baited: first Cloudflare pilot

Prepared on 29 October 2026; activated under the owner’s authorization on 30 October 2026. **[Studio is live](https://pilot-baited.maff.app/studio) for `komediruzecki7` and `lakeeko`.** The Worker, static assets, two SQLite Durable Object namespaces and six secrets are configured. Signed-out HTTP checks and browser rendering pass; a real OAuth, microphone, chat and OBS round on this deployment remains pending. The PC server and tunnel stay stopped. See [the active deployment receipt and owner steps](./ACTIVE-PILOT.md). The [inactive receipt](./INACTIVE-DEPLOYMENT.md) preserves the earlier checkpoint.

## The smallest useful test

Start with one of the two invited streamers. Sign into Studio, connect chat, enable local Moonshine and start a round. A different Twitch account sees the secret card in the native Extension and sends clues through normal Twitch chat. Studio sees those clues and confirms a detected catch. OBS shows the public result. Run this acceptance sequence before expanding the pilot further.

Use the existing built-in deck only. Card Maker, uploads, custom decks, scanning, R2, D1 and Containers are out of scope. Assets are static; the room and control state live in SQLite Durable Objects.

The active hostname is `pilot-baited.maff.app`. Existing `dev-play-baited.maff.app`, `play-baited.maff.app` and landing domains were not moved by this activation. Choosing a different pilot hostname means updating the public origin, exact host/origin allowlists, Extension build values and OAuth callback together.

## Limits that can be changed together

See [`wrangler.pilot.jsonc`](./wrangler.pilot.jsonc). Admission settings fail closed when invalid. The bot budget instead defaults to 15 when invalid or zero and clamps values above 18.

| Configuration | Active value | Meaning |
| --- | --- | --- |
| `EDGE_CHANNEL_LOGIN_ALLOWLIST` | `komediruzecki7,lakeeko` | Two invited streamer channels. OAuth must prove an allowlisted identity. A browser-supplied channel name grants nothing. |
| `EDGE_MAX_CHANNELS` | `2` | Allowlist/registered-channel ceiling. Supports up to 10 after review. This is stricter than allowing 10 simultaneous games from an unlimited directory. |
| `EDGE_MAX_PARTICIPANTS` | `100` | Distinct chat identities admitted to each round. A 101st identity remains in normal Twitch chat but is ignored by the game. Pilot implementation will not accept a value above 100. |
| `EDGE_MAX_VIEWER_SOCKETS` | `100` | Concurrent viewer connections per channel; separate from participants. Up to 200 configurable after a deliberate capacity review. |
| `EDGE_CHAT_EVENTS_PER_MINUTE` | `600` | Per-room chat processing budget. Twitch can still deliver more ordinary chat to the ingress. Do not raise this without reviewing the global replay table. |
| `EDGE_BOT_MESSAGES_PER_30_SECONDS` | `15` | Global shared bot budget, configurable from 1 to 18. Not per channel. |
| `EDGE_STUDIO_IDLE_MINUTES` | `15` default | Stop Twitch subscriptions after Studio stops refreshing its authenticated session. Supports 5–60 minutes. Explicit reconnection is required afterward. |
| `EDGE_BOT_OWNER_LOGIN` | `komediruzecki7` | Only this signed-in operator may initiate the Baity account authorization flow. |
| `EDGE_PILOT_ENABLED` | `true` | Real pilot admission is enabled for the two invited channels. Synthetic authentication remains disabled. |
| `limits.cpu_ms` | `1000` | Per-invocation CPU guard, also applicable to the Durable Objects; not a monthly spending cap. |

Room controls and explicit state refreshes each have a 120/minute budget per role and identity. Viewer joins allow 12/minute per identity; Studio/OBS joins allow 120/minute. Viewer traffic cannot consume the Studio's buckets. Viewer sockets are capped at four per identity. Studio and OBS share eight reserved connection slots. The pilot requires viewers to sign into Twitch; identity sharing is not required. Brief tab visibility changes keep the socket; five minutes hidden releases it.

Incoming frames and commands are limited to 8 KiB; viewer clients accept outgoing snapshots up to 64 KiB. A viewer may send four frames/second; ordinary Studio frames allow 16/second. The exact active microphone owner has a separate audio token bucket with a 48-frame burst allowance and 16/second refill, so a brief valid backlog can catch up. Every audio frame still passes sample-clock checks; exhausting that bucket closes with retryable code 1013. Invalid viewer commands close that connection before entering the mutation queue. The gateway additionally allows 600 dynamic requests/minute/IP and 10 OAuth initiations/minute/IP using Cloudflare's approximate, per-location rate limiter. Verify that namespace IDs `2026102901` and `2026102902` are unique in the deployment account before activation. These are abuse controls, not exact global quotas.

The 1,000 ms CPU allowance leaves headroom for room persistence and audience fanout; it is a ceiling, not reserved compute or a measured requirement. The earlier 50 ms setting was too aggressive without a worst-case provider profile. Cloudflare applies this setting to Durable Object invocations too. [Cloudflare limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

The active microphone has a 30-second lease renewed every 10 seconds and is bound to the exact Studio tab. A new round pauses if no audio timing arrives within five seconds, or if progress subsequently stops for 2.5 seconds. Late frames from a paused or finished round are ignored. Renewals return state in their response; there is no follow-up polling GET.

The active configuration uses `EDGE_CHANNEL_LOGIN_ALLOWLIST=komediruzecki7,lakeeko` and `EDGE_MAX_CHANNELS=2`. The owner authorized both channels before activation. More allowlisted names than the configured ceiling fails validation; it does not select the first names. Any later expansion must update both settings together and receive authorization.

Adding another invited streamer is a small config change: add the exact login, increase `EDGE_MAX_CHANNELS` as needed, review it, and redeploy configuration. Existing cookies do not grant a removed channel continued admission. Before removing a channel, disconnect its Twitch subscriptions and end its active test; do not rely on an allowlist edit alone as cleanup.

These limits bound admitted work, not the number of requests strangers can send to a public hostname. The gateway rate limiter is an additional abuse guard, not a guaranteed invoice ceiling. Twitch video viewers and Baited participants are different populations.

## Credentials and permissions

[`pilot-secrets.env.tmpl`](./pilot-secrets.env.tmpl) contains references only. The `dev / baited-edge-pilot` item now contains three independently generated keys, verified through Proton injection on 29 October 2026. Keep these stable across ordinary deployments. Inject directly into the provider’s secret-binding command; never write injected values to an env file, terminal output or Git.

| Binding | Purpose |
| --- | --- |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Identify the OAuth application and exchange/refresh Twitch grants. |
| `TWITCH_EXTENSION_SECRET_B64` | Verify Twitch-signed visitor identities for the Extension. Existing Extension shared secret. |
| `TWITCH_EVENTSUB_SECRET` | Separate high-entropy secret for verifying Twitch webhook signatures. |
| `EDGE_TOKEN_ENCRYPTION_KEY_B64` | Dedicated 32-byte random key, standard base64, for stored OAuth credentials. |
| `EDGE_PILOT_SECRET_B64` | Independent 32-byte random key, standard base64, for short-lived Studio/OBS credentials. |

The streamer grant requests `user:read:chat`, `user:bot` and `channel:bot` for the app-token chat subscription and bot permission path. The bot account grants `user:write:chat` and `user:bot`. Granting `channel:bot` is not granting moderator status. Viewers use Twitch’s Extension authorization; they do not need the streamer’s OAuth grant.

Studio cookies are Secure, HttpOnly and SameSite=Lax with a 12-hour lifetime. State-changing control endpoints require the session and CSRF token. Socket capabilities last at most five minutes and begin renewing after about three minutes. Transient refresh failures retry while the old credential remains valid; hard expiry clears access before reconnection. OBS can recover unattended with a fresh valid capability. A Studio socket loss stops speech and requires the streamer to enable the microphone again; recovery never silently rearms it. OBS uses a public-display capability in the URL fragment, exchanged through POST; it cannot read the live secret. Credentials and raw audio are not logged.

Broadcaster role protection stops accidental peeking with the broadcaster’s known account. It cannot stop a streamer using another account, watching a friend’s screen or receiving the word in ordinary Twitch chat. This is a social game, not a cryptographic guarantee against its own host.

## Build and review for later updates

1. Review the completed irch Opus staff review and repair confirmation, plus the final regression/CI results. Keep the PR draft if a blocking issue remains. See [REVIEW-DISPOSITION.md](./REVIEW-DISPOSITION.md).
2. Let the existing PR checks validate the application, Extension, landing, review-host and edge package. The new edge checks also build the selected static pilot assets.
3. Build the pilot frontend with `pnpm --filter @baited/edge-game build:pilot-assets`.
4. Build a separately named native Extension ZIP with `EXTENSION_TRANSPORT=edge` and the exact pilot API/Studio origin. [`pilot-extension.env.tmpl`](./pilot-extension.env.tmpl) supplies the public configuration and the Proton reference for the public Extension client ID. A ZIP built with fixture values is not upload-ready. Pass `--version` explicitly to `packages/app/scripts/build-extension.mjs` (the script defaults to 0.0.1), plus distinct `--out-dir` and `--zip` paths. Match the owner-selected Twitch version; the currently prepared pilot ZIP is labeled 0.0.3.
5. Review the actual Cloudflare account’s remaining included usage. The published allowances are shared with other projects; the $5 plan is not a hard spending cap.
6. Record the hostname, account, commit, test window, invited channels and stop procedure. The first activation is complete; changes to its scope or additional public routes need a separate owner decision.

No workflow deploys this game Worker. A later merge can still trigger the existing development landing/Card Lab workflow; that does not update the game backend. The active config uses one exact custom domain, with `workers_dev: false`, `preview_urls: false` and synthetic auth disabled. A local build or PR merge is not a deployment instruction.

## Completed activation and next owner steps

1. Complete: the existing paid Workers account contains the active Worker, its two SQLite Durable Object namespaces and static assets. No R2 bucket, D1 database or Container was needed for this deck-only pilot.
2. Already complete: the three dedicated keys are stored in Proton and all six secret bindings are present on the Worker. Keep these keys stable; do not regenerate them for an ordinary deployment.
3. Complete: `pilot-baited.maff.app` is the exact Worker custom domain and the pilot flag is true. Fixture and synthetic staging flags, workers.dev and preview URLs remain disabled.
4. Complete: the OAuth callback `https://pilot-baited.maff.app/auth/twitch/callback` and exact HTTPS/WSS pilot connections were saved in Twitch. The Worker permits the actual Twitch-hosted Extension origin. No wildcard origins were added.
5. Complete: the edge pilot ZIP is uploaded to Twitch version 0.0.3, returned to Hosted Test, and its MD5 matches `e0c01f07740576980001c31635e5164b`. The version was not submitted for review. Each test streamer still needs to install/activate that version on their own channel and select the panel or video-overlay placement.
6. EventSub inspection found zero existing application subscriptions before activation, so no old PC callback conflict was present. No subscriptions were created or deleted. Recheck if another environment reconnects. Then visit Studio over HTTPS. Sign in as `komediruzecki7` or `lakeeko`, approve the listed scopes, connect Twitch chat and verify the connection status. Only `komediruzecki7` can initiate the optional Baity authorization flow, using the configured bot account.
7. Replace the OBS source URL with the URL copied from this pilot Studio. Do not reuse the former PC server’s capability URL.
8. Enable the microphone and wait for Moonshine readiness. A different Twitch-allowlisted tester, such as Paolo, opens the native Twitch panel/video overlay on the testing streamer's channel. Begin one round and run the checks below before expanding the pilot.

No submission for Twitch review, production tag or public launch is part of this pilot.

## First live acceptance test

| Check | Pass condition |
| --- | --- |
| OAuth | Correct account signs in; non-allowlisted channel is denied; wrong/replayed OAuth state fails. |
| Secret separation | Viewer sees word and clues; broadcaster Extension, Studio and OBS do not see them during the round. |
| Real clues | A second account’s Twitch chat clue arrives once in Studio. Deleting a clue or timing out its author removes the hint. |
| Real Moonshine | Speech stays in the browser; spoken target produces a catch for streamer confirmation. Speak across the buzzer, try a sentence longer than ten seconds, then keep Studio hidden for six minutes while playing. |
| Result | Confirmation updates Studio, viewer and OBS consistently. |
| Interruption | Closing/disconnecting the microphone pauses the round; no false escaped win is awarded. Reload Studio mid-round: remaining time is preserved and the mic needs manual re-enabling. Try one short network interruption. |
| Reconnect | Refresh viewer/OBS and restore the current state; expired credentials cannot retain access. Leave OBS running unattended for at least 30 minutes across credential renewals. |
| Baity | Enabled announcements arrive without duplicate floods; off means no new queued announcements. |
| Stop | Disconnect chat and confirm Twitch subscription removal; close Studio and confirm the idle path separately. |
| Device | Native Twitch desktop, iPhone/tablet and the installed OBS Browser Source are checked with real accounts. |

Local fixture results do not establish these live outcomes. The first run is a functional test, not a load or cost benchmark. Do not launch a synthetic provider load generator under the current authorization.

## Storage, privacy and stopping

Room state includes the current round, bounded hint/review history, scores and command/event replay receipts. Control stores encrypted Twitch credentials, sessions, channel registration, bounded delivery retries and bot metadata. Audio is not sent; short final speech text can be used in catch/review state. Built-in artwork is static and public; the selected live word remains role-restricted.

This pilot does not expose Card Maker or account deletion UI. Data deletion is an operator task with a reviewed exact channel/resource list. Disconnecting ends ingestion; it does not erase stored state or revoke every upstream Twitch grant. Retention/deletion automation is a production follow-up, not an implicit promise of this test.

To end an ordinary test: finish/pause the round, disable the microphone, choose Disconnect chat, confirm subscription removal, sign out and remove the pilot OBS source. Failed Twitch DELETE requests remain in a durable retry queue; the UI must not claim removal before confirmation.

For a full pilot shutdown, disconnect each registered channel while the control service is still reachable and verify upstream subscription removal, verify the shared bot queue is drained/dropped, then set `EDGE_PILOT_ENABLED=false`, remove public routing and allow existing short-lived socket credentials to expire. Do not flip the flag before subscription cleanup: it also stops Control alarms and would stall pending deletion retries. A disabled gateway flag alone does not erase namespaces or instantly terminate every existing socket. If OAuth was revoked upstream or Twitch deletion fails, verify removal through the Twitch API before declaring ingestion stopped. Delete cloud data/resources only with an exact, approved retention decision. Do not wipe Control state while keeping Room state: connection revisions belong to the same deployment history and must be restored consistently.

Stop the test immediately if a live secret appears in a Studio/OBS/broadcaster frame, another channel’s state becomes visible, microphone pauses repeat on a stable connection, webhooks repeatedly return 503, a pilot subscription cannot be removed, or usage rises unexpectedly. Before first connection, verify account-level logging does not capture authorization headers and configure billing notifications; neither a notification nor the pilot limits is a hard spending cap.

## Follow-ups after a successful pilot

Measure actual Cloudflare request, duration and SQLite-write totals during normal use before increasing admission. Then address retained-data deletion/backup, operational alerts, hot-room fanout and sustained failure/load evidence. Custom cards require the separate trusted image scanning, approval and removal design; they must not be enabled by merely adding an R2 binding.
