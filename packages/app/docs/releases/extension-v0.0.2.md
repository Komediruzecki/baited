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

The ZIP updates the native Twitch viewer/configuration. Studio, the standalone viewer, OBS, speech recognition and the server run at `https://play-baited.maff.app` and require a separate backend image/restart. At upload time the public endpoint returned HTTP 530, the bounded tunnel had stopped, and the still-local backend served the older Studio build. A new backend image is being prepared; the owner has been asked before ending any active round or in-memory session.

## Card selection

All eight existing Card Lab editions remain. Two studies were added: **Table Reveal** and **Glance Plus**. Their artwork resolves from coarse pixels to the original image in 630 ms; target words and clues stay sharp. Reduced motion and hidden/offscreen handling show the original artwork immediately. Foil is retained for a special edition. The everyday edition and its later landing integration remain owner choices.

## Rebuild

From a checkout containing this change:

```sh
rtk proxy pass-cli run --env-file /home/maff/foss/worktrees/baited/card-expansion-60/packages/app/docs/baited.hosted-extension.env.tmpl -- node /home/maff/foss/worktrees/baited/card-expansion-60/packages/app/scripts/build-extension.mjs --version 0.0.2
```

This writes `packages/app/dist/baited-v0.0.2.zip`. Only public connection settings enter the ZIP. Do not use `--local-preview` for Twitch upload. Keep previous artifacts intact.
