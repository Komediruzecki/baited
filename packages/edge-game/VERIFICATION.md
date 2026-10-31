# Pilot verification

29 October 2026 implementation evidence, followed by the inactive deployment and the authorized activation on 30 October 2026. Historical local/build results below describe their original checkpoints. The PC server/tunnel were not restarted. This record distinguishes local tests from real provider acceptance.

## Active provider checks, 30 October 2026

The owner authorized `komediruzecki7` and `lakeeko`, with a two-channel ceiling and 100 participants/100 viewer sockets per channel. The initial Cloudflare version was `f35137d9-9393-44b6-8124-16b1bc94370e`; the OAuth compatibility repair is deployed as `4658ebdf-534d-4e6b-a97d-5c4106832986` on the same exact custom domain `pilot-baited.maff.app`. workers.dev, preview URLs and synthetic authentication remain disabled. All six secrets are retained.

HTTPS checks passed: health reports an enabled allowlisted pilot; Studio returns 200 and renders Connect Twitch in the in-app browser; signed-out session metadata returns 200; protected session and room state return 401; an unsigned webhook returns JSON 403; Card Maker and Card Lab return 404. Read-only Twitch inspection found zero existing app EventSub subscriptions. The previously uploaded 0.0.3 edge ZIP is confirmed in Hosted Test with matching MD5 `e0c01f07740576980001c31635e5164b`. No review was submitted.

These checks do not establish a real OAuth grant, chat connection, microphone round, Paolo session or OBS playback on the cloud pilot. See [ACTIVE-PILOT.md](./ACTIVE-PILOT.md) for the receipt and owner steps. Sanitized activation evidence is in registered run `baited/2026-10-30/587efe961f254b15b20a29a5b8659ab5`.

## Completed local evidence

30 October OAuth repair: the first real owner authorization returned 503 because production native fetch used unsupported `redirect: 'error'`. New tests preserve the production method and intercept networking with a native workerd outbound fixture. All seven failed before the repair and passed afterward, including successful POST/form/auth headers, five redirect codes with no forwarding, and the actual five-second abort. The 25 existing Control/diagnostic checks passed. `tsc --noEmit` passed. Callback diagnostics use only fixed categories and bounded provider status; no raw exception/provider/request material is logged. The irch review could not start because the isolated profile was logged out; no fallback account was used. Fresh live authorization acceptance is pending. Evidence run: `baited/2026-10-30/95282fecd33c472c93d11146c8d7600f`.

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
| Extension ZIP | Edge-transport ZIP built using the public Extension client ID injected from Proton. Version label 0.0.3, 124 files, 66,171,159 bytes. Not uploaded at this local-build checkpoint; the later Hosted Test upload is recorded above. |

The Extension build hash is `0e1e2f46ba0e4ce0eb8b1550881fa16e0e0c16eb8e7f5c9283bb7af8f2f48bcf`. The filename distinguishes it from the existing Node/PC version. The later upload is confirmed above; native Twitch playback remains a live check.

Curated evidence is in the registered `baited/2026-10-29/7156c8cc3ce84c69992e7930a5c1c797` output run. Browser checks used fixtures and headless desktop engines. They do not establish physical iPhone behavior or live Twitch compatibility.

## Staff-review repair checks

- 45 focused application/native/runtime-loader cases passed, plus the actual gateway/Room integration. Application TypeScript passed.
- 11 focused Room cases passed, including valid and excessive audio bursts, ordering/idempotency of connection revisions, speech ownership/clock guards, outbox expiry and exact-session batch revocation that preserves a fresh sign-in. Edge TypeScript passed.
- 23 Control cases and both combined one-/three-channel fixtures passed after the queue-turn repairs (25 total). Held eight-event retries do not block another channel; revoking 100 sessions emits one bounded batch.
- Final direct recommendations: six focused Control cases pass with due subscription deletion and bot sending completed before stalled Room retries; three focused Room cases pass, including a real SQLite checkpoint failure that still closes captured revoked sockets while preserving a newer owner. Edge TypeScript and diff checks pass.
- A CI timing failure was reproduced: freezing the Worker clock while minting fixture JWTs from advancing Node time could make `iat` future-issued. Test-only request helpers now use the Worker fixture clock. Eight focused cases pass, including a deliberate 1.1-second skew that still rejects the raw future-issued token. Production authentication was not loosened.
- A separate headless Chromium probe confirms that a same-origin GET with a Bearer header omits Origin, while POST includes it. The browser-header regression was real, not a fixture-only hypothesis.

## Review status

Personal Claude subscription identity was checked against the active personal alias before starting the requested read-only Opus 5.5 inspection. Max effort and a 45-minute deadline were explicitly requested. The first review completed, identifying the P1 set in [REVIEW-DISPOSITION.md](./REVIEW-DISPOSITION.md). Fixes and focused regression tests are complete. The repair-verification pass completed. It verified most repairs, found a multi-frame speech-tail edge case, and recommended more CPU headroom and stronger transient recovery. Those findings and the associated recovery improvements are fixed with targeted regressions. The staff-engineer PR review completed on verified irch after the personal-account attempt reached its five-hour usage limit without returning findings. No further personal calls were made. The irch review used Opus 5.5 with explicit Max and a 45-minute bound. Its browser and availability findings are repaired. The same irch session completed the focused repair confirmation with no new P0/P1 blockers and conditional one-/three-channel acceptance. It inspected code/test bodies, not execution output. A frozen source copy was supplied so implementation changes could not invalidate what the reviewer read. The repair snapshot includes admission, subscription lifecycle, ingress, config and the operator guide.

PR #26 is ready for review and remains unmerged. All four packages passed at runtime commit `a102da0` on both push and PR CI; the PR landing job passed on one unchanged retry after a fixture connection reset. Both PR and push CI passed all four jobs at implementation commit `55abf01` ([PR run 40950824241](https://github.com/Komediruzecki/baited/actions/runs/40950824241), [push run 40950814488](https://github.com/Komediruzecki/baited/actions/runs/40950814488)). The final direct-recommendation safeguards are covered by the focused checks above; current PR checks are authoritative for their exact-head complete gate. Full CI also passed all four jobs at earlier implementation commit `b0479fb` ([run 40940822009](https://github.com/Komediruzecki/baited/actions/runs/40940822009)), for that PR run. Its separate push run had one frozen-clock fixture failure; the repaired branch fixes that test before its new complete gate. Earlier full runs at `7eb383e` and `6b1f514` also passed. Current branch CI is the complete repository gate; local targeted checks do not replace it. Historical POC-only evidence and the earlier quota-blocked review are preserved in [VERIFICATION-POC.md](./VERIFICATION-POC.md).

## Not established yet

The [inactive deployment receipt](./INACTIVE-DEPLOYMENT.md) is historical; the current active two-channel configuration is recorded above. No actual user OAuth grant, EventSub/bot flow, hosted microphone test, Paolo round, OBS native run, provider billing measurement, load generator, existing-game data migration or production release ran on this cloud pilot. No R2 bucket, D1 database or Container was activated. Local limits and passing fixtures do not establish 1,000-player or 100,000-viewer capacity.

See [PILOT.md](./PILOT.md) for the first-live-round sequence. Code-review confirmation is complete. The current PR checks record exact-head CI; the real account/device/game acceptance remains separate from the passing public deployment checks.

## Pilot transcript display — 30 October 2026

- The owner confirmed the OAuth repair returns to Studio; both push/PR CI runs passed all four packages at `108cc63`.
- Exact pilot hostname gating reuses the existing opt-in final-phrase view. Other hosted origins remain excluded. It adds no new transcript persistence and does not alter hidden-card access or speech transport.
- New host assertion failed on baseline. Transcript and local-speech tests then passed 15/15; app typecheck and pilot assets build passed. Independent review found no blocker.
- The deployed signed-in Chrome Studio shows the button; opening it exposes the final-phrase empty state and disabled Clear button. This did not enable a microphone or start a round.
- New deployment and public/provider receipts are in registered run `baited/2026-10-30/094e2872a4754b77ba787aa2738c1e1a`. The owner's real phrase test remains pending.
