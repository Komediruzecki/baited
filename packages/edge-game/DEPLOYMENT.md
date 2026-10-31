# Deployment boundary

The real-game pilot is documented in [PILOT.md](./PILOT.md), with current runtime status in [ACTIVE-PILOT.md](./ACTIVE-PILOT.md). The Worker, static assets, two Durable Object namespaces and dedicated secrets use the existing `pilot-baited.maff.app` custom domain. The owner requested a stop on 31 October 2026. The earlier [inactive receipt](./INACTIVE-DEPLOYMENT.md) is historical.

[`wrangler.pilot.jsonc`](./wrangler.pilot.jsonc) keeps workers.dev, preview URLs, synthetic authentication, R2, D1 and Containers disabled. Its master pilot flag permits the operator API to manage a durable runtime stop; it does not by itself reopen a stopped pilot. `EDGE_OPERATOR_INITIAL_ENABLED=false` starts installations without an operator record in the stopped state. Stop and Enable are explicit authenticated operator actions, with revision checks and cleanup barriers.

The retained [`wrangler.jsonc`](./wrangler.jsonc) and [POC.md](./POC.md) describe the earlier synthetic P0–P2 proof. Its fixture issuer is loopback-only, and its optional protected-art reader is not an upload or scanning service. Do not deploy the synthetic config as the real pilot, and do not promote the public fixture key into a production secret.

The pilot integrates Studio, OBS and Twitch Extension clients, OAuth, signed chat ingestion, local speech timing and a shared Baity queue. Real gameplay was tested by the owner. New implementation checks and live deployment proof are recorded separately; a prior successful round does not validate subsequent changes. The owner controls Twitch console changes.

A build, test or PR merge does not create Cloudflare resources. There is no automatic deployment path in this branch. Neither local emulator checks nor published pricing establish hosted capacity or an invoice. Provider load/cost probes remain outside the current development authorization.
