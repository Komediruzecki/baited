# baited landing

The static baited landing for `baited.maff.app`, with development at `dev.baited.maff.app`. This package contains the Opus-led v2 design: a responsive 32-second staged hero film, an interactive fan of 18 approved cards, and a local hint practice toy. The card footer joins the yellow BAIT lettering with “them.” on the left. The existing Irchiinnuss maker attribution remains in the footer alongside Terms, Privacy and Contact.

The hero starts muted. Turning sound on is an explicit choice that is not remembered after leaving or reloading. Reduced-motion visitors get chapter stills and can choose to play. The deck supports buttons, keyboard navigation, pointer dragging and an automatic advance control. The practice toy checks hints in the browser and does not send them to a server.

This package does not deploy the game or Extension backend. It has no Twitch sign-in, microphone capture, speech recognition, analytics scripts or game credentials. The separate `/terms` and `/privacy` pages describe the stated test scope; their copy distinguishes the landing from the personal Extension test.

## Source

This package is the canonical landing source in [Komediruzecki/baited](https://github.com/Komediruzecki/baited), at `packages/landing`. Its runtime HTML, CSS, JavaScript, media, fonts and images are tracked here. It builds and serves without the old monorepo checkout or a local worktree path.

The landing was imported from `disjoint-colliders/packages/bait` at revision [`87bfc5d96bd63c39b30d39c8d7d245bd7252b578`](https://github.com/Komediruzecki/disjoint-colliders/tree/87bfc5d96bd63c39b30d39c8d7d245bd7252b578/packages/bait). [IMPORT-MANIFEST.json](IMPORT-MANIFEST.json) records every imported path, source Git blob and SHA-256 hash. This is a snapshot import: unrelated monorepo history is not included. The source remains preserved for the deployment handover. See [ASSETS.md](ASSETS.md) for art and film provenance.

The Twitch Extension, Streamer Studio, game server, Moonshine integration and their runtime assets live alongside this package in [`packages/app`](../app). Its earlier [`concepts/bait-v2`](../app/concepts/bait-v2) directory, introduced at `d8732aa`, preserves the historical design and film-rendering source. Do not synchronize that concept over the maintained landing. Personal planning and historical snapshots live in `personal/games/baited` in the owner's dotfiles repository. Build instructions and provenance stay with this repository so Paolo can use a clone independently.

## Card motion

The BAITED header pairs the owner's original angular wordmark with three charcoal card backs. Hover or keyboard focus opens the hand and flips the front card; a touch or pen release opens it for 1.4 seconds. There is no idle logo animation or sound. Reduced motion keeps the fan still and changes the face instantly. The mark and home link remain usable without JavaScript; a failed image request falls back to readable text when JavaScript is available. Forced colors hides the decorative hand and uses the system text color.

Local and development review includes `/lab/brand/`, with three preserved generated proofs, small-size comparisons and phone headers. `/?mark=a`, `b` or `c` selects a proof on those hosts. Production ignores the query and returns 404 for the lab and its assets. The default uses the supplied original with no added hook. See [the design record](design/brand-direction.md) and [generation prompts](design/brand-prompts.md).

The motion revision follows Opus's review of Paolo's four supplied clips. `site/deck.js` turns five visible cards around a shared bottom pivot; one position controls shading, depth and the selected caption. Buttons and dragging use the same controller. Artwork decodes before a committed selection, repeated input replaces the pending destination, and inspection waits for the hand to settle.

`site/screen-stack.js` deals upright sheets: lift, hold, fall below the stage, then return behind it. The depth change happens outside the visible stage. `site/scene-seam.js` lets Your turn's background fill a reserved empty runway in discrete tiles as the visitor scrolls. It never covers the card CTA or captures input.

Reduced motion makes card and sheet changes instant and the seam static. Autoplay starts paused in that preference, and otherwise waits for a settled, visible, unfocused surface. No audio or animation library was added. The hero film and approved card artwork are unchanged.

## Checks

From the baited workspace root:

```sh
rtk pnpm --filter @baited/landing check
rtk pnpm --filter @baited/landing test:run
rtk pnpm --filter @baited/landing deploy:dry-run
rtk pnpm --filter @baited/landing deploy:dry-run:prod
```

The deck controller tests cover wraparound, interrupted navigation, queued inspection and switching reduced motion during a turn. The package's Worker tests cover host and environment guards, read-only serving, indexing headers, robots, sitemap, unpublished proof routes and response preservation. Brand tests restrict proof selection to known variants on review hosts. Browser verification must also cover the film, deck, practice toy and legal navigation with the actual Worker content policy.

## Development and production

Local review on this workstation (the installed local workerd currently supports 2026-08-08):

```sh
rtk proxy timeout --foreground 10800s pnpm --dir /home/maff/foss/worktrees/baited/unified-workspace/packages/landing exec wrangler dev --env dev --local --ip 127.0.0.1 --port 4370 --inspector-port 9370 --compatibility-date 2026-08-08 --log-level warn
```

Open <http://127.0.0.1:4370/>. The explicitly assigned port is fixed; the process stops after three hours or Ctrl+C. The local compatibility override is not a change to the deployment configuration. CI validates the configured cloud bundle.

[Deploy landing](../../.github/workflows/deploy-landing.yml) preserves the development and production release rules. It is gated by the repository variable `LANDING_DEPLOY_ENABLED=true`; the gate starts off until Cloudflare secret configuration and deployment ownership have been checked. The old disjoint-colliders deployment workflow must be disabled before this one is enabled, so two repositories cannot overwrite the same Worker.

Once enabled, merging landing changes or their deployment inputs into `main` deploys `maff-bait-dev` to `dev.baited.maff.app` and compares the served HTML with the merged source. A manual run from `main` also targets development. Production requires a separately authorized annotated `bait-vX.Y.Z` tag matching `packages/landing/package.json`, on a commit already in `main`. It deploys `maff-bait` to `baited.maff.app`. Feature branches do not auto-deploy. Never move a published tag.

The former `bait.maff.app` and `dev.bait.maff.app` domains remain attached to the same Workers as redirect aliases. GET and HEAD requests receive a permanent 308 redirect to their matching `baited` hostname, preserving the path and query. Redirect destinations always use fixed HTTPS origins; production rejects other hostnames. The development proof selector recognizes only the new development hostname and local loopback hosts.


For an authorized recovery, the package scripts are `deploy:dev` and `deploy:prod`. Local credentials must come through Proton Pass. No credential values belong in this package.

The Worker accepts GET and HEAD, serves only the configured environments, and applies a self-only content policy. Development remains `noindex, nofollow`; that discourages indexing but is not access control. An unset environment or mismatched production host returns 404. Successful production responses are indexable. The package version is prepared as 1.2.0 for the authorized landing release. This source version alone is not evidence of a deployment or a published tag.

No deployment is implied by these source files. Confirm the exact revision and served pages in the workflow result before reporting a deployment complete.
