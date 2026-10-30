# Active Cloudflare pilot

Verified 30 October 2026 (Europe/Zagreb), after the owner authorized both invited streamer channels.

**Studio: [https://pilot-baited.maff.app/studio](https://pilot-baited.maff.app/studio)**

The cloud endpoint is active. The PC server and tunnel remain stopped. The repository stays private, the Extension remains in Hosted Test, and no review submission or production tag was made. The first real round on this deployment is still pending.

## Deployment receipt

| Item | Verified state |
| --- | --- |
| Worker | `baited-edge-pilot` |
| Provider version | `f35137d9-9393-44b6-8124-16b1bc94370e` |
| Public endpoint | Exact custom domain `pilot-baited.maff.app` |
| Alternate addresses | workers.dev and preview URLs disabled |
| Enabled mode | Real allowlisted pilot; POC, local fixture and synthetic staging auth disabled |
| Streamer allowlist | `komediruzecki7,lakeeko`; maximum two registered channels |
| Per-channel capacity | 100 distinct chat participants per round and 100 concurrent viewer sockets, with separate Studio/OBS capacity |
| Assets | Studio, OBS, built-in 100-card deck and pinned Moonshine runtime |
| State and secrets | Two SQLite Durable Object namespaces; all six existing secret bindings retained |
| Excluded features | Card Maker, uploads, custom decks, scanning, R2, D1 and Containers |
| Twitch package | Version 0.0.3 edge ZIP uploaded; Hosted Test confirmed; MD5 `e0c01f07740576980001c31635e5164b` |

The runtime source remains `a102da0`; activation changes only the deployment configuration and operator documentation. This receipt supersedes the status in [INACTIVE-DEPLOYMENT.md](./INACTIVE-DEPLOYMENT.md), which is retained as a historical checkpoint.

## What passed

| Check | Result |
| --- | --- |
| Cloudflare metadata | Enabled pilot, exact domain, two-channel limits, retained secrets and disabled alternate public URLs confirmed |
| `GET /health` | 200; `enabled: true`, mode `allowlisted-pilot` |
| `GET /studio` | 200; Connect Twitch screen rendered in the in-app browser |
| Signed-out `GET /api/session` | 200; `authenticated: false`, runtime `edge` |
| Protected session and room state without credentials | 401 |
| Unsigned EventSub POST | 403 JSON denial |
| Card Maker and Card Lab | 404 |
| Existing EventSub subscriptions | Zero application subscriptions; complete read-only inspection, with no old PC callback conflict |

The Twitch inspection used an ephemeral app token that was revoked afterward. No subscriptions or user grants were created or deleted. A real owner OAuth grant, chat connection, microphone round, Paolo session, bot announcement and native OBS playback have not yet been tested on this cloud deployment. No synthetic load or cost measurement ran.

Sanitized provider/HTTP receipts and the Studio screenshot are in registered run:
`/run/media/maff/Game_Shared/agent-out-live/baited/2026-10-30/587efe961f254b15b20a29a5b8659ab5/evidence/`.

Twitch settings/upload proof is in registered run:
`/run/media/maff/Game_Shared/agent-out-live/baited/2026-10-30/114bcbb9de9445db8e0b6315c74877b7/evidence/`.

## Run the first round

1. The testing streamer opens Studio and signs into Twitch as `komediruzecki7` or `lakeeko`. Review and approve the requested permissions. Other logins cannot register a pilot channel.
2. In Studio, connect Twitch chat and wait for its connected status. The preflight found no subscription conflict; recheck if another environment has connected since then. Do not delete another callback automatically.
3. On that streamer's Twitch channel, install/activate Baited 0.0.3 from Hosted Test and choose the panel or video-overlay placement. Twitch tester access and the backend streamer allowlist are separate: Paolo (`yahwehwastaken`) needs tester access to view the unreleased Extension, but does not need to be a pilot streamer.
4. Copy a fresh OBS URL from this Studio into the OBS Browser Source. The old PC-server URL cannot connect to this pilot. The OBS HUD shows public round information; the Twitch-native Extension separately shows the secret card to viewers and the card back to the broadcaster.
5. Enable the microphone and wait for Moonshine. Paolo opens the testing channel while signed into his own allowlisted Twitch account. Start one round; he should see the secret word and send a clue through chat.
6. Confirm the clue appears once in Studio. Say the target, confirm the catch, and check that Studio, Paolo's view and OBS agree on the result. The live secret must remain hidden in Studio, OBS and the broadcaster's Extension view.
7. Optional Baity announcements require separate bot authorization. Only `komediruzecki7` can initiate that operator flow, using the configured bot account. Then enable announcements in game settings.

Complete the interruption, renewal and device checks in [PILOT.md](./PILOT.md) before increasing admission or inviting more streamer channels.

## End or stop the test

For an ordinary test, pause/end the round, disable the microphone, disconnect chat and confirm subscription removal, then sign out and remove the pilot OBS source. Disconnecting does not erase stored scores, sessions or encrypted grants.

For a full shutdown, first disconnect both registered channels while the control service is reachable. Confirm Twitch subscription removal and drain/drop pending bot announcements. Then set `EDGE_PILOT_ENABLED=false`, remove the custom-domain route and redeploy; keep workers.dev and previews disabled. Do not disable the flag before subscription cleanup, because Control alarms also stop. Failed provider deletion needs verification and retry before declaring ingestion stopped. Removing a public route does not erase storage or instantly terminate existing sockets. Data deletion requires a separate exact retention decision.

The existing Workers paid account bills normal usage. Admission and ingress limits reduce abuse; they are not a hard invoice ceiling. See [the architecture and cost notes](./ARCHITECTURE-AND-COSTS.md) before changing capacity.
