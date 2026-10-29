# Testing and deployment boundary

This change prepares a local P0–P2 synthetic proof. It does not activate a Worker, Durable Object namespace, R2 bucket, route, paid plan, Twitch configuration, or public endpoint. It contains no automated deployment path. A pull request review is not a staging or production launch decision.

Use the commands in [README.md](./README.md) for local testing. No provider workload or provider cost benchmark is part of those commands. Local runtime duration, SQLite activity, and socket results cannot establish Cloudflare billed duration, free-tier eligibility, or an expected invoice.

## Prepared configuration

[`wrangler.jsonc`](./wrangler.jsonc) declares the resource shape so it can be reviewed before anything is created:

| Setting | Prepared value or purpose |
| --- | --- |
| Worker | `baited-edge-poc`; entry point `src/index.ts`. |
| Runtime date | `2026-09-07`. |
| Public exposure | `workers_dev: false`, `preview_urls: false`, and no routes. |
| POC flag | `EDGE_POC_ENABLED: "false"`. |
| Allowlist variables | Empty hosts, origins, and channels. |
| Fixture and staging modes | Both disabled. |
| SQLite room binding | `ROOMS`, class `ChannelRoom`, migration tag `v1`. |
| R2 binding | `ART`, proposed private bucket `baited-edge-poc-art`, local binding mode. |
| Observability | Disabled in the prepared configuration. |
| CPU setting | `cpu_ms: 10`; not a monetary hard cap. |

The declarations do not prove that resources with these names exist or that an account supports this configuration. The local harness does not use remote Wrangler mode or load Cloudflare credentials. It constructs its own loopback Miniflare options and denies Worker outbound fetches. The `remote: false` R2 setting is a local-development setting, not a substitute for controlling deployment.

## Evidence to collect locally

Run the focused package checks and the portable recovery suite, then inspect the result from each layer:

1. **Core rules:** checkpoint/restore retains round and review state, votes, clues, awards, correction data, and deadlines. Late or repeated reconciliation follows the intended timeline.
2. **Gateway and auth:** malformed, forged, expired, wrong-origin, wrong-host, wrong-channel, wrong-issuer, and wrong-generation credentials fail closed. Twitch broadcaster identity does not become a control capability or a viewer-secret projection.
3. **Room adapter:** state, accepted-command receipt, and earliest alarm commit together before acknowledgement or live-state publication; same-ID retries return the prior result within the receipt window; conflicts fail; and room state survives a local restart with the same persistence directory. The bounded operation queue serializes asynchronous work within a room.
4. **Sockets:** the credential subprotocol is never echoed; expiry and generation changes remove private access; reconnects recover a current role projection.
5. **Artwork:** unapproved or unknown records fail before object access; metadata and exact-byte digest mismatches return 404; the authorization callback reconciles overdue logical deadlines and checks generation both before and after the object read; responses use `private, no-store` and reveal no object key or approval metadata.
6. **Harness:** fixed loopback binding, strict port, bounded lifetime, disabled outbound fetches, and argument rejection remain in place.

Use test results as evidence only for the paths actually exercised. Unit tests of a function are separate from a real Miniflare request, a persisted restart, a provider wake, and a native Twitch client. A public `/health` response alone proves none of the private paths.

The POC has deliberately small room limits. Do not treat a passing fixture with a few clients as evidence for 1,000 players or 10,000 viewers. P6 still needs hot-room and multi-room load, slow consumers, reconnect storms, duplicate events, corruption, and dependency-failure tests with bounded output and a reproducible workload.

## A future synthetic staging test

A hosted synthetic probe can be considered separately from a live game canary. Before provisioning or publishing anything, the owner must choose the account, resource names, test hostname, channel allowlist, duration, traffic budget, spending limit, stop procedure, and resource-retention plan. Confirm the provider's current account requirements and pricing at that point. This document makes no plan or price assumption.

Prepare a separate staging configuration for review. Keep the current local configuration and the PC Hosted Test unchanged. Use a distinct Worker, SQLite namespace, private R2 bucket if artwork is exercised, and an exact HTTPS test origin. Do not point the existing Extension, `dev-play`, `play`, Studio, or OAuth callbacks at the POC.

After separate authorization, the concrete staging plan would need to cover these fields:

| Field | Required intent |
| --- | --- |
| `EDGE_POC_ENABLED` | Explicitly enable only the approved staging environment. |
| `EDGE_ALLOWED_HOSTS` | Exact destination host and optional port. No wildcard. |
| `EDGE_ALLOWED_ORIGINS` | Exact HTTPS browser origins. No wildcard or `null`. |
| `EDGE_ALLOWED_CHANNELS` | Only the synthetic or invited numeric channel IDs in scope. |
| `EDGE_LOCAL_FIXTURE_AUTH` | Keep `false` remotely. The public local fixture issuer remains loopback-only regardless. |
| `EDGE_STAGING_AUTH` | Explicitly enable only if synthetic operator capabilities are approved. |
| `EDGE_STAGING_SECRET_B64` | A dedicated strong standard-base64 HMAC key, distinct from fixture and Twitch keys. |
| `TWITCH_EXTENSION_SECRET_B64` | Needed only for an explicitly approved Extension read test. It does not add OAuth, Studio writes, EventSub, or bot integration. |
| `ROOMS` / migration | Bind the separate SQLite room namespace and review the initial migration before creation. |
| `ART` | Bind a private bucket only when the approved test requires it. No public bucket URL or listing surface. |

Secret values belong in Proton Pass and the provider's secret binding mechanism. Use reference-only templates and Proton injection for an approved operator command; do not paste values into docs, tracked configuration, command logs, `.env`, or `.dev.vars`. The local fixture key is public test material and must not be promoted into a staging secret.

A staging capability uses HS256 with issuer `baited-edge-staging`, audience `baited-edge-poc`, and claims `channel_id`, `sub`, `role`, `iat`, `exp`, and `generation`. Its lifetime is at most 300 seconds. Roles are `viewer`, `studio`, and `overlay`; only `studio` receives control privileges. Exact HTTPS host, origin, and channel allowlists still apply. An operator may prepare such capabilities offline under the approved secret-access workflow. There is no remote minting endpoint or OAuth session flow in this package.

Before opening any approved staging access, verify the disabled state, then the exact allowlists and capability boundaries. Exercise only synthetic commands and record measured provider request, CPU, duration, storage, and fanout data for the agreed workload. Compare those measurements with the baseline and VPS alternative. A local estimate or a short successful hosted request is not a monthly cost result.

The stop procedure must close admission, remove public routing, and end the test's workload under the agreed plan. `EDGE_POC_ENABLED=false` blocks new authenticated gateway requests; do not assume a gateway flag alone revokes already-open room sockets or removes stored resources. Socket capabilities expire within their short lifetime, and room generation revocation is available while access remains enabled. Resource deletion and retention need an explicit reviewed list; they are not automatic cleanup steps in this POC.

## Artwork in staging

The ordinary proof does not import creator media. If a future authorized synthetic test needs an R2 read, prepare a server-owned synthetic fixture and its exact approval descriptor together. Objects use `approved/<channelId>/<sha256>.png`. The reader requires matching `approval`, `sha256`, `policyVersion`, `channelId`, and `ownerSubject` metadata, an `image/png` content type, and the approved byte length. It recalculates SHA-256 before serving.

That fixture preparation is a test-data operation, not a real approval pipeline. There is no production upload route, browser-side approval override, scanner integration, owner-library endpoint, or import CLI here. The current room route only grants current-round viewer access; a future owner-media policy must be implemented and tested separately. Studio and overlay must never gain the current target through an asset lookup.

P5 must preserve the existing retention contract: original uploads and failed scans are not persisted as an incidental migration change. Trusted validation, normalized-byte screening, broadcaster approval, attribution, quotas, removal, re-scan, and cache/revocation behavior remain required before creator uploads can move to this architecture.

## Gates before a live game or cutover

| Phase | Missing evidence or integration |
| --- | --- |
| P0 | Measured current workload, request/payload baseline, and native scanner timing. Synthetic fixtures do not replace those measurements. |
| P3 | Existing UI integration, reconnect/backoff, microphone lease/session validation, transcript timing, mobile behavior, and actual native Twitch/iOS/OBS acceptance. |
| P4 | OAuth identity/session handling, grant validation and refresh/revocation, verified EventSub ingestion with durable acknowledgement and deduplication, subscription management, and Baity's shared send budget. |
| P5 | Creator ownership/decks, trusted scanner, approval/removal controls, quotas, immutable approved storage, and retention. |
| P6 | Representative failure and load tests, including slow consumers and one hot room, plus the Node/VPS comparison. |
| P7 | Separately approved resources, provider measurements, invited-channel canary, full-stack live proof, migration/rollback rehearsal, and release decision. |
| P8 | Monitoring, abuse admission, backup/restore and deletion reconciliation, operating procedures, and reviewed retention. |

The first hosted game canary requires the applicable P1–P4 and P6 work. A complete product cutover also needs P5 so creator features are preserved. The owner handles Twitch configuration and chooses whether to deploy, continue the edge implementation, or retain the portable core with a VPS adapter. No step in this guide changes those settings or makes that decision.
