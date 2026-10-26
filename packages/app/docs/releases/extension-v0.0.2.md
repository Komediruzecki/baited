# Baited Extension v0.0.2: Hosted Test receipt

27 October 2026. Private repository; no Twitch review submission, public Extension release, production tag or landing deployment.

## Uploaded artifact

- File: `baited-v0.0.2.zip`
- ZIP bytes: 52,171,815 (Twitch displays 49.75 MB)
- Files: 92, including the redesigned native viewer/configuration and all 78 card illustrations.
- SHA-256: `a1a5b728a7901c65dff56b13cc0eb502f4782833c29337d11dbf76f355105cfd`
- MD5: `6a0b0aaef3a23aa4a638091de1be3b82`, matching Twitch's uploaded-file receipt.
- ZIP integrity check passed. The builder's explicit file allowlist excludes backend code, credentials, speech models and Card Lab.
- Release label: `0.0.2`. The compatible panel/API wire schema remains `0.0.1`.

The version was cloned from v0.0.1 to retain the existing details and testing accounts. Twitch confirms **Current Status: Hosted Test**, CDN hosting, `viewer.html` for Panel/Mobile and `config.html` for configuration. The testing allowlist still contains `komediruzecki7`, `yahwehwastaken` and `lakeeko`. No access was widened.

[Version status](https://dev.twitch.tv/console/extensions/54ysfu9jbragbdbvown2n8zrrli0g0/0.0.2/status) · [Install/test v0.0.2](https://www.twitch.tv/ext/54ysfu9jbragbdbvown2n8zrrli0g0-0.0.2)

Channel activation and an actual round on v0.0.2 need verification after the hosted backend is available. Uploading a new ZIP does not itself prove the channel has switched from v0.0.1.

## Separate Studio service

The ZIP updates the native Twitch viewer/configuration. Studio, the standalone viewer, OBS, speech recognition and the server run at `https://play-baited.maff.app` and require a separate backend image/restart. At upload time the public endpoint returned HTTP 530, the bounded tunnel had stopped, and the still-local backend served the older Studio build. The owner then approved the restart. Both old bounded processes had already expired. The new image was started on 26 October at 23:13 UTC and the same named tunnel was restarted. Public health and session checks pass; four tunnel connections are ready and demo mode is disabled. The persistent `baited-hosted-test-data` volume and original Proton encryption key were retained.

## Card selection

All eight existing Card Lab editions remain. Two studies were added: **Table Reveal** and **Glance Plus**. Their artwork resolves from coarse pixels to the original image in 630 ms; target words and clues stay sharp. Reduced motion and hidden/offscreen handling show the original artwork immediately. Foil is retained for a special edition. The everyday edition and its later landing integration remain owner choices.

## Rebuild

From a checkout containing this change:

```sh
rtk proxy pass-cli run --env-file /home/maff/foss/worktrees/baited/card-expansion-60/packages/app/docs/baited.hosted-extension.env.tmpl -- node /home/maff/foss/worktrees/baited/card-expansion-60/packages/app/scripts/build-extension.mjs --version 0.0.2
```

This writes `packages/app/dist/baited-v0.0.2.zip`. Only public connection settings enter the ZIP. Do not use `--local-preview` for Twitch upload. Keep previous artifacts intact.

## Hosted restart verification

- Source revision: `ece246da215ab1e60daf003d1556998ca4bffb11`.
- Image: `baited-hosted-test:review-ece246d`, promoted to the existing local test alias.
- Image ID: `sha256:9a72d635a27b19737c47b771f1fe9eab52667955200310760c559094ad23b929`.
- Public Studio serves `/assets/index-D4fgGsu0.js`, SHA-256 `599776c4c527ee3d8cd8a27219b73631b6d573004bb4d984b89cbe8d4c25acfb`, containing the redesigned Studio marker.
- The browser shows the new Baited sign-in screen. Reconnect Twitch and enable the microphone before testing a real round.
- Each test process expires after 180 minutes, around 27 October 02:13 UTC / 03:13 CET. Ctrl+C stops its terminal sooner. The backend binds to `127.0.0.1:3300`; only the existing named tunnel exposes it.
- New-card panel fixtures: both new studies fit all 13 states at 318 × 500 using hard `kaleidoscope` (26 checks). Reduced motion keeps the original artwork visible and hides the canvas. These are local fixtures, not physical-device or live Twitch acceptance.
- App CI: 225 tests, build and Extension packaging passed. Review-host: 5 tests passed. Landing browser CI is being retried once after its Wrangler/esbuild server crashed; record its final result separately.

Restart each service in its own terminal, from any directory:

```sh
rtk proxy pass-cli run --env-file /home/maff/foss/worktrees/baited/card-expansion-60/packages/app/docs/baited.hosted-backend.env.tmpl -- node /home/maff/foss/worktrees/baited/card-expansion-60/ops/hosted-test.mjs backend
```

```sh
rtk proxy pass-cli run --env-file /home/maff/foss/worktrees/baited/card-expansion-60/packages/app/docs/baited.hosted-tunnel.env.tmpl -- node /home/maff/foss/worktrees/baited/card-expansion-60/ops/hosted-test.mjs tunnel
```

Do not delete the persistent volume or rotate its encryption key as part of a restart. If port 3300 is occupied, reuse the intended running test or stop that exact session before restarting.
