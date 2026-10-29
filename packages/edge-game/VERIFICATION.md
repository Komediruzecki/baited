# Pilot verification

29 October 2026. The implementation is prepared locally, with the cloud pilot flag disabled and no route. The PC server/tunnel were not restarted. This record distinguishes local tests from real provider acceptance.

## Completed local evidence

| Check | Evidence |
| --- | --- |
| Existing application | 436 tests passed during integration, including the new edge transport. After the first repairs, 19 focused client/native tests passed; 31 targeted renewal/API/native tests then passed for transient recovery, hard expiry and same-identity Twitch token refresh. |
| Node compatibility source review | Read-only comparison of `b0479fb` against `origin/main` (`81aa434`) found no unintended rule or persistence change. Existing Node app/store/config/Twitch/bot adapters remain unchanged; checkpoint/deadline APIs are additive. Extracted speech validation matches the original. Existing build metadata confirms shared rules are bundled. This is source/build inspection, not another runtime test. |
| Edge baseline | 73/73 passed together before the final admission and subscription-lifecycle additions. Current complete-suite result is delegated to PR CI. |
| Pilot room | The first repair pass had 20/20 local gateway/Room integration cases. The second repair pass passed 37 Room cases (26 pilot and 11 legacy), then four focused refresh cases after the last addition. Coverage includes 100 participants plus overflow, microphone ownership/deadlines, secrets, refresh/revocation role-isolated state/resync budgets, stale speech tails, abnormal close timing, idle SQL writes and bot retry bounds. |
| Production clients with real authority | 1/1 local integration passed through microphone lease, round, viewer secrecy, speech text, pending catch, confirmation and public result. Includes two Studio tabs in one session, with the second owning speech. Uses the real gateway/Room and clients with synthetic credentials and a fake Control adapter. The additional combined real-Control/Room fixture passed both one-channel and three-channel runs: real OAuth/cookies, native viewer identity, signed chat, dedupe, speech catch, outbox and global Baity budget. Only Twitch HTTP responses are simulated. |
| Control | 12/12 auth and integration tests passed, including deletion retry, idle disconnect and explicit reconnect. The first repairs passed 17/17 Control/auth cases. The second repairs passed 25 focused cases (23 Control/auth plus the two combined real-Control/Room fixtures), including stalled provider operations, generation races, signed ignored events, concurrent revocation, subscription recovery and 600 command attempts. |
| Ingress | Five local cases passed for per-IP throttling, narrower OAuth quota, fail-closed bindings, spoofed forwarded headers and authenticated webhook bypass. |
| Control inbox cost regression | Instrumented inbox queries now read eight SQLite rows with zero and 10,001 existing receipts after adding short delivery recheck/ack transactions (previously six). This is not a total for Room work, KV operations or provider billing. |
| SQLite storage | 14/14 Room storage cases passed, including stable-ID list replacement, compatibility and transaction rollback. Additional Control checkpoint tests cover migration, atomic failure and a 7.82 MB multi-record fixture; no individual record approaches the SQLite 2 MB limit. |
| Built UI | Headless desktop Studio, 390px mobile setup, native panel, hidden OBS and confirmed result passed with no JavaScript errors. Refused admissions show a manual retry rather than an automatic reconnect loop. |
| Speech delivery | Lease renewal changes Studio state without sending unchanged viewer/OBS snapshots. Audio is not uploaded; the local test uses synthetic sample counters/final text, not microphone capture. |
| Pilot assets | Selected static frontend, 100 card images and pinned Moonshine runtime built without loading env files or copying server data. |
| Extension ZIP | Edge-transport ZIP built using the public Extension client ID injected from Proton. Version label 0.0.3, 124 files, 66,171,159 bytes. Not uploaded to Twitch. |

The Extension build hash is `0e1e2f46ba0e4ce0eb8b1550881fa16e0e0c16eb8e7f5c9283bb7af8f2f48bcf`. The filename distinguishes it from the existing Node/PC version. Twitch asset-upload acceptance and native playback are still live checks.

Curated evidence is in the registered `baited/2026-10-29/7156c8cc3ce84c69992e7930a5c1c797` output run. Browser checks used fixtures and headless desktop engines. They do not establish physical iPhone behavior or live Twitch compatibility.

## Staff-review repair checks

- 45 focused application/native/runtime-loader cases passed, plus the actual gateway/Room integration. Application TypeScript passed.
- 11 focused Room cases passed, including valid and excessive audio bursts, ordering/idempotency of connection revisions, speech ownership/clock guards, outbox expiry and exact-session batch revocation that preserves a fresh sign-in. Edge TypeScript passed.
- 23 Control cases and both combined one-/three-channel fixtures passed after the queue-turn repairs (25 total). Held eight-event retries do not block another channel; revoking 100 sessions emits one bounded batch.
- A CI timing failure was reproduced: freezing the Worker clock while minting fixture JWTs from advancing Node time could make `iat` future-issued. Test-only request helpers now use the Worker fixture clock. Eight focused cases pass, including a deliberate 1.1-second skew that still rejects the raw future-issued token. Production authentication was not loosened.
- A separate headless Chromium probe confirms that a same-origin GET with a Bearer header omits Origin, while POST includes it. The browser-header regression was real, not a fixture-only hypothesis.

## Review status

Personal Claude subscription identity was checked against the active personal alias before starting the requested read-only Opus 5.5 inspection. Max effort and a 45-minute deadline were explicitly requested. The first review completed, identifying the P1 set in [REVIEW-DISPOSITION.md](./REVIEW-DISPOSITION.md). Fixes and focused regression tests are complete. The repair-verification pass completed. It verified most repairs, found a multi-frame speech-tail edge case, and recommended more CPU headroom and stronger transient recovery. Those findings and the associated recovery improvements are fixed with targeted regressions. The staff-engineer PR review completed on verified irch after the personal-account attempt reached its five-hour usage limit without returning findings. No further personal calls were made. The irch review used Opus 5.5 with explicit Max and a 45-minute bound. Its main browser and availability findings are repaired; the final repair confirmation is pending. A frozen source copy was supplied so implementation changes could not invalidate what the reviewer read. The repair snapshot includes admission, subscription lifecycle, ingress, config and the operator guide.

PR #26 remains draft. Full CI passed all four jobs at implementation commit `b0479fb` ([run 40940822009](https://github.com/Komediruzecki/baited/actions/runs/40940822009)), for that PR run. Its separate push run had one frozen-clock fixture failure; the repaired branch fixes that test before its new complete gate. Earlier full runs at `7eb383e` and `6b1f514` also passed. Current branch CI is the complete repository gate; local targeted checks do not replace it. Historical POC-only evidence and the earlier quota-blocked review are preserved in [VERIFICATION-POC.md](./VERIFICATION-POC.md).

## Not established yet

No new Worker, namespace, bucket, public route or provider workload was activated. No actual Twitch OAuth/EventSub/bot flow, hosted microphone test, Twitch ZIP upload, OBS native run, provider billing measurement, load generator, migration or production release ran. Local limits and passing fixtures do not establish 1,000-player or 100,000-viewer capacity.

See [PILOT.md](./PILOT.md) for the concrete activation and first-live-round sequence. Final repair confirmation and real provider acceptance remain separate gates.
