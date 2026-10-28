# Permanent Cloudflare hosting

Prepared 28 October 2026. The hosting code is prepared; it has not been deployed
or activated. Production remains the existing PC-hosted Node service behind
the named Cloudflare Tunnel at `https://play-baited.maff.app`. The current host is
time-limited to three hours. The landing site already has a separate Cloudflare
deployment; moving the game does not move that site.

## Runtime and ownership

Keep the Node/Express server, `ws`, Sharp image processing, and TensorFlow/WASM
moderation worker together in one Cloudflare Container. A Worker routes requests
and WebSocket upgrades to a fixed container identity. Use one instance with
`max_instances = 1`; do not select a new instance per request or per room. The
server owns live rooms, round timers, Twitch connections, and in-memory caches.

A cloud restart preserves successfully saved data. It does not checkpoint live
gameplay sessions, active rounds, timers, or sockets. Connected clients must
reconnect and gameplay may need a fresh round. A deployment or recovery can
therefore interrupt play even when every durable write was successful.

The prepared configuration separates staging and production Worker/DO namespaces
and R2 buckets, uses a fixed `primary` container, and leaves
`DEPLOYMENT_ENABLED=false`. No public route or automatic deployment job is
configured. A gated five-minute Cron health request can start a stopped process
without a viewer request; recovery nominally includes up to five minutes of
scheduling delay plus startup time. This is not zero-downtime recovery and still needs a
real-platform test. Activity timeout renewal keeps an idle process running.
The health check does not automatically restart a process with failed storage.

`DEPLOYMENT_ENABLED=false` blocks new public fetches and makes the scheduled
health trigger a no-op. It **does not stop an already running container** or its
Twitch connections. Maintenance, cutover, and rollback must stop the actual
process and prevent the old writer from restarting.

`basic` (1 GiB RAM, 0.25 vCPU) is the initial candidate. It is not yet accepted:
measure cold start, warm and peak RSS, event-loop delay, concurrent rooms,
WebSockets, Sharp uploads, and moderation on the actual image and tier. If 1 GiB
is insufficient, `standard-1` provides 4 GiB and 0.5 vCPU at a materially higher
cost. Do not silently promote the tier or increase the instance limit.

A local Docker preflight with the existing packaged moderation worker, limited
to 0.25 CPU and 1 GiB, accepted a supplied 2880 × 3840 JPEG. Cold processing took
3.899 seconds and the warm pass took 0.797 seconds; peak process RSS was 217,660
KiB. This measured the worker plus its wrapper, not the full application. It
makes `basic` plausible but does not replace a Cloudflare measurement with all
server work active, nor the worst-size 32-megapixel upload check.

`STORAGE_BACKEND=cloudflare` selects the durable adapter. Container requests to
the private outbound hostname `baited.storage` are handled by a Worker binding
that accesses a private R2 bucket. This hostname is an internal routing contract,
not a public DNS record or a browser API. Public requests must not expose that
storage handler. Keep Cloudflare/R2 credentials out of the container: use Worker
bindings, and give the runtime only its application secrets.

The public Worker removes caller-supplied forwarding, internal identity, and
container-port headers. It signs Cloudflare's edge client IP together with a
timestamp, HTTP method, and request path/query. Node verifies that signature
before using the address for rate limiting; it does not trust a public
`X-Forwarded-For` value. Keep this signed boundary and do not enable broad proxy
trust as a deployment shortcut.

The adapter stores JSON documents and uploaded PNGs in R2 with ETag conditions,
including create-only writes. Artwork deletion uses a conditional zero-byte
tombstone because a separate read followed by deletion would race. Any failed
mutation, including an uncertain timeout or precondition conflict, freezes all
subsequent cloud mutations and makes health checks fail. Resolve the storage
problem, stop the process, and restart to load and reconcile the saved remote
state. Do not retry cached snapshots or roll back remote objects after a lost
response: the original write may have committed. There is no local-file fallback.

The snapshot set is `v1/state/bait.json`, `v1/state/card-library.json`,
`v1/state/card-art/index.json`, and the referenced `v1/art/<id>.png` objects.
`v1/state/card-art/pending.json` is an optional fourth JSON document for upload
intent/recovery; include it when present. Startup reconciles this intent before
accepting traffic: it retains a matching committed record or removes a matching
unindexed PNG. A mismatch or failed cleanup prevents startup. Preserve deletion
metadata when backing up R2 objects. Single-object conditions do not make the whole snapshot
transactional: verify pending-upload reconciliation and interrupted upload/index
writes before activation. The container filesystem holds disposable temporary
work only and is never the source of truth.

Startup currently reads every PNG referenced by a populated artwork index and
checks its size and SHA-256. Missing or mismatched art becomes unavailable.
Measure startup duration and R2 reads with a representative populated archive;
an empty-bucket check does not establish production restart readiness.

Initially the container serves the built frontend and static assets. Their
bytes therefore count toward container egress. A later change can serve suitable
assets directly with Workers Static Assets, after verifying asset routing,
security headers, cache behavior, and version consistency with the backend.

## What the account inspection established

The read-only inspection on 28 October returned:

| Read | Result | Meaning |
| --- | --- | --- |
| Containers applications | HTTP 200; two existing applications | The API was accessible; Baited is not the only possible consumer. |
| R2 buckets | HTTP 200; 20 buckets | Existing storage workloads can share the allowances; their remaining quota was not established. |
| Workers default usage model | `standard` | A usage-model setting, not proof of the account's invoice or remaining credits. |
| Account subscriptions | HTTP 403 | The token could not confirm the paid subscription or base charge. |

No paid product was enabled, bucket created, container deployed, or production
DNS changed by the cost inspection. Before activation, inspect billing with an
authorized account view, confirm the Workers Paid plan and payment arrangement,
and record remaining allowances across all account workloads. Do not describe
this as either a verified $5 account bill or a verified free hosting upgrade.

## Cost model

All amounts below are USD before tax, using public prices checked on 28 October
2026. Allowances are monthly and shared by the account, not reserved for Baited.
730 hours represents a planning month; a 31-day month has 744 hours.

Container memory and disk are billed from the selected instance's provisioned
capacity while running. CPU is billed from actual vCPU usage. The paid account
base is $5; included usage is 25 GiB-hours of memory, 375 vCPU-minutes, and 200
GB-hours of disk. Additional rates are $0.0000025/GiB-second,
$0.000020/vCPU-second, and $0.00000007/GB-second respectively.
([Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/))

| Scenario | CPU assumption | Base + memory + disk + CPU |
| --- | --- | ---: |
| `basic`, 730 running hours | Idle CPU, 0 vCPU average | $12.03 |
| `basic`, 730 running hours | Full CPU, 0.25 vCPU average | $24.72 |
| `basic`, 744 running hours | Full CPU, 0.25 vCPU average | $25.11 |
| `standard-1`, 730 running hours | Idle CPU, 0 vCPU average | $32.48 |
| `standard-1`, 730 running hours | Full CPU, 0.5 vCPU average | $58.31 |
| `basic`, 120 running hours | 0–0.25 vCPU average | $5.93–$7.64 |

These scenarios assume a new $5 paid account base and entirely unused included
allowances. If the account is already paid, the same component estimate is $5
lower, but other workloads may have consumed the allowances. With no remaining
container allowance, the 730-hour `basic` resource cost is $7.31–$20.45 plus any
new account base. The table excludes traffic, storage, platform overages, and VAT.

The 120-hour row is conditional savings, not current behavior. Twitch sockets
and background work can keep the service alive even without a browser audience.
Autosleep requires an explicit policy for disconnecting Twitch, persisting work,
waking the server, and resuming service; that policy is not implemented here.
Budget against 730–744 running hours until the lifecycle has been measured.

Container egress has regional allowances: 1 TB for North America/Europe, then
$0.025/GB; 500 GB for Oceania/Korea/Taiwan, then $0.05/GB; and 500 GB elsewhere,
then $0.04/GB. The calculator uses decimal units for this input. Static assets
and responses that leave the container belong in this estimate, even when the
original bytes came from R2.
([Containers egress](https://developers.cloudflare.com/containers/platform/pricing/#network-egress))

Use R2 Standard. Its account allowance is 10 GB-months, one million Class A
operations, and ten million Class B operations. Overage is $0.015/GB-month,
$4.50/million Class A, and $0.36/million Class B. R2 egress is free; this does not
cancel separate container egress. R2 rounds billable excess up to whole GB-month
and million-operation units. The calculator includes these rounded components
when usage is supplied; an existing account's aggregate rounding can change its
exact incremental invoice.
([R2 pricing](https://developers.cloudflare.com/r2/pricing/))

The Worker and Durable Object also meter usage. Paid Workers includes ten
million requests and 30 million CPU milliseconds per month; Durable Objects
includes one million requests and 400,000 GB-seconds. Their overages, object
storage, logs/observability, build/registry charges, other products, and taxes
are outside this calculator. Verify actual usage instead of assuming those
components are free.
([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/))

Recommend **$30/month before tax as the planning target, not a spending cap**.
One fixed `basic` instance bounds its provisioned compute capacity; it does not
cap egress, R2 operations, Worker/DO traffic, logs, or the whole account bill.
The 744-hour full-CPU scenario leaves about $4.89 under that target for extras
when all included allowances are unused. Shared quota consumption can reduce
that margin. Set
account budget notifications and usage alerts before cutover, then review the
first day's usage and the first bill. Notifications do not stop billing.

Run the offline calculator from the repository root:

```sh
python3 ops/cloudflare-costs.py --budget-usd 30
python3 ops/cloudflare-costs.py --budget-usd 30 --tier basic --hours 730 --average-vcpu 0.25
python3 ops/cloudflare-costs.py --budget-usd 30 --tier standard-1 --average-vcpu 0.5
python3 ops/cloudflare-costs.py --budget-usd 30 --hours 120 --average-vcpu 0.25
python3 ops/cloudflare-costs.py --budget-usd 30 --existing-paid-account --allowances none --average-vcpu 0.25
python3 ops/cloudflare-costs.py --budget-usd 30 --existing-paid-account --allowances none \
  --remaining-memory-gib-hours 10 --remaining-cpu-vcpu-minutes 100 \
  --remaining-disk-gb-hours 50 --egress-na-eu-gb 30 \
  --r2-gb-months 2 --r2-class-a 1000 --r2-class-b 20000 --json
```

These commands explicitly select the $30 planning target. Usage defaults describe
a scenario, not live account readings: new $5 base, full
allowances, no CPU, and zero egress/R2 usage. Supply measured values. In
particular, `--average-vcpu 0.05` means 0.05 actual vCPU (20% of `basic` capacity),
not 5% of the instance. `--existing-paid-account` removes only the base;
`--allowances none` starts every remaining allowance at zero, and each
`--remaining-*` flag overrides one of them. The script uses only Python's
standard library and makes no network requests or account changes.

## Staging and migration

1. Complete local adapter checks, conditional-write conflict tests, missing vs
   corrupt-object handling, private-handler routing, secret-free image build,
   and the actual Container/Wrangler deployment dry run. Record the image and
   configuration revision. A dry run is not a successful hosted deployment.
2. With activation authorized and billing understood, provision a separate
   staging bucket and staging hostname. Use a dedicated test Twitch identity
   and fresh staging login grants. Never copy production OAuth tokens, sessions,
   or a production `bait.json` into an independently running staging server.
3. Exercise login, chat, EventSub/WebSockets, complete rounds, reconnection,
   moderation, uploads, art serving, restart recovery, and cold starts. Inject
   storage failures and verify that a mutation cannot report success while data
   is missing from R2. Verify global mutation freeze, restart reconciliation,
   signed client-IP enforcement, and recovery of a deliberately stopped process.
   Measure memory/CPU and startup with a populated archive on `basic` before
   accepting that tier, including the worst-size 32-megapixel upload.
4. Rehearse export and restore using non-production fixtures. Compare object
   counts, schema validation and SHA-256 checksums, then start a fresh instance
   from the restored bucket. Back up the saved JSON plus every referenced PNG
   and its index, plus pending upload intents when present, with restricted
   access and a documented retention location. Preserve tombstone metadata.
5. For production cutover, announce maintenance, finish/stop active rounds, and
   freeze all mutating paths. Stop the old PC process and its Twitch connections
   before the new instance uses the same grants. Prevent automatic restarts of
   the old process. Never run both servers against the same OAuth refresh state.
6. Take the final consistent snapshot after the old writer has stopped, migrate
   the complete data set into the private production bucket, and verify it
   against the snapshot. Transfer secrets only through Proton Pass injection
   and the approved secret upload path. Do not print or save plaintext OAuth
   grants or session secrets in shell output, JSON dumps, logs, or build layers.
   Verify the backup can actually be restored before proceeding.
7. Start the production container, confirm saved state and Twitch reconnection,
   and verify its internal scheduled health check. Only then perform the final
   routing/DNS cutover for `play-baited.maff.app`. Keep the public URL and Twitch
   callback path unchanged. Confirm OAuth redirects and cookie behavior at that
   exact hostname, then complete an actual browser-and-Twitch round.
8. Watch restart loops, storage conflicts/failures, authentication errors, RSS,
   CPU, egress, and platform usage. Preserve the stopped PC deployment and final
   backup through the agreed rollback window. Do not delete the tunnel, local
   data, or prior backup as part of initial cutover.

Saved state contains authentication material. Backups must stay access-controlled
and encrypted; evidence should report only counts, checksums, and pass/fail.
Keep runtime secrets and provider access in Proton Pass references/injection.
Do not open `.env`, `.dev.vars`, credential files, or setup notes containing
secret values to prepare a migration. Any migration helper must suppress request
bodies and provider diagnostics that can echo those values.

## Rollback

Freeze mutating routes, disable new fetches and scheduled starts, and stop the
Cloudflare instance before restoring the old host. Confirm that no old or new
writer can restart automatically. Snapshot the current R2 data, including
refreshed OAuth state, with the same protected backup process. Restore and
validate that latest snapshot on
the old host; do not simply restart its stale pre-cutover files. If the new state
is corrupt, retain it for investigation and explicitly choose a verified prior
snapshot, acknowledging any lost changes. Start only one writer, restore the
previous hostname route, and verify login and a live round. Never roll back only
DNS while leaving both instances connected to Twitch and writing state.

## Acceptance still required

- Billing subscription and remaining account quotas confirmed; budget alerts configured.
- Image/deployment compatibility, populated-archive startup, and measured `basic` RAM/CPU headroom accepted.
- Signed edge IP, private storage bridge, conditional writes, mutation freeze, and restart reconciliation verified.
- Five-minute scheduled recovery verified on Cloudflare; actual container stop procedure rehearsed.
- Staging Twitch grants kept independent; full hosted gameplay and moderation verified.
- Consistent production backup, transfer, and restore rehearsal verified without secret exposure.
- Old process stopped before new production grant use; final hostname/callback cutover verified.
- Rollback from the latest persisted state rehearsed; first-day usage and first invoice reviewed.

Until these gates pass, describe this as prepared infrastructure with estimated
costs, not permanent hosting already activated.

## Activation handoff

The next activation decision is paid staging: one `basic` instance, a separate
private staging bucket and hostname, fresh test-account Twitch grants, and a
$30/month before-tax planning target with alerts. Confirm the account's actual
paid plan and remaining quotas first. Stage and production each have their own
instance, so an overlapping rollout can incur charges for both; limit that
overlap and include it in the approved spend. Production migration and the
`play-baited.maff.app` cutover follow only after staging, backup/restore, and
recovery checks pass and production activation is authorized. No paid staging,
production activation, or DNS cutover is claimed by this document.
