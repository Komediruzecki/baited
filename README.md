# Baited

One private repository for the game, Twitch Extension and landing page.

Start with [Baited setup](packages/app/docs/GETTING_STARTED.md). Moonshine runs speech recognition in the streamer's browser by default. **You do not need a Deepgram account or API key** for the local demo, microphone rehearsal or normal Moonshine setup. The older Deepgram adapter remains optional.

| Package | Responsibility |
| --- | --- |
| [`packages/app`](packages/app/README.md) | Streamer Studio, standalone viewer, OBS overlay, game server, Moonshine and native Twitch Extension |
| [`packages/landing`](packages/landing/README.md) | Landing source and assets for the requested `dev.baited.maff.app` and `baited.maff.app` domains |
| [`packages/review-host`](packages/review-host/README.md) | Small shared helper for preview hosts and indexing policy |

## Develop

Use Node 24 and pnpm 10.34.3. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @baited/app build
pnpm preview:local       # Local game demo; no Twitch secrets needed
pnpm preview:extension   # Native panel/config visual workbench
pnpm dev:landing         # Landing on localhost:4370
```

Run each preview command in its own terminal. The app commands use `packages/app` as their working directory. [Baited setup](packages/app/docs/GETTING_STARTED.md) separates the credential-free previews from real Twitch testing; the detailed [local preview guide](packages/app/docs/local-preview.md) covers LAN review. Historical runbooks may name older worktrees; use `packages/app` in this clone as the application directory. No other private repository or submodule is required.

```sh
pnpm check
pnpm test
pnpm build
pnpm build:extension     # Requires public Extension client ID and backend origin
```

The Extension ZIP is separate from the app server and the landing. It never includes the Moonshine model, backend credentials or the server. Production hosting of the game is a separate task from landing releases.

For a round with remote testers, follow [Twitch Hosted Test](packages/app/docs/HOSTED_TEST.md). It covers the named Cloudflare Tunnel on the Linux host, Proton-backed backend commands, the upload ZIP, Twitch settings and an OBS round with Paolo. The planned test service is `play-baited.maff.app`; it is available only while the host and both bounded processes are running. See the guide's verification status before treating it as live.

The approved original wordmark and upload-ready logo, icon and discovery exports live in [Twitch listing assets](packages/app/assets/twitch/v0.0.1/README.md). Older logo variants remain available for reference. Preparing these files does not submit the Extension for review.

The game deck has 78 illustrated targets. The public landing shows ten fixed example cards; its build includes only those card records and artwork. [Card artwork and provenance](packages/app/public/cards/proofs/README.md) records the 18 original illustrations and the 60-card expansion. Artwork is separate from titles, clue restrictions and example questions. Run `node packages/app/scripts/sync-card-art.mjs --check` to verify the unchanged source image copies used by the app, native Extension and landing. Updating the landing does not update an installed Twitch Extension; that requires a rebuilt ZIP and a new Hosted Test upload.

The development-only [Card Lab](https://dev.baited.maff.app/card-lab/) compares card editions, materials, backs and gameplay states at panel, phone and Studio sizes. It uses synthetic rounds, and review choices stay in that browser without changing the game. The route and its assets are excluded from production. See [the design and test record](packages/app/docs/card-product-review.md) for local previews, Opus's direction and the checks completed so far.

## Deployment and access

The landing workflow deploys `main` to dev. Production requires an annotated `bait-vX.Y.Z` tag matching `packages/landing/package.json` and pointing to a commit on `main`. The repository variable `LANDING_DEPLOY_ENABLED` must be `true`. See [deployment ownership and secrets](docs/landing-deployment.md).

The requested `baited.maff.app` and `dev.baited.maff.app` domains serve the landing only. Domain configuration and deployment status are recorded in the deployment guide; a landing URL does not provide a hosted game backend.

The repository stays private. Paolo has collaborator access and can clone this repository and follow the same setup guide. He does not need access to `disjoint-colliders` or the owner's dotfiles. Work on a feature branch and use a pull request for review. Never commit secrets: use Proton Pass references and local injection. The local demo needs no vault access.

## History and plans

The existing game history is retained, including `paolo-original-2026-10-24`. The landing and review-host were imported from a fixed revision of `disjoint-colliders`, with per-file hashes, source revision and original license notices in their `IMPORT-MANIFEST.json` files. All landing runtime assets are included. The old source branch is preserved.

Technical and team docs belong in this repository. Personal coordination and historical plan snapshots remain in `.dotfiles/personal/games/baited`; they are not build inputs or prerequisites for a collaborator.

[Card maker plan](docs/card-maker-plan.md) proposes channel-owned packs, a Studio editor, a private speech rehearsal and later artwork uploads. It also explains the difference between limiting public examples and protecting the active target. The maker is planned, not shipped.
