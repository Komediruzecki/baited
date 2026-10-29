# Pilot verification

29 October 2026. The implementation is prepared locally, with the cloud pilot flag disabled and no route. The PC server/tunnel were not restarted. This record distinguishes local tests from real provider acceptance.

## Completed local evidence

| Check | Evidence |
| --- | --- |
| Existing application | 436 tests passed during integration, including the new edge transport. After review repairs, 19 focused client/native tests passed. |
| Edge baseline | 73/73 passed together before the final admission and subscription-lifecycle additions. Current complete-suite result is delegated to PR CI. |
| Pilot room | 20/20 local gateway/Room integration cases passed, including 100 participants plus overflow, microphone ownership/deadlines, secrets, refresh/revocation role-isolated state/resync budgets, stale speech tails, abnormal close timing, idle SQL writes and bot retry bounds. |
| Production clients with real authority | 1/1 local integration passed through microphone lease, round, viewer secrecy, speech text, pending catch, confirmation and public result. Includes two Studio tabs in one session, with the second owning speech. Uses the real gateway/Room and clients with synthetic credentials and a fake Control adapter. The additional combined real-Control/Room fixture passed both one-channel and three-channel runs: real OAuth/cookies, native viewer identity, signed chat, dedupe, speech catch, outbox and global Baity budget. Only Twitch HTTP responses are simulated. |
| Control | 12/12 auth and integration tests passed, including deletion retry, idle disconnect and explicit reconnect. After review repairs, 17/17 Control/auth cases passed, including signed ignored events, held validation, concurrent revocation, subscription recovery and 600 command attempts. |
| Ingress | Five local cases passed for per-IP throttling, narrower OAuth quota, fail-closed bindings, spoofed forwarded headers and authenticated webhook bypass. |
| Control inbox cost regression | Instrumented inbox queries read six SQLite rows with zero and 10,001 existing receipts. This is not a total for Room work, KV operations or provider billing. |
| SQLite storage | 14/14 passed, including stable-ID list replacement, compatibility and transaction rollback. |
| Built UI | Headless desktop Studio, 390px mobile setup, native panel, hidden OBS and confirmed result passed with no JavaScript errors. Refused admissions show a manual retry rather than an automatic reconnect loop. |
| Speech delivery | Lease renewal changes Studio state without sending unchanged viewer/OBS snapshots. Audio is not uploaded; the local test uses synthetic sample counters/final text, not microphone capture. |
| Pilot assets | Selected static frontend, 100 card images and pinned Moonshine runtime built without loading env files or copying server data. |
| Extension ZIP | Edge-transport ZIP built using the public Extension client ID injected from Proton. Version label 0.0.3, 124 files, 66,170,756 bytes. Not uploaded to Twitch. |

The Extension build hash is `606b15006eca9785a7776ce57326ae1539bc7737ae8c817cede81cc575d5d6f0`. The filename distinguishes it from the existing Node/PC version. Twitch asset-upload acceptance and native playback are still live checks.

Curated evidence is in the registered `baited/2026-10-29/7156c8cc3ce84c69992e7930a5c1c797` output run. Browser checks used fixtures and headless desktop engines. They do not establish physical iPhone behavior or live Twitch compatibility.

## Review status

Personal Claude subscription identity was checked against the active personal alias before starting the requested read-only Opus 5.5 inspection. Max effort and a 45-minute deadline were explicitly requested. The first review completed, identifying the P1 set in [REVIEW-DISPOSITION.md](./REVIEW-DISPOSITION.md). Fixes and focused regression tests are complete. A frozen repair-verification pass is running; it is not yet an approval. A frozen source copy was supplied so implementation changes could not invalidate what the reviewer read. The repair snapshot includes admission, subscription lifecycle, ingress, config and the operator guide.

PR #26 remains draft. Full CI passed all four jobs at commit `7eb383e` before the review repairs. The final repair head still needs CI. Current branch CI is the complete repository gate; local targeted checks do not replace it. Historical POC-only evidence and the earlier quota-blocked review are preserved in [VERIFICATION-POC.md](./VERIFICATION-POC.md).

## Not established yet

No new Worker, namespace, bucket, public route or provider workload was activated. No actual Twitch OAuth/EventSub/bot flow, hosted microphone test, Twitch ZIP upload, OBS native run, provider billing measurement, load generator, migration or production release ran. Local limits and passing fixtures do not establish 1,000-player or 100,000-viewer capacity.

See [PILOT.md](./PILOT.md) for the concrete activation and first-live-round sequence. The final staff-engineer review and real provider test remain separate gates.
