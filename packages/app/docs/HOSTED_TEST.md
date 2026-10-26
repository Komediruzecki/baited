# Baited v0.0.1: Hosted Test with Paolo

This test serves the Extension panel from Twitch and runs the game backend on Maff's Linux PC through a named Cloudflare Tunnel. The repository stays private. Hosted Test is not a review submission or a public Extension release.

## Current setup boundary

On 26 October 2026, the named tunnel `baited-hosted-test` (`e0a71e03-a2e8-43c1-991b-90d5f9ec4d74`) and DNS route were created. The public health endpoint returned HTTP 200 over trusted HTTPS; cloudflared reported four ready connections. The backend and tunnel are bounded foreground test processes, so restart them when they expire.

The Cloudflare token in Proton `dev / cf-irchiinnuss-api-token` now has the tunnel and zone permissions needed for this setup. The tunnel's own token is stored separately in `dev / baited-hosted-tunnel / token`. Do not paste either value into chat or source files.

Twitch now has the 11.21 MB Extension ZIP, current logo/icon/discovery images, and an actual viewer UI screenshot. The saved name is Baited and the category is Games in Extensions. The broadcaster and Paolo are confirmed in the Testing Account Allowlist. The nonexistent fullscreen file was removed; the existing Mobile view now points to `viewer.html`.

Version 0.0.1 is now in **Hosted Test**. Twitch confirms CDN hosting and no longer shows the missing listing information warning. The owner approved OAuth successfully, and the real Studio shows **Twitch connected · @komediruzecki7**. The native configuration view loads from Twitch's CDN with `hosted_test` state and reports **Studio connected**. The broadcaster dashboard shows Baited 0.0.1 activated in **Panel 1**.

No review was submitted. Paolo joining, real chat delivery, the physical microphone with OBS, a complete round and the physical Twitch mobile app still need their own checks below.

## Addresses and test accounts

| Purpose | Value |
| --- | --- |
| Public game and Studio | `https://play-baited.maff.app` |
| Backend on this Linux PC | `http://127.0.0.1:3300` |
| OAuth callback | `https://play-baited.maff.app/auth/twitch/callback` |
| Broadcaster | `komediruzecki7` / Twitch ID `501062940` |
| Paolo | `yahwehwastaken` / Twitch ID `566058624` |
| Extension version | `0.0.1` |
| Viewer file | `viewer.html` |
| Existing Mobile view | `viewer.html` (physical Twitch mobile test pending) |
| Configuration file | `config.html` |
| Panel height | `500` |

The game hostname uses one label below `maff.app`. It is separate from the landing at `baited.maff.app` and its development site.

## Start the backend and tunnel

These commands assume the checked changes have been copied or fast-forwarded to `/home/maff/foss/twigame/bait-repository`. They work from any current directory. During implementation, use the corresponding absolute worktree paths instead.

Build the current application image once after a code change:

```sh
rtk proxy timeout 15m docker build -t baited-hosted-test:local /home/maff/foss/twigame/bait-repository
```

Start the backend in one terminal:

```sh
rtk proxy pass-cli run --env-file /home/maff/foss/twigame/bait-repository/packages/app/docs/baited.hosted-backend.env.tmpl -- node /home/maff/foss/twigame/bait-repository/ops/hosted-test.mjs backend
```

Start the named tunnel in a second terminal after its token has been stored in Proton:

```sh
rtk proxy pass-cli run --env-file /home/maff/foss/twigame/bait-repository/packages/app/docs/baited.hosted-tunnel.env.tmpl -- node /home/maff/foss/twigame/bait-repository/ops/hosted-test.mjs tunnel
```

Each process runs in the foreground and stops after three hours. Ctrl+C stops that process immediately; stop both terminals when the test is finished. Restart both with the same commands. An occupied backend port or container error fails rather than selecting another port. Keep this PC awake and connected during Paolo's test. This is a coordinated test service, not an unattended production deployment.

The backend runs as the image's non-root `node` user. Its root filesystem is read-only; `baited-hosted-test-data` is the persistent Docker volume. Do not delete that volume or replace the encryption key between sessions. The tunnel token is read through an anonymous pipe and is not put into cloudflared's arguments or environment. All credential values come from Proton Pass.

### Tunnel routing

Use a **named, remotely managed** Cloudflare Tunnel. Its ingress payload is in [`ops/hosted-tunnel-config.json`](../../../ops/hosted-tunnel-config.json):

- Hostname `play-baited.maff.app` routes to `http://127.0.0.1:3300`.
- Set `httpHostHeader` to `play-baited.maff.app` so the backend's Host check passes.
- The final unmatched route returns 404.
- Route the hostname's proxied DNS record to the created tunnel's `<UUID>.cfargotunnel.com` target.
- Store the returned tunnel token only in Proton `dev / baited-hosted-tunnel / token`.

There is no Access login page in front of this origin. Twitch panel requests use signed Extension JWTs and must receive the API response directly. The application still protects Studio with OAuth sessions and the native panel with JWT validation.

The container uses Linux host networking but binds its HTTP listener only to `127.0.0.1:3300`. `TRUSTED_PROXIES=127.0.0.1` trusts the immediate cloudflared hop. Express selects the rightmost untrusted address in `X-Forwarded-For`; a supplied `CF-Connecting-IP` header does not independently override it. Do not change this to blanket trust or publish the backend on all interfaces.

Do not substitute a Quick Tunnel. Cloudflare documents that Quick Tunnels do not support SSE, which Baited uses for live game state. See [Quick Tunnel limits](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) and [origin request settings](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/).

### Check the service

```sh
rtk proxy curl --fail --silent --show-error -H 'Host: play-baited.maff.app' http://127.0.0.1:3300/api/health
rtk proxy curl --fail --silent --show-error https://play-baited.maff.app/api/health
```

Both must return a successful health response. The public page must use trusted HTTPS. `/api/session` should report `demoAvailable: false`. Keep logs free of OAuth tokens, cookies and shared secrets.

## Build the upload ZIP

```sh
rtk proxy pass-cli run --env-file /home/maff/foss/twigame/bait-repository/packages/app/docs/baited.hosted-extension.env.tmpl -- pnpm --dir /home/maff/foss/twigame/bait-repository build:extension
```

Upload `packages/app/dist/baited-v0.0.1.zip`. Do not use `--local-preview`. The ZIP contains the panel/config frontend and public connection settings. The backend, signing secret, OAuth secret, encryption key and speech model do not belong in it.

## Twitch clicks

Open the [Twitch Developer Console](https://dev.twitch.tv/console) in the browser profile signed in as `komediruzecki7`. Use the existing application and Baited Extension, not newly created duplicates.

1. **Applications → existing OAuth application → Manage:** add the exact callback from the table above and save. Keep the existing localhost callback if local testing is still needed.
2. **Extensions → Baited → 0.0.1 → Manage:** stay in Local Test while editing details.
3. **Asset Hosting:** use Panel, `viewer.html`, height `500`, and `config.html`. The existing Mobile view also uses `viewer.html`; test it in the physical Twitch app before claiming support. There is no fullscreen file in this bundle. In the URL allowlists, allow the public game origin for backend network requests and external Studio navigation.
4. **Version Details:** use Baited, the current logo/discovery/screenshot assets in [`assets/twitch/v0.0.1`](../assets/twitch/v0.0.1/), and **Games in Extensions**. Use `hello@irchiinnuss.com` for contact; keep `https://baited.maff.app/terms` and `https://baited.maff.app/privacy`. Confirm the actual personal author name before review. If Twitch emails an author-verification link, the owner opens it.
5. **Access → Testing Account Allowlist:** add both account IDs from the table. A Streamer Allowlist controls a different capability; it is not a replacement for adding Paolo as a test account.
6. **Monetization:** leave Bits and Subscription support set to No.
7. **Files:** upload the rebuilt ZIP and wait for its processing result. Confirm that `viewer.html` and `config.html` are at the archive root.
8. **Status:** choose **Move to Hosted Test**. Stop there. Do not choose **Submit for Review**.
9. In [the broadcaster dashboard](https://dashboard.twitch.tv/u/komediruzecki7/extensions), open **My Extensions**, configure Baited if prompted, then activate it in Panel 1 (or another free panel slot).

These settings are based on the actual Baited panel architecture. Twitch's [life-cycle documentation](https://dev.twitch.tv/docs/extensions/life-cycle/) explains the separate Hosted Test and Review stages. Testers must accept the prerelease disclosure. People outside the testing allowlist can watch/chat normally but will not see this prerelease panel.

The required listing images are separate from the frontend ZIP: logo 100×100 PNG, discovery 300×200 PNG, and at least one 4:3 screenshot at 1024×768 or larger, below 10 MB. A 24×24 taskbar icon is only required for a video-component Extension, but an export is supplied for future use. See [Version Details requirements](https://dev.twitch.tv/docs/extensions/life-cycle/#version-details). Use real UI screenshots; replace staged screenshots with a recorded real test before review where appropriate.

## Run one round with OBS and Paolo

1. Open [Studio](https://play-baited.maff.app/studio) and connect `komediruzecki7`. Review Twitch's requested `user:read:chat` permission and approve it yourself. Wait until Studio says Twitch is connected.
2. Click **Enable microphone**, read the consent screen, then allow the intended microphone in the browser. The first use downloads Moonshine. Keep the Studio tab open and wait until the microphone is ready. No Deepgram key is needed.
3. In Studio's **Stream setup**, copy **OBS overlay URL**. In OBS, add **Sources → + → Browser**, paste it, and set 1920×1080. Capture game/camera plus this source. Keep the viewer panel and its secret word out of the scene. Capture Studio sound once if sounds are enabled; the overlay itself stays silent.
4. Paolo signs in as `yahwehwastaken`, opens [your channel](https://www.twitch.tv/komediruzecki7), reloads after the allowlist change, and accepts the prerelease disclosure. He should see Baited in the channel panels.
5. Start OBS streaming when both people are ready. Start a round in Studio. Paolo checks that he sees the target card while Studio and OBS keep its word hidden.
6. Paolo sends clues in normal Twitch chat. Check that the Studio receives his live messages. Say the target naturally in a sentence. When Moonshine proposes a catch, confirm it only if it was correct.
7. Verify the confirmed result appears in Paolo's panel and the OBS source. Run an escape or pause/resume round too. Reject an intentionally mistaken catch and verify it does not award a win or reveal the word on OBS.

Moonshine hears the microphone granted to Studio, not arbitrary audio from the Twitch video player. Recognition runs on the streamer's computer. Final text and timing go to the game server for matching. A public HTTPS origin is a different browser permission/storage context from localhost, so grant the mic again and expect its first model load.

## Acceptance record

Check these only after observing them in the real hosted session:

- [x] Public health responds over trusted HTTPS (26 October 2026).
- [ ] Studio completes its full hosted interaction without browser errors.
- [x] Existing Extension version 0.0.1 is in Hosted Test, with the uploaded ZIP processed.
- [x] Owner-approved Twitch OAuth completes and Studio shows `komediruzecki7` connected.
- [x] Native configuration loads from Twitch's CDN in `hosted_test` state and reports Studio connected.
- [x] Broadcaster dashboard shows Baited 0.0.1 activated in Panel 1.
- [x] Broadcaster's native viewer loads from Twitch's CDN, both inline on the channel and in the pop-out, and shows the waiting state.
- [ ] Broadcaster and Paolo both see the panel from Twitch's CDN.
- [ ] Studio receives Paolo's real chat messages.
- [ ] Physical microphone and Moonshine work while the intended OBS scene is running.
- [ ] Active target stays hidden in Studio and OBS; Paolo sees it.
- [ ] Confirmed catch, rejected catch, pause/resume and escape show the intended results.
- [ ] Reload/reconnect does not duplicate scoring or replay an old result sound.
- [ ] Real screenshots and a short OBS recording are saved for the later review package.

Do not interpret automated API tests, mock JWTs or a local preview as completion of these checks. The repository remains private and no Twitch review is submitted by this runbook.
