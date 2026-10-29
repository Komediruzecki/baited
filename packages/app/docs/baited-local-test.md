# baited v0.0.1: local review and first Twitch test

This branch adds the native viewer panel, broadcaster configuration page, signed Twitch Extension requests and a frontend-only ZIP. It remains private and undeployed. The existing bomb/card artwork stays intact while the new `baited` branding awaits design review. Extension version `0.0.1` is separate from the game package and landing release tags.

## Two local views

- **UI review:** <http://127.0.0.1:3322/>. The labelled fixture preview exercises the actual panel and configuration UI with sample round states. Its simulated Helper and requests are confined to the preview server and are excluded from the Extension ZIP. It does not prove Twitch installation, chat or speech recognition.
- **Real game studio:** <http://localhost:3000/studio>. This uses the existing Twitch OAuth flow, real EventSub chat and local Moonshine. Demo input is disabled. The Extension's local HTTPS frontend/API is <https://localhost:3443/viewer.html>; opened outside Twitch it waits for Twitch authorization.

The first real installation is limited to this computer. Paolo cannot reach these loopback addresses from another computer. A reachable HTTPS backend needs a separate deployment decision after local review.

For the current session, install and check the broadcaster connection locally first. Paolo confirmed he is remote, so his test is deferred. A later second account can use another local browser profile; a remote computer needs an explicitly arranged private connection or a separately approved hosted test backend. No public tunnel is part of this setup.

## Stored credentials

All launch templates contain references only. Do not create `.env` or paste secret values into commands, chat, frontend code or the Developer Console's public fields.

| Purpose | Proton reference |
| --- | --- |
| OAuth application | `pass://dev/tw-bait-ids/oauth-client-id` and `oauth-client-secret` |
| Extension public ID | `pass://dev/tw-bait-ids/ext-client-id` |
| Extension shared/signing key | `pass://dev/tw-bait-ids/ext-shared-secret` |
| Persistent OAuth-token encryption | `pass://dev/tw-bait-runtime/token-encryption-key` |
| Local TLS | `pass://dev/tw-bait-local-tls/certificate` and `private-key` |

The encryption key was generated from 32 random bytes, stored as a hidden field and verified by read-back without displaying it. It protects a fresh local data directory at `/home/maff/.local/share/baited/local-v0.0.1`. Keep the same key for this directory. Existing game data was not migrated or overwritten.

The local certificate covers `localhost` and `127.0.0.1`, expires **24 November 2026**, and is self-signed. It was not installed in the system trust store. Before an embedded Local Test, visit <https://localhost:3443/viewer.html> directly in the same browser and handle its local certificate warning. The SHA-256 fingerprint is `e84d183eb7738b6add24594b6b363b471782e72dd9876088ae9156152717a433`. An iframe may still require browser-specific certificate trust. Do not disable browser certificate validation globally. The certificate's private key remains in Proton.

## Build and restart

Run once after source changes, from any directory:

```sh
pnpm --dir /home/maff/foss/worktrees/twigame/baited-v0.0.1 build
pass-cli run --env-file /home/maff/foss/worktrees/twigame/baited-v0.0.1/docs/baited.extension-build.env.tmpl -- node /home/maff/foss/worktrees/twigame/baited-v0.0.1/scripts/build-extension.mjs
```

The Extension build writes `dist/extension/` and `dist/baited-v0.0.1.zip`. The ZIP contains only an explicit list of frontend files and fonts. It includes the public Extension ID and endpoint origins, never shared keys, OAuth secrets, fixtures, game data or Moonshine models. This local build points to localhost; rebuild with the approved hosted origins before a future Hosted Test.

Start these in three terminals:

```sh
# UI review: strict 127.0.0.1:3322, sample data, no credentials.
env EXTENSION_PREVIEW_PORT=3322 EXTENSION_PREVIEW_SECONDS=10800 node /home/maff/foss/worktrees/twigame/baited-v0.0.1/scripts/preview-extension.mjs

# Real game: strict 127.0.0.1:3000, public origin http://localhost:3000, Moonshine.
pass-cli run --env-file /home/maff/foss/worktrees/twigame/baited-v0.0.1/docs/baited.local.env.tmpl -- node /home/maff/foss/worktrees/twigame/baited-v0.0.1/scripts/rehearse-local.mjs

# Local Extension: strict 127.0.0.1:3443, HTTPS, fixed read-only game API proxy.
pass-cli run --env-file /home/maff/foss/worktrees/twigame/baited-v0.0.1/docs/baited.extension-https.env.tmpl -- node /home/maff/foss/worktrees/twigame/baited-v0.0.1/scripts/serve-extension-local.mjs
```

Each server stops after three hours. Ctrl+C stops that terminal's server immediately. Occupied ports fail rather than switching to another port. Restart the HTTPS server after rebuilding its frontend: it serves an in-memory snapshot. Proton must already be signed in. Launcher errors name missing fields without printing values.

## Install the real panel on Twitch

1. In [Developer Console → Applications](https://dev.twitch.tv/console/apps), open the existing OAuth app and confirm this exact callback: `http://localhost:3000/auth/twitch/callback`. Open the studio using **localhost**, not `127.0.0.1`, and connect as **komediruzecki7**. Complete consent yourself. Moonshine requires no Deepgram or ElevenLabs key.
2. In [Developer Console → Extensions](https://dev.twitch.tv/console/extensions), open the existing **Bait The Streamer** Extension, version **0.0.1**, in **Local Test**. Those names and the owner `komediruzecki7` were verified in the console. Use **Panel**, **Video - Fullscreen** (the overlay card), or both; the mobile view is not implemented. An organization is not needed for this first test.
3. Set **Testing Base URI** to `https://localhost:3443/`, **Panel Viewer Path** to `viewer.html`, **Video - Fullscreen Viewer Path** to `overlay.html`, **Configuration Path** to `config.html`, and panel height to **500 px**. If this console version asks for an external fetch/domain allowlist, allow only `https://localhost:3443` for this build. Keep the HTTPS gateway running.
   In **Capabilities**, use **Custom/My Own Service** for configuration, leave **Required Per Channel Configuration** empty, and keep **Request Identity Link** and **Chat Capabilities** off. The game reads chat through the separate OAuth application, not Send Extension Chat Message. If an external configuration-link allowlist is requested, the local studio URL is `http://localhost:3000/studio`. Do not choose a required Twitch Configuration Service version: this build uses its own backend and does not publish that configuration marker.
4. Under **Access → Testing Account Allowlist**, search for and select the host `komediruzecki7` (ID `501062940`). The host is already selected. When the second-account test is ready, add `yahwehwastaken` (ID `566058624`) there. The current UI accepts usernames or IDs, rather than a comma-separated text field. This is not the separate Streamer Allowlist.
5. Choose **View on Twitch and Install**, install, configure, then **Activate → Set as Panel** in Creator Dashboard. Configuration shows the channel resolved from Twitch's signed token; **Open streamer studio** opens the separate studio. No manual channel ID or room password is needed.
6. Open the host's channel in the allowlisted viewer's separate browser profile on this computer. Use that viewer's own Twitch session. The broadcaster's panel deliberately omits the active target. A viewer or moderator sees the target and forbidden clues.
7. To test the card overlay, choose **Activate → Set as Overlay** instead. During a round, the viewer profile sees the card face up on the video; the broadcaster's own session sees its back and the clock. A decided round turns over for both, then the overlay clears after 12 seconds. A streamer can still see the word by watching signed out, so this remains a no-peeking rule.

These console steps follow Twitch's [Local Test guide](https://dev.twitch.tv/docs/tutorials/extension-101-tutorial-series/local-test/) and [Extension lifecycle](https://dev.twitch.tv/docs/extensions/life-cycle/). Current installed behavior must still be verified in Twitch; local UI fixtures and generated signed test tokens are not real Twitch authorization.

### Verified on 25 October 2026

- The real studio signed in as `komediruzecki7` and showed **Twitch connected** after owner OAuth consent. The microphone remained off and no round was started by the agent.
- The existing Extension is installed and activated as **Panel 1**. The base URI, viewer/config paths, custom configuration and local URL allowlists were saved and verified after reload.
- The owner opened the direct HTTPS viewer successfully. Both native HTML routes returned 200 with the exact local certificate verified.
- The embedded configuration remained blank. A bounded gateway trace saw the direct test request but no Twitch config request. Chrome Local Network Access or a pending Twitch supervisor frame are candidates, not a confirmed diagnosis. A real installed panel round is still pending.

For local iframe troubleshooting, prefix the HTTPS launch command with `env EXTENSION_DIAGNOSTICS=1`. This opt-in trace records only method, recognized path, response status and whether a query exists. It stops after 100 requests or five minutes; it never logs headers, JWTs or query contents. It does not relax TLS, CORS or browser permissions.

The separate landing package now contains `/terms` and `/privacy` for the personal Extension test, with `hello@irchiinnuss.com` as contact. The Irchiinnuss maker branding on the landing does not change the submitted project's personal ownership. Twitch currently links to the production policy URLs; deploying these pages to development alone does not repair those production links.

Before formal review, resolve deletion on authorization revocation, Extension-uninstall handling and a participant deletion/opt-out process. The test policy describes the current distinction between disconnecting and **Delete my data**; it does not claim those review requirements are already implemented.

## First real round

1. In the studio, enable the microphone, wait for Moonshine to load, and choose the intended mic when the browser asks. Use headphones. The approximately 84 MB model downloads on first use and runs in the studio's worker, not the Extension panel.
2. Confirm OBS offers **Sources → + → Browser**. Add the studio's **OBS overlay URL** at 1920 × 1080. Do not capture the secret viewer page. The browser captures the mic independently of OBS. Start a local recording before going live.
3. Start a round. Paolo reads the panel and posts a real Twitch hint. Say the target naturally; confirm Moonshine's proposed catch only when it is correct. Check that the panel and OBS show one result and one score change.
4. Reject a false candidate, pause/resume, try `!skip`, allow a timeout, and reload the panel. Check reconnection and absence of duplicate results. Record speech-to-candidate and confirmation-to-panel/OBS delays.

Human-microphone accuracy, the actual OBS Browser Source, real OAuth consent/EventSub delivery, Twitch iframe trust and a complete installed round remain owner-assisted acceptance checks. The earlier synthetic speech scores do not establish these. The panel polls while visible and backs off on errors; it does not add purchases, votes, sound or microphone access.

## After local acceptance

Choose the reachable backend and host cost, repeat from Paolo's computer, then prepare Hosted Test. Keep the existing [brand/export plan](baited-v0.0.1-plan.md) for logo, discovery image and truthful screenshots. Do not use the fixture UI or staged landing movie as evidence of a live installed round. The [master plan](master-plan.md) covers the later review packet and gameplay follow-ups. No deployment, tag, review submission or new logo generation is included in this build.
