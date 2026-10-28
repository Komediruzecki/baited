# Baited development and production hosts

Prepared 28 October 2026. The owner chose to move the existing PC test to the development hostname, preserving its cards, scores and authorization store. This document describes the cutover and rollback; it is not proof that either has been performed. Record the actual health, authorization and Twitch checks separately.

Current preparation receipt: the additional dev OAuth callback was saved in Twitch; the Docker image and dev-targeted ZIP were built and checked. Cloudflare's read-only migration preflight passed. No DNS/tunnel mutation or backend restart has happened. Extension 0.0.3 is back in Hosted Test with the owner's `overlay.html` setting; its uploaded ZIP was not replaced. The owner will update Twitch themselves. Coordinate that upload and allowlists with the host cutover so the existing Extension keeps its API connection.

## One PC test, with a rollback profile

| | Development test after migration | Previous profile / rollback |
| --- | --- | --- |
| Origin | `https://dev-play-baited.maff.app` | `https://play-baited.maff.app` |
| Compute | This Linux PC through the existing named Cloudflare Tunnel | Same PC, only when dev is stopped |
| Speech preview | Available to the authenticated streamer; Show transcript is opt-in | Disabled |
| Demo/simulated chat endpoints | Disabled | Disabled |
| Local port | 3301 | 3300 |
| Docker image | `baited-dev-test:local` | `baited-hosted-test:local` |
| Writable data | `baited-hosted-test-data` | Same volume, never mounted by both runtimes together |

This is a move, not a second game instance. Both profiles refer to the existing data volume and the same Proton encryption key. Only one backend may write that volume. The launcher checks Docker's running-container volume index before starting and fails closed when the volume is in use or Docker cannot answer. Do not start both profiles concurrently or bypass the launcher with a second manual container.

The dev image has a different tag so the previous image remains available for rollback. Saved rooms, scores, packs, artwork and encrypted OAuth grants stay in the volume. Browser sessions are in memory and host-bound, so the streamer signs in again after the move. Stored bot authorization may still be valid; inspect its status before asking for another consent.

The development profile still runs with `NODE_ENV=production`, loopback binding, exact Host/Origin checks and `ENABLE_DEMO=false`. Speech diagnostics are a narrow capability, not a general insecure debug mode.

## Why the transcript is missing today

The original client only shows transcripts for demo rooms or loopback hosts. A real Twitch room at `play-baited.maff.app` fails that check, even while Moonshine detects words successfully.

The new `ENABLE_SPEECH_DIAGNOSTICS=true` flag is accepted only with the exact `PUBLIC_URL=https://dev-play-baited.maff.app`. It exposes a capability in the authenticated Studio response. The client checks both that capability and the dev hostname before showing or buffering speech.

In dev Studio: open the Play screen, find **Speech test** under Microphone, choose **Show transcript**, enable the microphone, then start a round. Speak a short phrase and pause. Moonshine emits completed phrases here, not partial guesses. Recognition is active during a round; a ready microphone alone does not start transcription.

The preview keeps at most 12 completed phrases in tab memory. Hide, reload, disconnect or permission revocation clears it. It adds no transcript persistence or upload. Existing gameplay still sends final text/timing to the backend for word matching; raw microphone audio stays in the browser.

## Who sees the secret card

| Surface | Broadcaster | Viewer |
| --- | --- | --- |
| Native Twitch panel/video overlay | Back while the round is live, based on Twitch's verified role | Front with word and clues |
| OBS Browser Source | Shared round HUD; no active target | Same encoded HUD |
| Standalone viewer link | New server guard rejects the signed-in owner before JSON or SSE sends the card | Public viewer projection |

The new standalone-link check prevents accidentally opening one's own card while signed in. It cannot identify the streamer in incognito, after removing cookies, on another account/device, or through an anonymous stream opened before sign-in. No game where viewers know the answer can prevent deliberate sharing of that answer.

Use the native Twitch Extension as the normal viewer entry at launch. If public standalone access is unwanted, a later production policy can disable that route or require Twitch viewer sign-in. That broader access change is not enabled by this patch, so existing guest viewer links continue to work.

## Migration checklist

1. In the existing Twitch OAuth application's redirect URLs, **add** `https://dev-play-baited.maff.app/auth/twitch/callback`. Keep `https://play-baited.maff.app/auth/twitch/callback` for rollback. No new secret is needed for adding a redirect.
2. Build the dev image from this branch using the root Dockerfile. Keep the previous `baited-hosted-test:local` image unchanged. Prepare the matching dev Extension ZIP and its settings before interrupting a test.
3. Finish any active round and stop the exact current backend container. Leave the named tunnel running. Confirm no running container mounts `baited-hosted-test-data`; the launcher's preflight repeats this check.
4. Take a protected, consistent backup of the stopped volume, including card packs and artwork. Do not print or inspect its credential-bearing contents. Retain the current encryption key in Proton; changing it would make the existing token vault unreadable.
5. Start the backend with the reference-only `docs/baited.dev-backend.env.tmpl` through `pass-cli run`, then `node ops/hosted-test.mjs backend`. The `dev` profile uses port 3301 and **the existing `baited-hosted-test-data` volume**. Do not create or copy into a fresh dev store for this migration.
6. Add the exact hostname route to the existing `baited-hosted-test` tunnel: `dev-play-baited.maff.app` → `http://127.0.0.1:3301`, with HTTP Host Header `dev-play-baited.maff.app`. Add its proxied DNS record. Preserve unrelated ingress entries and keep the previous play route recorded for rollback. This is routing to the PC, not cloud compute activation.
7. Reuse the already-running named-tunnel connector. Do not start a second copy on metrics port 20249. The launcher remains bounded to three hours by default.
8. Open dev Studio and sign in again. Check saved packs, artwork, scores and bot status. Copy the new standalone viewer and OBS URLs from Setup; their room identities remain, but their origin changes.
9. Check dev health, OAuth callback, live chat, Moonshine speech preview, owner-viewer denial and the matching native Extension. Confirm the old hostname is handled intentionally; it must not silently serve an independent game store.

Do not run the original one-host provisioning script to add this route: it writes a one-host ingress configuration and could remove unrelated entries. Preserve them in the migration configuration.

`ops/move-hosted-test-to-dev.py` performs a read-only preflight by default. With `--apply`, it creates only the exact dev DNS record and replaces the old PC ingress with dev port 3301, preserving unrelated routes and origin settings. It rechecks the configuration before writing and verifies read-back. The old play DNS record remains with an explicit 404 route until a deliberate rollback or cloud cutover. Run it through `ops/cloudflare.env.tmpl`; it does not create compute or print API tokens.

## Extension bundles stay attached to one backend

The earlier `baited-v0.0.3.zip` points to `play-baited.maff.app` for both its API and Studio. Rebuild a separately named ZIP through `docs/baited.dev-extension.env.tmpl`, which sets both origins to `https://dev-play-baited.maff.app`. Keep the old ZIP and its receipt for rollback.

For the editable 0.0.3 test version, return to **Local Test**, upload the new ZIP, then return to **Hosted Test**. If Twitch no longer permits edits to that version, prepare a new test version instead. Do not submit for review as part of this migration.

In Twitch Asset Hosting, preserve:

- Panel and mobile viewer: `viewer.html`; panel height 500.
- Configuration: `config.html`.
- **Video – Fullscreen / Video Overlay** support: `overlay.html`. A version showing only Panel and Mobile does not have the video overlay enabled, even when that file is in its ZIP.

In **Capabilities**, set the URL Fetching and Image Domain allowlists to `https://dev-play-baited.maff.app`, and the configuration navigation allowlist to `https://dev-play-baited.maff.app/studio`. Preserve unrelated approved entries. Keep any old origin only while an intentional compatibility route needs it.

Then configure and activate the intended view on `komediruzecki7`. Verify the installed version, broadcaster's card back, Paolo's card face and custom artwork on Twitch. Uploading a file does not prove the channel has activated it. The native Twitch video overlay and the separate OBS Browser Source are different surfaces.

An ordinary redirect from the old API hostname cannot keep the old ZIP working: its fetches reject redirects. A transparent API proxy could preserve state and artwork, but its configuration client also requires the server's Studio URL to match the old baked origin. Do not expose the whole dev application under the old hostname to work around that check. The smallest complete migration uses the matching ZIP. Any temporary old-origin API compatibility must be narrow, keep JWT/role checks intact and handle the configuration origin explicitly.

## Rollback without losing history

Stop the dev backend first and confirm the shared volume is idle. Start `HOSTED_TEST_PROFILE=current` with the retained previous image and the **same** volume and encryption key. Restore the recorded play-host tunnel route to port 3300, use the old matching Extension ZIP/settings and sign in again at the old hostname.

This patch changes no stored-state schema. Rolling back the runtime retains game data saved during dev testing. Do not restore an older volume backup merely to switch runtimes: that would discard newer scores, packs and artwork. Keep the backup for a diagnosed data-recovery need.

## Cloud production remains parked

The domain name does not determine where computation runs. The moved `dev-play-baited` test still runs on this PC through Tunnel. Permanent production at `play-baited` remains a separate cutover with a chosen provider, data transfer, secret configuration, live checks and explicit activation approval. This migration does not activate paid compute or create a release tag.

Cloudflare's [Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) describes connecting an existing server through its connector; a tunnel does not itself host the Baited process.
