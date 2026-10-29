# Local verification record

Verified on 2026-10-29 against the implementation in this pull request. These are local functional checks, not provider capacity or billing measurements. The cloud configuration remains disabled; the PC Hosted Test and tunnel were not restarted.

## Checks completed

| Check | Result |
| --- | --- |
| Frozen workspace install with lifecycle scripts disabled | Passed; existing dependency versions preserved. |
| `pnpm --filter @baited/edge-game check` | Passed. |
| `pnpm --filter @baited/edge-game build` | Passed; no Node runtime imports or unexpected external modules. |
| `pnpm --filter @baited/edge-game test` | **54 passed in CI**, none skipped: 26 auth/art, 7 local-harness, 11 room integration, 10 state-store. Locally, 53 passed together and the final mission-countdown regression passed separately. |
| `pnpm --filter @baited/app test` | **426 passed**, including 10 new portable-core recovery cases. |
| Application build | Passed, including the server bundle guard and the full application build inside Docker. |
| `docker build` | Passed locally after adding the game-core manifest and source to the build stages; the resulting image was not started. |
| README HTTP example | Started a synthetic round and read an authenticated viewer snapshot through the local gateway. |
| Bounded local launcher | Exited on its configured deadline; its loopback listener was closed afterward. |
| `git diff --check` | Passed. |

Repository CI adds an edge-game matrix job and remains the complete gate for the application, Extension packaging, landing bundles/browser checks, and review-host helper. All four jobs passed on the first implementation commit ([run 40871611495](https://github.com/Komediruzecki/baited/actions/runs/40871611495)). The Dockerfile follow-up is validated by its local image build; the current-head CI result remains visible on the PR.

## Regressions covered

- The existing Node server bundles the shared rules rather than importing an unbuilt TypeScript workspace at runtime. Its build checks the emitted bundle metadata.
- The room commits changed SQLite rows, its command receipt and next alarm together. An integration fixture throws after an alarm write and verifies rollback, then retries the same command ID successfully.
- Concurrent commands with the same expected revision commit one transition. Retried commands retain their original result; changed-body reuse conflicts.
- A persisted local restart retains paused rounds, votes, pending catches and receipts. Core tests also cover logical deadline recovery, result/history aliases and correction state.
- Viewer, Studio and overlay sockets receive different projections. A broadcaster token cannot opt into the viewer's private target or acquire control privileges.
- Cached snapshots refresh both round and running mission countdowns without persisting timer ticks. Paused and pending-catch mission time remains frozen.
- Socket expiry and generation changes close private access without relying on the client to request another snapshot. The local native client enters `CLOSING` promptly; its final close event has a roughly ten-second emulator transport grace period. Tests distinguish those events.
- The previous caught round can still receive a clue award while the next round is active. Only Studio receives the private award board.
- Chat paths that return `false` but change deduplication or review evidence still persist their changed rows. Unsafe checkpoint keys and invalid references fail closed.
- Approved-art tests check authorization before and after reads, metadata, byte limits, PNG headers and the exact digest. They use synthetic bytes, not creator media.

## Review still pending

The requested Opus 5.5 Max inspection did **not** run: the account preflight reported that the isolated `irch` profile was logged out before a model request. The prepared review requests a 45-minute read-only inspection and concrete regression tests. No other account was substituted.

Keep the PR in draft until that review has completed, its findings have been assessed and fixed where warranted, and the required checks pass. A successful independent peer review does not substitute for the requested Opus review.

## Deliberately unverified

No hosted Worker, Durable Object namespace or R2 bucket was created. No public route, real Twitch authorization, EventSub connection, bot, upload scanner, current Studio integration, load generator, provider cost probe or production migration was run. The proof's small admission limits are not a scale claim. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the separate integration and activation gates.
