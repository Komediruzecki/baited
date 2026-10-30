# Pilot operator control

The local Company Report Viewer can inspect and stop the pilot through its server bridge. This is separate from a streamer's game settings. Its loopback-only server checks Host, Origin and a process-specific CSRF nonce; it is not a remotely hosted administrator login. The operator key never belongs in browser JavaScript, a URL, an Extension ZIP, or a git-tracked value file.

## API contract

Use the exact `EDGE_PUBLIC_ORIGIN` destination, HTTPS, and `Authorization: Bearer <operator key>`. The Worker and Control object independently validate the credential with a constant-time comparison. The server key is `EDGE_OPERATOR_KEY`; the Report Viewer bridge calls its matching secret `BAITED_OPERATOR_KEY`. Both must reference the same Proton value. The accepted key is 43–128 base64url characters, generated from at least 32 random bytes.

Requests with an `Origin` or `Cookie` header, a different destination, URL credentials, query parameters, or a mismatched Host are rejected. There is no browser CORS endpoint. The Report Viewer bridge enforces its local mutation origin/CSRF checks before forwarding requests. A future remote dashboard would additionally need explicit operator authentication; do not expose the current loopback bridge publicly.

- `GET /api/operator/status` returns the current state.
- `POST /api/operator/pilot`, `Content-Type: application/json`, changes it. Body: `{ "enabled": false, "expectedRevision": 3, "reason": "Finished testing for today" }`. `expectedRevision` must match the latest status. `reason` must be 1–200 characters without control characters. Unknown fields are rejected.

Both successful requests return:

```ts
{
  service: 'baited-edge-pilot',
  enabled: boolean,
  configured: boolean,
  revision: number,
  status: 'running' | 'stopping' | 'stopped',
  updatedAt: number | null,
  channels: Array<{
    login: string,
    chatConnected: boolean,
    subscriptionStatus: string,
    pendingDeletion: number,
    room: { available: false } | {
      available: true,
      phase: string,
      viewerSockets: number,
      studioSockets: number,
      overlaySockets: number,
      participants: number
    }
  }>,
  stats: {
    registeredChannels: number,
    connectedChats: number,
    pendingSubscriptions: number,
    queuedAnnouncements: number,
    activeSessions: number
  },
  limits: {
    streamers: number,
    participantsPerChannel: number,
    viewerSocketsPerChannel: number
  }
}
```

`configured` means the master flag and required pilot configuration are valid. `pendingSubscriptions` counts subscriptions awaiting **removal**, not subscriptions to create. Channel counts are current application activity, not billing measurements. Unavailable room stats stay explicitly unavailable. Responses do not include credentials, session IDs, hidden cards, clues, transcripts, or chat content. The stop reason is stored for the last operator transition, but is not included in status.

Errors have a safe `code`: `operator_auth` (401), `invalid_request` (400; unsupported content type is 415), `stale_revision`, `cleanup_pending`, or `pilot_not_configured` (409). Malformed JSON returns 400. Refresh status after a conflict; do not blindly retry an enable with a newer revision.

## Stop and enable behavior

A stop first persists the global admission gate, revokes Studio sessions and pending OAuth state, clears queued announcements, and turns each channel's chat intent off. It then synchronizes a monotonic operator revision to every registered Room and removes the known Twitch EventSub subscriptions using the existing retry cleanup. Signed deliveries received after stopping are acknowledged without creating game activity.

Each Room closes its sockets, releases its microphone lease, disables chat, clears its outbox, and abandons the unfinished round without awarding it. Completed history and saved game preferences remain. The Room generation changes, invalidating old capabilities. A durable pending revision blocks gameplay even if checkpointing fails; retries can finish that same revision. This barrier also prevents a pending catch from being confirmed by a socket-close callback or alarm after a failed stop. Delayed older enable/stop messages cannot reverse a newer decision.

A completed stopped Room has no scheduled gameplay alarm. Control retains bounded-backoff cleanup retries only while work remains. Room synchronization retries back off to at most one attempt per minute; subscription removal follows the existing cleanup retry policy. An already dispatched external message cannot be unsent, but no queued announcements are replayed when the pilot reopens.

Enable is refused while a room acknowledgement, subscription removal, or provider operation is unresolved. A successful enable reopens admission only. Streamers must sign in again, connect chat, enable their microphone, and start a new round. It does not resume capture, an unfinished round, or old bot work. In-flight OAuth begun before a stop is rejected even if the pilot has since been enabled again.

The persisted operator switch cannot override `EDGE_PILOT_ENABLED=false`. Conversely, turning the master flag back on does not override a persisted operator stop.

## Safe first installation on an existing pilot

1. Keep `EDGE_PILOT_ENABLED=false` for the first deployment. Bind the operator key from Proton and set `EDGE_OPERATOR_INITIAL_ENABLED=false`.
2. Deploy the audited code with the master flag still false. The initial flag seeds a durable stop only when no prior operator state exists. Existing legacy Rooms with no operator marker also block timers until Control synchronizes them; fresh rooms rely on Control admission and persist an explicit revision-0 marker with their first checkpoint.
3. Read authenticated status, then POST `enabled:false` with its revision. This also retries pending Room stops. Verify each available Room is idle with zero connected sockets. If a Room is unavailable, keep the pilot stopped and resolve that cleanup.
4. If cleanup needs provider APIs, deploy with the master flag true while preserving the durable operator stop. This allows cleanup alarms; it does not reopen public admission. Verify `enabled:false`, `status:'stopped'`, zero pending removals, zero queued announcements and zero sessions. Public health must still report disabled/stopped.
5. Enable only when the owner requests another test. Read a fresh revision and use the authenticated Report Viewer control.

The initial flag is a seed/migration guard, not a recurring reset. Once persisted operator state exists, its revision determines the runtime state. New allowlisted channels can join after an explicit enable; subsequent Room restarts retain their saved operator marker.

Stopping gameplay does not delete the Worker, its stored history, account plan, or other Cloudflare resources. This status endpoint makes no zero-cost or billing claims. Keep the existing channel, participant and socket caps in the pilot configuration.

## Offline verification

Focused integration tests cover authentication and malformed requests, stale revisions, durable initial stop, cleanup failure/retry, fresh enable without automatic chat reconnect, OAuth stop/enable races, delayed Room acknowledgements, atomic outbox rollback, pending-catch failure/recovery, legacy startup alarms, and new-room admission. They use synthetic credentials and provider fixtures with outbound networking disabled. CI remains the complete merge/deployment gate.
