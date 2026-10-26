# baited v0.0.1: local validation

25 October 2026. This implementation starts from `ea6cbf8` in an isolated private task branch. No deployment, Twitch installation, review submission or new branding artwork was performed.

## Verified

- The Moonshine rehearsal no longer requires Deepgram credentials. Six launcher tests cover provider selection, missing/unresolved credentials, encryption-key format and bounded duration.
- Ten Extension backend tests cover signed/expired/malformed JWTs, permitted roles, channel separation, broadcaster target omission, exact CORS, configuration ownership and disabled credentials. Thirteen existing HTTP tests passed alongside them.
- Seven local HTTPS gateway tests cover the fixed upstream, credentials/header stripping, strict Host, explicit static-file paths, Twitch's public iframe query parameters and rejection of API query tokens.
- Seven packaging/fixture tests cover the deterministic twelve-file ZIP, three public runtime settings, HTTPS API/exact studio origins, symlink rejection, unrelated-output preservation and fixture isolation.
- Thirteen frontend tests cover token renewal, stale response rejection, visibility/BFCache, exact studio links, literal text rendering and removing the active secret from both visible and screen-reader content when authorization changes.
- `pnpm build` passed TypeScript, Vite and the server bundle. `pnpm run licenses` added the jose dependency/license; `git diff --check` passed.
- The running local game reports Twitch and speech ready, with demo input disabled. The actual browser Speech bench reached **Moonshine Tiny ready**. This verifies loading, not human recognition accuracy.
- The loopback HTTPS service was checked using the exact generated certificate as a trust anchor, with hostname verification enabled. Its public Twitch iframe query loaded; valid synthetic signed requests reached the channel-bound API. Missing, expired and wrong signatures, wrong origins and API query tokens were rejected.
- The ZIP was checked in memory against the injected OAuth, Extension and encryption secrets: none appears in its contents. It contains no fixtures or speech models.

## Acceptance still required

Actual Twitch-issued Helper tokens, installation/activation, browser trust for the self-signed local certificate, broadcaster OAuth consent, real EventSub hints, natural microphone speech, OBS Browser Source and a complete two-account round remain unverified. Synthetic JWTs and local UI fixtures do not prove these. A narrow desktop panel is not Twitch mobile-app acceptance.

The panel's 1-second visible polling and per-IP limits are sized for the two-account local test. They need a separate capacity decision before public use. The local ZIP points to localhost and is not a remote Hosted Test build.

See [the local test guide](baited-local-test.md) for exact URLs, Proton references, restart commands and owner-assisted test steps. The local preview and game processes have three-hour lifetimes. The evidence run is `/run/media/maff/Game_Shared/agent-out-live/twigame/2026-10-25/bcf50119821c404e95d34c8391252ab6`.
