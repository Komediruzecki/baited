# Baited

One private repository for the game, Twitch Extension and landing page.

Start with [Baited setup](packages/app/docs/GETTING_STARTED.md). Moonshine runs speech recognition in the streamer's browser by default. **You do not need a Deepgram account or API key** for the local demo, microphone rehearsal or normal Moonshine setup. The older Deepgram adapter remains optional.

| Package | Responsibility |
| --- | --- |
| [`packages/app`](packages/app/README.md) | Streamer Studio, standalone viewer, OBS overlay, game server, Moonshine and native Twitch Extension |
| [`packages/landing`](packages/landing/README.md) | Landing source and assets for the requested `dev.baited.maff.app` and `baited.maff.app` domains |
| [`packages/game-core`](packages/game-core/README.md) | Shared portable game rules and versioned recovery checkpoints |
| [`packages/edge-game`](packages/edge-game/README.md) | Active Cloudflare pilot for `komediruzecki7` and `lakeeko`, with per-channel room authority |
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

For the current remote test, open [Cloudflare pilot Studio](https://pilot-baited.maff.app/studio) and follow [the active pilot handoff](packages/edge-game/ACTIVE-PILOT.md). The older [PC Hosted Test guide](packages/app/docs/HOSTED_TEST.md) describes the Linux server and Cloudflare Tunnel; those processes remain stopped and are not needed by the cloud pilot.

The approved original wordmark and upload-ready logo, icon and discovery exports live in [Twitch listing assets](packages/app/assets/twitch/v0.0.1/README.md). Older logo variants remain available for reference. Preparing these files does not submit the Extension for review.

The built-in game deck has 100 targets: 35 easy, 34 medium and 31 hard. The public landing shows ten fixed example cards; its build includes only those card records and artwork. [The deck notes](packages/app/docs/deck-100.md) cover the latest 22 targets and verification. [Card artwork and provenance](packages/app/public/cards/proofs/README.md) records each illustration batch. Artwork is separate from titles, clue restrictions and example questions. Run `node packages/app/scripts/sync-card-art.mjs --check` to verify the unchanged source image copies used by the app, native Extension and landing. Updating the landing does not update an installed Twitch Extension; that requires a rebuilt ZIP and a new Hosted Test upload.

The development-only [Card Lab](https://dev.baited.maff.app/card-lab/) compares card editions, materials, backs and gameplay states at panel, phone and Studio sizes. It uses synthetic rounds, and review choices stay in that browser without changing the game. The route and its assets are excluded from production. See [the design and test record](packages/app/docs/card-product-review.md) for local previews, the design direction and the checks completed so far.

The **Questions & language** tab in Card Lab reviews all 100 English/Croatian cards, preferred questions and preserved originals. [The content audit](docs/cards-content-audit.md) explains the suggested changes. Croatian is review content for now; live speech recognition and matching remain English.

## Record a demonstration

Use [the three-round shoot guide](docs/recording/2026-10-31-pilot-shoot.md) and [participant role cards](docs/recording/chat-role-cards.md). In Studio settings, **Recording take** deals Banana, Ghost and Bait first, then returns to the selected random deck. Those first three rounds use easy single-word rules and allow Call the bait, regardless of the saved difficulty, mission or guessing setting. The selected duration and automatic-round setting still apply.

**Restart take** returns only that channel to round zero and clears the take's scores/streak. It preserves Twitch connections, microphone permission and lifetime history, and waits for the owner to start again. Recording mode is off by default. Backend and Studio must be updated together before using these controls on a hosted pilot; no Twitch ZIP change is needed for them.

## Cloudflare pilot

The [edge pilot](packages/edge-game/README.md) is active at [pilot-baited.maff.app/studio](https://pilot-baited.maff.app/studio) for two invited streamer channels: `komediruzecki7` and `lakeeko`. Each channel allows 100 distinct participants per round and 100 concurrent viewer sockets. It uses the built-in 100-card deck, a Worker gateway, SQLite Durable Objects, local Moonshine and WebSockets. Custom decks and Card Maker are excluded.

[The activation receipt](packages/edge-game/ACTIVE-PILOT.md) records the verified public endpoint and owner steps. Studio renders and signed-out access checks pass; the first real OAuth, microphone, chat and OBS round on this cloud deployment remains to be tested. The repository stays private and the Extension remains in Hosted Test without a review submission. `pnpm dev:edge:local` retains the separate bounded synthetic loopback proof.

## Deployment and access

The landing workflow deploys `main` to dev. Production requires an annotated `bait-vX.Y.Z` tag matching `packages/landing/package.json` and pointing to a commit on `main`. The repository variable `LANDING_DEPLOY_ENABLED` must be `true`. See [deployment ownership and secrets](docs/landing-deployment.md).

The requested `baited.maff.app` and `dev.baited.maff.app` domains serve the landing only. Domain configuration and deployment status are recorded in the deployment guide; a landing URL does not provide a hosted game backend.

The repository stays private. Paolo has collaborator access and can clone this repository and follow the same setup guide. He does not need access to `disjoint-colliders` or the owner's dotfiles. Work on a feature branch and use a pull request for review. Never commit secrets: use Proton Pass references and local injection. The local demo needs no vault access.

## History and plans

The existing game history is retained, including `paolo-original-2026-10-24`. The landing and review-host were imported from a fixed revision of `disjoint-colliders`, with per-file hashes, source revision and original license notices in their `IMPORT-MANIFEST.json` files. All landing runtime assets are included. The old source branch is preserved.

Technical and team docs belong in this repository. Personal coordination and historical plan snapshots remain in `.dotfiles/personal/games/baited`; they are not build inputs or prerequisites for a collaborator.

- [Make a card pack](packages/app/docs/card-maker.md): the implemented Cards workbench supports channel-owned text packs, private pronunciation rehearsal, archive/restore and custom or mixed decks from the next round. A real-channel acceptance test remains necessary. The [artwork editor guide](packages/app/docs/card-art-studio.md) covers image uploads, a local pixel/ASCII editor, server-side image checks and private artwork delivery. The [card maker plan](docs/card-maker-plan.md) preserves teammate authoring and viewer proposals.
