# Inactive Cloudflare pilot: receipt and Twitch setup

Verified on 30 October 2026 (Europe/Zagreb). The owner authorized secret generation and an inactive deployment for **komediruzecki7 only**, with Twitch settings left to the owner. The private repository and PR remain private and unmerged. No production tag was created.

## What is complete

| Item | Verified result |
| --- | --- |
| Worker | `baited-edge-pilot`, deployed successfully |
| Runtime source | `a102da0`; one-channel deployment configuration in `a01db60` |
| Active provider version after secret upload | `83eb9d42-578c-4731-b18a-cec0e1d4783c` |
| Storage | Two SQLite Durable Object namespaces: `ChannelRoom` and `TwitchControl` |
| Assets | Selected Studio, OBS, built-in deck and pinned Moonshine runtime uploaded |
| Secrets | All six required bindings present; values never printed or written to plaintext files |
| Access | Only `komediruzecki7`, maximum one registered channel |
| Capacity | 100 distinct participants per round; separately, 100 concurrent viewer sockets |
| Public exposure | No custom domain, zone route, workers.dev address or preview URL |
| Flags | Pilot, POC, local fixture and synthetic staging flags all false |
| Other services | No R2 bucket, D1 database or Container created |

The Worker configuration API, secrets-name listing, subdomain settings, custom-domain listing, zone routes, current deployment and Durable Object namespace metadata were checked after deployment. This confirms configuration, not a successful live OAuth flow or game round. No Twitch subscriptions, grants, microphone test, load generator or cost measurement were started. The PC test server/tunnel remain stopped.

## Proton and Cloudflare secrets

The new Proton item **dev / baited-edge-pilot** contains three independently generated hidden fields:

- `eventsub-secret`: 32 random bytes encoded as hex, for Twitch webhook signatures.
- `token-encryption-key-base64`: 32 random bytes, for encrypting stored Twitch grants.
- `session-signing-key-base64`: a separate 32 random bytes, for short-lived Studio/OBS credentials.

All three were read back through Proton injection and matched the generated values. Existing fields in **dev / tw-bait-ids** resolve successfully, so the owner does not need to add OAuth credentials again. A real Twitch token exchange has not yet validated those credentials.

| Worker binding | Proton source |
| --- | --- |
| `TWITCH_CLIENT_ID` | `dev / tw-bait-ids / oauth-client-id` |
| `TWITCH_CLIENT_SECRET` | `dev / tw-bait-ids / oauth-client-secret` |
| `TWITCH_EXTENSION_SECRET_B64` | `dev / tw-bait-ids / ext-shared-secret` |
| `TWITCH_EVENTSUB_SECRET` | `dev / baited-edge-pilot / eventsub-secret` |
| `EDGE_TOKEN_ENCRYPTION_KEY_B64` | `dev / baited-edge-pilot / token-encryption-key-base64` |
| `EDGE_PILOT_SECRET_B64` | `dev / baited-edge-pilot / session-signing-key-base64` |

The six bindings were uploaded directly from the injected process environment through Wrangler stdin. Do not regenerate the encryption or signing keys during ordinary deployments. Do not put them in GitHub issues, Twitch form fields, client bundles or chat. The Cloudflare deployment token is an operator credential, not a runtime Worker secret.

## Cloudflare token permissions

The existing token in **dev / cf-irchiinnuss-api-token** is active. Workers, domains and zone metadata reads succeeded; the real Worker/assets deployment, Durable Object migration and secret upload prove the required write access for this inactive deployment. Reading the token's own permission-policy details returned HTTP 403, so no claim is made that its full policy was inspected.

Custom-domain write permission was not exercised because the public route is intentionally absent. No token permissions were broadened. Before activation, verify remaining account allowances and broader account logging settings; the existing Workers paid plan is not a hard spending cap. No new always-on Container was provisioned.

## Owner: exact Twitch changes

Open the [Twitch Developer Console](https://dev.twitch.tv/console). Use the existing OAuth application and Baited Extension; creating another app is unnecessary.

1. Under **Applications → the existing application → Manage**, add this OAuth Redirect URL and save, preserving redirects still needed by other environments:
   `https://pilot-baited.maff.app/auth/twitch/callback`
2. Under **Extensions → Baited → the intended editable test version**, set the following values. If the version is in Hosted Test, Twitch requires returning it to Local Test before editing version details. Avoid replacing an actively used test version by accident.

   | Setting | Exact value |
   | --- | --- |
   | Allowed HTTPS connection origin | `https://pilot-baited.maff.app` |
   | Allowed WebSocket connection origin | `wss://pilot-baited.maff.app` |
   | Panel viewer path | `viewer.html` |
   | Mobile viewer path | `viewer.html` |
   | Video overlay path | `overlay.html` |
   | Configuration path | `config.html` |

3. Upload the separately named **baited-v0.0.3-edge-pilot.zip** to the intended test version. Keep the panel/mobile/video-overlay placements you want to test. This package uses the edge transport and the exact pilot origin; the former PC/Node ZIP is not interchangeable. The prepared filename/version label is 0.0.3; rebuild with the intended label if you choose another version.
4. Keep `komediruzecki7` as the testing broadcaster. Keep `yahwehwastaken` and/or `lakeeko` in the Extension tester access list if they will join as viewers. The backend's one-streamer allowlist does not prevent them from being viewers.
5. After saving details and uploading the ZIP, transition the version back to **Hosted Test** so it serves the uploaded Twitch CDN assets. **Do not submit it for review or release it.** Console preparation and asset upload can happen now; working Studio sign-in, chat, Baity and OBS tests must wait until the backend is enabled and routed. At that later test, install/activate the intended version and panel/video-overlay placement on `komediruzecki7`.

The Worker already permits `https://54ysfu9jbragbdbvown2n8zrrli0g0.ext-twitch.tv`. No wildcard is needed. Do not add an EventSub webhook URL as an OAuth redirect: the backend registers its webhook after the appropriate authorization.

Official reference: [Twitch Hosted Test and version editing](https://dev.twitch.tv/docs/extensions/life-cycle/).

## Package and next activation

Prepared package: [edge pilot ZIP](/run/media/maff/Game_Shared/agent-out-live/baited/2026-10-29/7156c8cc3ce84c69992e7930a5c1c797/deliverables/baited-v0.0.3-edge-pilot.zip).

SHA-256: `0e1e2f46ba0e4ce0eb8b1550881fa16e0e0c16eb8e7f5c9283bb7af8f2f48bcf`; 66,171,159 bytes; 124 files. The ZIP has not been uploaded by this task.

The future Studio address is `https://pilot-baited.maff.app/studio`; it is **not live yet**. When the owner asks to start, add the exact reviewed custom domain, enable only the real pilot flag, inspect existing EventSub subscriptions for obsolete PC callbacks, then perform one functional round. Subscription cleanup must be scoped; never delete another environment's callback automatically. Copy a fresh OBS URL from that Studio after sign-in.

The streamer grant will request `user:read:chat`, `user:bot` and `channel:bot`; optional Baity authorization requests `user:write:chat` and `user:bot` on the bot account. The owner handles these authorizations. See [PILOT.md](./PILOT.md) for live acceptance and the stop procedure.

Sanitized provider evidence is retained in the registered output run `baited/2026-10-29/48db5f579bc54fc5b698f0f11746e298`, including `evidence/cloudflare-deployment-verification.json`. Permanent handoff copies live in `/home/maff/.dotfiles/personal/games/baited/cloudflare-pilot-2026-10-29`.
