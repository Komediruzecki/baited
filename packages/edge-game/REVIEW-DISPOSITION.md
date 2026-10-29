# Pilot security review and disposition

29 October 2026. Personal Opus 5.5 reviewed a frozen source snapshot with explicit Max effort and a 45-minute bound. The first review completed successfully. The runner records Max as requested, not independently verified effective effort. This is a code review, not a penetration test or provider certification.

The first review found no P0 secret-disclosure or privilege-escalation defect. It gave a conditional staging GO and a real-audience NO-GO until its P1 findings were addressed. The changes below are responses to that review; the follow-up review and final CI are separate gates.

| Finding | Disposition in the current branch | Evidence / remaining boundary |
| --- | --- | --- |
| F1: viewer traffic can consume Studio rate buckets | Buckets are keyed by role and identity, with reserved capacity for controls. Viewer frames are checked before the mutation queue. Commands return state directly. | Viewer refresh exhaustion and invalid-frame burst regression tests; no command-followup GET. Distributed abuse at untested scale remains outside this pilot. |
| F2: stale speech frames disarm a healthy mic | Wrong-phase, old-round/epoch and settlement-tail frames are ignored. Current-epoch owner/timing violations still fail closed. | Pause/resume, old epoch and delayed settlement-tail tests preserve the lease. |
| F3: unrelated chat makes Studio commands stale | Round-scoped commands accept an older revision while retaining round/epoch/generation checks. Settings/start/revocation retain strict revision checks. No-op chat does not increment revision. | Ten intervening chat events do not invalidate a valid pause. |
| F4: closing Studio rewinds the round clock | The close handler preserves the latest audio timestamp; deadline calculation includes closed socket attachments. Reserved close codes are normalized. | Closing after 60 seconds with code 1006 leaves roughly 60 seconds, not 115. |
| F5: unsigned ingress and ignored webhooks can disrupt subscriptions | Gateway verifies webhook signatures before Control. Control verifies outside its mutation queue; read-only sessions also bypass it. Signed ignored events return 204. Delivery-failure revocations recover; revoked OAuth credentials are cleared. | Held-provider-validation, signed Shared Chat, unsigned flood and revocation regressions. Real Twitch challenge/retry behavior still needs live acceptance. |
| F6: pending OAuth map can lock out new sign-ins | Per-IP initiation limits plus bounded oldest-entry eviction keep new sign-in admission available. | 101 initiations followed by a valid completion. A distributed attacker can still interrupt an older pending sign-in; this is not bot-proof authentication. |
| F7: inbox scans create a growing database-read cost | Indexed expiry/pending queries and durable counters replace per-event full-table counts/scans. | Local SQLite regression with 10,000 receipts measures bounded rows read. Hosted bills are not measured. |
| F8: idle chat keeps writing game state | Ordinary idle chat does not mutate Room storage. Explicit disconnect deletes subscriptions; Studio inactivity triggers durable deletion/retry. | Idle Room SQL total_changes remains unchanged. Control still verifies/deduplicates incoming events until Twitch confirms unsubscribe. |
| F9: command spam silences announcements or retries forever | Room cooldowns precede the outbox; Control separates per-channel command/round receipts and reserves a per-channel send share. Outbox entries expire after 60 seconds and permanent 4xx responses drop them. | Command spam does not fill outbox or suppress pause announcements; expired/403 outbox drains and stops waking an otherwise idle room. |
| F10: anonymous seat exhaustion and tab-switch churn | Pilot viewers must have stable signed-in Twitch identities. Joins are limited per identity. Short visibility changes reuse the socket; explicit admission failures stop retries. | Anonymous sign-in UI, 100 visibility toggles with one connection, capacity and reconnect tests. Many distinct valid accounts can still fill the deliberately small pilot. |

Other repairs include exact Studio-tab microphone binding, credential validation outside the Control mutation queue, credential-generation checks during concurrent revocation, name/badge length normalization and bounded reconnect recovery.

## What this does not prove

The built-in deck is the only supported pilot deck. No R2 art route, uploads, scanner or custom card workflow is exposed. Broadcaster/Studio/OBS projections omit the live secret; the native viewer projection includes it. A broadcaster using another Twitch account can still see a viewer's card. Do not describe this social-game separation as anti-cheat.

The overlay capability is a bearer credential for the public projection. Treat copied OBS URLs as private even though they cannot read a live secret. Per-overlay rotation and richer credential/session administration remain follow-ups. The channel allowlist is configured by verified login; registration records the corresponding numeric Twitch ID, but the config is not a separately pinned numeric-ID allowlist.

Local fixtures do not establish real Twitch OAuth/EventSub permissions, Hosted Test upload acceptance, physical iPhone behavior, native OBS compatibility, provider log redaction, account-wide remaining allowances, sustained load capacity or a fixed invoice. Logs are disabled in the prepared config; verify the account's broader logging settings at activation.

No service, route, storage namespace or paid measurement has been activated. The first live acceptance remains one allowlisted channel with known testers, then the other two after success. See [PILOT.md](./PILOT.md).
