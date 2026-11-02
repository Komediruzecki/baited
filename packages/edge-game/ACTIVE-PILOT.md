# Cloudflare pilot status

## Paolo's channel added to the pilot, 2 November 2026 at 14:13 Zagreb

The owner asked to add Paolo (`yahwehwastaken`) to the pilot. Provider version `6364f9ee-18e6-4339-aa0c-85f23fdab006` serves main `357ffc2` (PR #33), which sets `EDGE_CHANNEL_LOGIN_ALLOWLIST=komediruzecki7,lakeeko,yahwehwastaken` and `EDGE_MAX_CHANNELS=3`. It replaced `68a405e5-4e0c-4f89-84aa-a18d10d1e847` (card packs and welcome, `5ad1fed`), which is the rollback target. No allowlisted channel was live on Twitch at deploy time. The dry run listed the same 22 bindings as the previous receipt with only those two values changed, and the upload added 2 changed assets to the 159 already stored.

After the upload, `/health` returned 200 with `enabled:true`; `/studio`, `/studio/cards`, `/privacy` and `/speech-lab` returned 200; and the authenticated operator status read `running` at revision 3 with `limits.streamers: 3`. Both registered rooms (`komediruzecki7`, `lakeeko`) were available. Paolo's channel registers when he first signs into Studio; to run the Extension on his own channel during Hosted Test, his account also needs Twitch's Streamer Allowlist. No secret, Twitch setting, Extension ZIP, operator state or tag changed. This is the current deployment; the sections below are historical.

## Card packs and the new welcome deployed, 2 November 2026 at 12:10 Zagreb

The owner asked for Card Maker and a redesigned welcome screen on the pilot. Provider version `68a405e5-4e0c-4f89-84aa-a18d10d1e847` serves main `5ad1fed` (PR #31). It replaced `6fa0da92-9767-4984-b667-f10637f1c3f7` (Studio glass, `dece09b`), which is the rollback target. Neither allowlisted channel was live on Twitch at deploy time. The dry run listed the same 22 bindings as the previous receipt, and the upload added 10 changed assets to the 174 already stored, including the two welcome stage images.

Signed-in streamers can now save word packs in Studio's Cards tab (10 packs and 100 cards per channel; six cards at one difficulty make a pack playable) and deal one to the next round. Packs live in the channel's room Durable Object; card images stay off. After the upload, `/health` returned 200 with `enabled:true`, `/studio`, `/studio/cards`, `/privacy` and `/speech-lab` returned 200, the welcome images returned `image/webp`, and `/api/studio/cards` returned 401 without a session. A signed-out browser check found the new welcome sheet (wordmark, five cards, the pilot line, no microphone note) and the privacy page's card packs section. Nobody has used Cards signed in on the live pilot yet. No secret, Twitch setting, Extension ZIP, operator state or tag changed.

## Studio glass deployed, 2 November 2026 at 09:15 Zagreb

The owner asked for the Studio glass redesign on the pilot. Provider version `6fa0da92-9767-4984-b667-f10637f1c3f7` serves main `dece09b` (PR #29). It replaced `2b1b3860-2b04-48ae-a2bc-0acee1edf709` (Speech Lab retained clips and model recovery, `7320329`), which is the rollback target. Neither allowlisted channel was live on Twitch at deploy time. The operator state stayed at revision 3, running, with the same allowlist. The pilot assets match the previous receipt: 100 cards, Moonshine 0.1.5 and the pinned Whisper tiny files (58,500,668 bytes).

After the upload, `/health` returned 200 with `enabled:true` and `mode:allowlisted-pilot`, and `/studio`, `/privacy` and `/speech-lab` returned 200. A signed-out headless check found the sign-in sheet, the privacy sheet and the Speech Lab panels drawn as glass over the pixel field. No secret, Twitch setting, Extension ZIP or tag changed.

## Reopened for owner checks, 31 October 2026 at 04:13 Zagreb

The owner requested the updated pilot for testing. The authenticated operator control reopened it at **revision 3**, with `enabled:true`, `status:running` and the unchanged two-channel allowlist (`komediruzecki7`, `lakeeko`). Both rooms were available and idle, with no sockets, active sessions, connected chats, pending removals or queued announcements at the verification checkpoint. Enabling did not start a round or capture audio.

**Studio: [https://pilot-baited.maff.app/studio](https://pilot-baited.maff.app/studio)**. Sign in again, connect chat and enable the microphone. The Auto rounds and Baity shortcuts are beside Game settings; Show transcript is in the Microphone card.

The latest runtime was already deployed, so no redundant upload was needed. Provider version remains `500c0ba1-a9c8-4bbe-ad68-e50cc427eace`, runtime source `f2c546f`. All eight checks also passed for documentation head `5b8104b`. Public health returns 200 with `enabled:true` and `mode:allowlisted-pilot`; Studio returns 200; a signed-out session remains unauthenticated. The repository is private. No Twitch setting, ZIP or production tag changed.

This is the current state; the shutdown receipt below is historical. Sanitized activation proof: registered run `baited/2026-10-31/5515cac10f414f81b4e49383b80a0c46/evidence/reopened.json`.

## Owner-requested stop, 31 October 2026

The owner ended testing and requested a shutdown. The deployed `EDGE_PILOT_ENABLED` flag was set to `false` without changing the game source or removing credentials. Public `/health` confirmed `enabled: false`. A complete Twitch EventSub inspection found zero subscriptions with this pilot's exact callback; other callbacks were left untouched. The temporary inspection token was revoked.

The operator controls are now deployed, with the pilot durably **Stopped** at revision **2**. Enabling later must be an explicit operator action; saved completed scores and encrypted grants are retained. This status supersedes the historical activation notes below.

### Verified stopped deployment

| Item | Verified state |
| --- | --- |
| Runtime source | `f2c546fdd68ecf10f1975bcd6aa425a6554863a4` |
| Provider version | `500c0ba1-a9c8-4bbe-ad68-e50cc427eace`, deployed 30 October 23:51 UTC / 31 October 00:51 Zagreb |
| Master configuration | Enabled for operator management; durable gameplay switch **off** |
| Public health | 200, `enabled:false`, `mode:stopped` |
| Sign-in while stopped | 503, `pilot_stopped` |
| Unauthenticated operator status | 401 |
| Both registered rooms | Available, idle; zero viewer, Studio and OBS sockets or participants |
| Control activity | Zero connected chats, pending subscription removals, queued announcements or active sessions |
| Secrets | Six existing bindings retained; separate operator key added from Proton |
| Studio assets | Served JavaScript/CSS hashes match the verified local build |
| CI | All eight push/PR checks passed for `f2c546f` |

Deployment used the master-off phase first, then persisted and verified both Room stops before restoring the master configuration. The runtime remained stopped throughout. No Enable request, Twitch upload, landing release, production tag or new paid resource was created.

Studio now has Auto rounds and Baity shortcuts beside Game settings. New channels default announcements on; existing saved preferences remain unchanged. Automatic rounds and moderator commands remain off by default. This runtime also includes the preceding bot-ingress, 15-second catch confirmation, transcript and microphone-recovery repairs. The prepared native Extension copy/spacing ZIP has **not** been uploaded.

The local companyReportViewer integration is on `.dotfiles` branch `feat/baited-operator-console` (`4fdb7711`). Its real **Read status** click verified the stopped state above. It is a loopback-only console, separate from public Studio. Read a fresh status, enter a reason and type `enable` only when another test is wanted; then sign into Studio and connect chat/microphone again. Stop/Enable details are in [OPERATOR-CONTROL.md](./OPERATOR-CONTROL.md).

Sanitized provider, runtime and asset receipts: registered run `baited/2026-10-31/d3c22a37a66e41ef8959089dd63a4821/evidence/`. Console live proof: `baited/2026-10-31/7e657b04237a47fa91a80a3b24e98709/evidence/baited-console-stopped-live.png`.

## Historical activation receipt

Verified 30 October 2026 (Europe/Zagreb), after the owner authorized both invited streamer channels.

**Studio: [https://pilot-baited.maff.app/studio](https://pilot-baited.maff.app/studio)**

The cloud endpoint is active. The PC server and tunnel remain stopped. The repository stays private, the Extension remains in Hosted Test, and no review submission or production tag was made. The owner has confirmed a successful fresh Twitch sign-in. Full gameplay and device acceptance are tracked separately.

## Deployment receipt

| Item | Verified state |
| --- | --- |
| Worker | `baited-edge-pilot` |
| Provider version | `4658ebdf-534d-4e6b-a97d-5c4106832986` (pilot transcript display) |
| Public endpoint | Exact custom domain `pilot-baited.maff.app` |
| Alternate addresses | workers.dev and preview URLs disabled |
| Enabled mode | Real allowlisted pilot; POC, local fixture and synthetic staging auth disabled |
| Streamer allowlist | `komediruzecki7,lakeeko`; maximum two registered channels |
| Per-channel capacity | 100 distinct chat participants per round and 100 concurrent viewer sockets, with separate Studio/OBS capacity |
| Assets | Studio, OBS, built-in 100-card deck and pinned Moonshine runtime |
| State and secrets | Two SQLite Durable Object namespaces; all six existing secret bindings retained |
| Excluded features | Card Maker, uploads, custom decks, scanning, R2, D1 and Containers |
| Twitch package | Version 0.0.3 edge ZIP uploaded; Hosted Test confirmed; MD5 `e0c01f07740576980001c31635e5164b` |

The initial activation used runtime source `a102da0`. The current deployment adds the OAuth compatibility repair described below. This receipt supersedes the status in [INACTIVE-DEPLOYMENT.md](./INACTIVE-DEPLOYMENT.md), which is retained as a historical checkpoint.

### OAuth runtime repair

The owner's first real sign-in returned a generic 503. Production Twitch requests used `redirect: 'error'`, which workerd rejects before any network request. The older OAuth fixtures replaced this method and missed the runtime difference. The repair uses `manual`, explicitly rejects all 3xx responses without forwarding credentials, and retains the five-second abort.

A new offline native-workerd fixture failed all seven checks before the repair and passed afterward: successful POST/form/auth headers, 301/302/303/307/308 rejection after one original request, and timeout. Existing Control/OAuth tests and safe diagnostic tests also passed. Callback failures now expose only fixed phase/reason categories and bounded provider status; no callback queries, provider bodies, cookies or tokens are logged. Historical observability remains disabled. The owner confirmed that a fresh OAuth retry returned to Studio successfully. Do not reload or share a previously consumed callback URL.

The requested new irch Opus pass could not start because its previously verified isolated profile is logged out (`account_unavailable`). No alternative account was used. Independent source review and native regression proof completed; this is not a new Opus approval. The owner separately confirmed the live OAuth retry.

Repair evidence: registered run `baited/2026-10-30/95282fecd33c472c93d11146c8d7600f`.

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

At the initial activation checkpoint, the read-only Twitch inspection used an ephemeral app token that was revoked afterward; no subscriptions or user grants were created or deleted by that inspection. The owner subsequently confirmed Twitch sign-in. A complete recorded Moonshine/chat round, Paolo session, bot announcement and native OBS/device acceptance remain separate checks. No synthetic load or cost measurement ran.

Sanitized provider/HTTP receipts and the Studio screenshot are in registered run:
`/run/media/maff/Game_Shared/agent-out-live/baited/2026-10-30/587efe961f254b15b20a29a5b8659ab5/evidence/`.

Twitch settings/upload proof is in registered run:
`/run/media/maff/Game_Shared/agent-out-live/baited/2026-10-30/114bcbb9de9445db8e0b6315c74877b7/evidence/`.

## Run the first round

1. The testing streamer opens Studio and signs into Twitch as `komediruzecki7`, `lakeeko` or `yahwehwastaken`. Review and approve the requested permissions. Other logins cannot register a pilot channel.
2. In Studio, connect Twitch chat and wait for its connected status. The preflight found no subscription conflict; recheck if another environment has connected since then. Do not delete another callback automatically.
3. On that streamer's Twitch channel, install/activate Baited 0.0.3 from Hosted Test and choose the panel or video-overlay placement. During Hosted Test, each viewer needs Twitch's **Testing Account Allowlist** access. The **Streamer Allowlist** and backend streamer allowlist are separate: Paolo (`yahwehwastaken`) needs tester access to view the unreleased Extension on another channel, and, since 2 November 2026, the Twitch Streamer Allowlist to run it on his own.
4. Copy a fresh OBS URL from this Studio into the OBS Browser Source. The old PC-server URL cannot connect to this pilot. The OBS HUD shows public round information; the Twitch-native Extension separately shows the secret card to viewers and the card back to the broadcaster.
5. Enable the microphone and wait for Moonshine. Paolo opens the testing channel while signed into his own allowlisted Twitch account. Mobile viewers complete the acceptance steps below. Start one round; he should see the secret word and send a clue through chat.
6. Confirm the clue appears once in Studio. Say the target, confirm the catch, and check that Studio, Paolo's view and OBS agree on the result. The live secret must remain hidden in Studio, OBS and the broadcaster's Extension view.
7. Optional Baity announcements require separate bot authorization. Only `komediruzecki7` can initiate that operator flow, using the configured bot account. Then enable announcements in game settings.

Complete the interruption, renewal and device checks in [PILOT.md](./PILOT.md) before increasing admission or inviting more streamer channels.

For a one-screen setup, keep Twitch chat on a phone/tablet beside the PC. [Chat setup](./CHAT-SETUP.md) covers the installed Chatterino app, its floating desktop overlay and the separate public-chat widget plan for OBS.

For recording, use the [Arch/Hyprland setup guide](./recording/README.md) and [three-round conversation runbook](./recording/THREE-CLIPS.md). They separate the streamer's desktop chat, the recorded public HUD/chat and the viewer's secret-card capture.

### Viewer setup in the Twitch iOS app

1. Sign into the Twitch app with the account added to the **Testing Account Allowlist**, then open the testing streamer's live channel.
2. Open **Extensions**, select **Baited** and tap **Accept test extension** when prompted. Accepting the general notice that the channel uses Extensions does not complete this separate test acceptance.
3. Keep Baited's Extension view open while the streamer starts a round. The secret word and clues appear there during the round. The OBS video shows the shared public HUD/reveal; it does not replace the viewer's secret-card view.

If Baited is missing, check tester access and that the version is back in Hosted Test. The active version must have mobile support enabled with **Mobile Viewer Path = `viewer.html`**.

**Owner-confirmed, 30 October 2026:** a separate viewer account saw the secret card in the Twitch iOS app after tapping **Accept test extension**. This is a real-device viewer-flow result, not an automated test or a capacity benchmark.

## See what Moonshine heard

The exact pilot host now offers the existing opt-in transcript view. Other hosted production/dev origins keep it hidden; local/demo behavior is unchanged. This display does not reveal the card or change the speech transport.

Between rounds, reload Studio, enable the microphone and click **Show transcript** in the Microphone card. Start a round, say a short phrase and pause. Finalized phrases appear under **What your mic heard**; partial guesses are not shown. The view retains the last 12 phrases (at most 2,000 characters each) in this tab only. **Clear** empties the view; hiding, disconnecting or reloading erases it. Keep the panel out of stream capture.

Verification: the new exact-host assertion failed before the change, then all 15 transcript/local-speech tests passed. App typecheck and pilot asset build passed. Independent review found no hidden-card, transport or persistence change. The deployed Show/Hide control and empty state were checked in the signed-in Chrome Studio; real microphone phrases remain for the owner's test. No Extension ZIP, secrets or Twitch settings changed.

Transcript update evidence: registered run `baited/2026-10-30/094e2872a4754b77ba787aa2738c1e1a`.

## End or stop the test

For an ordinary test, pause/end the round, disable the microphone, disconnect chat and confirm subscription removal, then sign out and remove the pilot OBS source. Disconnecting does not erase stored scores, sessions or encrypted grants.

For a full pilot stop, use the local companyReportViewer Baited page: **Read status → Stop**, give a reason, type the confirmation and apply. Wait for **Stopped** with zero pending subscriptions and disconnected rooms. The durable stop denies new sessions and gameplay immediately; room shutdown and Twitch deletion retry until complete. An unfinished round is abandoned without awarding a result. Completed scores and encrypted grants remain stored.

**Enable** reopens admission only after cleanup finishes. It does not restart a round, microphone or Twitch chat connection. Streamers sign in again and reconnect those explicitly. The manual `EDGE_PILOT_ENABLED=false` provider setting remains an emergency master switch, but it also stops cleanup alarms; use the runtime control for normal stops. Removing a public route does not erase storage. Data deletion requires a separate exact retention decision.

The existing Workers paid account bills normal usage. Admission and ingress limits reduce abuse; they are not a hard invoice ceiling. See [the architecture and cost notes](./ARCHITECTURE-AND-COSTS.md) before changing capacity.
