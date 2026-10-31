# Synthetic proof reference

This document describes the separately retained synthetic mode. For the real allowlisted pilot, use [README.md](./README.md) and [PILOT.md](./PILOT.md).

The synthetic mode tests the P0–P2 architecture: a Worker gateway, one SQLite Durable Object per channel, recoverable game state, authenticated sockets, deadline alarms, and a protected artwork reader. It uses synthetic events. It does not replace the current Baited Studio or connect a live Twitch game.

The game rules come from [`@baited/game-core`](../game-core/README.md). The existing Node application remains available. The edge Worker does not load Express, Sharp, TensorFlow, Moonshine, a Twitch chat connection, or an OAuth token vault.

No Cloudflare resources are activated by building or running this package locally. Local results do not establish provider billing, production capacity, Twitch client compatibility, or a launch-ready service. [DEPLOYMENT.md](./DEPLOYMENT.md) describes the separate decisions and missing work before a hosted test.

[VERIFICATION.md](./VERIFICATION.md) records the completed local checks and the pending independent Opus review.

## What is implemented

| Boundary | Current behavior |
| --- | --- |
| Authority | The gateway routes by verified channel ID. Each room owns its game state, revision, generation, receipts, and next alarm. |
| Durability | The portable core exports and restores a versioned checkpoint. The SQLite adapter partitions collections and commits state, accepted-command receipts, and the next alarm in one storage transaction before publishing live state or broadcasting. |
| Delivery | Authenticated WebSockets receive role-specific snapshots. A room revision is serialized once per role for a broadcast; server time and remaining active-round time are refreshed. `resync` requests a fresh snapshot. There is no polling client in this package. |
| Deadlines | A room reconciles overdue transitions at their logical due times and schedules the earliest game, receipt, or socket-expiry deadline. |
| Authentication | Twitch Extension HS256 JWTs are verified with the decoded standard-base64 secret. Local fixtures and future staging capabilities have separate issuers, audiences, keys, and opt-in flags. |
| Roles | Viewers can see the active target. Studio and overlay projections hide it. A broadcaster opening a viewer route still receives the hidden Studio projection. |
| Control | Only signed synthetic capabilities can inject POC commands. A Twitch Extension token, including a broadcaster token, is read-only here. |
| Artwork | The reader verifies an approved descriptor, object metadata, bounded PNG bytes, and an exact SHA-256 digest. The room grants only a signed-in viewer access to its current active, paused, or settling round art. Unknown or unapproved art returns 404. |

The artwork reader is not a scanner or approval service. There is no upload, listing, approval, or creator-library endpoint. The ordinary local fixture game has no uploaded-art resolver. Without explicitly prepared test records and matching approved bytes, its art route returns 404. Reader unit tests use a synthetic one-pixel PNG; they do not inspect or retain creator uploads.

## Run the local checks

Use Node 24 (the CI runtime) and pnpm 10.34.3. Run these commands from the repository root.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @baited/edge-game check
pnpm --filter @baited/edge-game test
pnpm --filter @baited/edge-game build
pnpm --filter @baited/app exec tsx --test tests/edge-core-recovery.test.ts
```

The install can contact the package registry. The build writes only the local Worker bundle. It rejects Node runtime imports and allows only `cloudflare:workers` to remain external. The test harness uses local Miniflare resources; its Worker outbound fetch handler returns 503.

The focused auth and art tests can be run separately:

```sh
pnpm --filter @baited/edge-game exec tsx --test --test-concurrency=1 tests/auth.test.ts tests/art.test.ts
```

Read the test output as local evidence. The auth/art suite covers rejection paths and approved-byte delivery. The portable recovery suite covers checkpoints and game rules. Neither proves provider hibernation duration, a real Twitch authorization flow, or physical-device behavior. Repository CI remains a separate check for the existing application and landing page.

## Start or restart a local room

```sh
BAITED_EDGE_LOCAL_TIMEOUT_MS=900000 pnpm --filter @baited/edge-game dev:local
```

This builds the bundle and listens at `http://127.0.0.1:8797`. The host and port are fixed. An occupied port is an error; the harness does not choose another port or bind to the LAN. Stop with Ctrl+C, or let the 15-minute deadline stop it. The maximum configurable lifetime is one hour (`3600000` milliseconds).

The command accepts no arguments, including remote flags. It ignores provider credentials and endpoint, host, and port overrides from the shell. The only supported environment settings are `BAITED_EDGE_LOCAL_TIMEOUT_MS` and `BAITED_EDGE_LOCAL_STATE`.

State is temporary by default and disappears when the emulator stops. To inspect restart recovery manually, set `BAITED_EDGE_LOCAL_STATE` to an absolute, dedicated local directory and restart with that same path. For this review, place such test state inside the registered agent output run, outside the checkout. It contains synthetic room and receipt data, not a production backup.

Check readiness in another terminal:

```sh
curl --fail --silent --show-error http://127.0.0.1:8797/health
```

The response reports `service: "baited-edge-poc"`, whether the POC is enabled, and `mode: "synthetic-proof"`. Health is public and does not prove that an authenticated request works. Before the first accepted `start`, a room state request returns 404 with `room: null`.

## Exercise the local HTTP API

Run this against a fresh temporary emulator. It imports the public fixture key from the harness, creates two short-lived capabilities in memory, starts channel `123`, and prints the start receipt and viewer snapshot. It does not print tokens or use live credentials.

```sh
node --input-type=module <<'NODE'
import { createHmac, randomUUID } from 'node:crypto';
import {
  LOCAL_FIXTURE_SECRET_B64,
  LOOPBACK_ORIGIN,
} from './packages/edge-game/scripts/local-options.mjs';

function capability(role) {
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'baited-local-fixture', aud: 'baited-edge-local',
    channel_id: '123', sub: `readme:${role}`, role,
    iat, exp: iat + 120, generation: 1,
  };
  const content = [{ alg: 'HS256', typ: 'JWT' }, payload]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  const signature = createHmac('sha256', Buffer.from(LOCAL_FIXTURE_SECRET_B64, 'base64'))
    .update(content).digest('base64url');
  return `${content}.${signature}`;
}

const studio = capability('studio');
const viewer = capability('viewer');
const start = await fetch(`${LOOPBACK_ORIGIN}/v1/rooms/123/commands`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${studio}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: randomUUID(), generation: 1, expectedRevision: 0, action: { type: 'start' },
  }),
});
const receipt = await start.json();
if (!start.ok) throw new Error(`Start failed (${start.status}): ${JSON.stringify(receipt)}`);
console.log('Start receipt:', receipt);

const state = await fetch(`${LOOPBACK_ORIGIN}/v1/rooms/123/state`, {
  headers: { Authorization: `Bearer ${viewer}` },
});
const snapshot = await state.json();
if (!state.ok) throw new Error(`State failed (${state.status}): ${JSON.stringify(snapshot)}`);
console.log('Synthetic viewer snapshot:', snapshot);
NODE
```

The local fixture key is deliberately public test material. Its issuer is accepted only with `EDGE_LOCAL_FIXTURE_AUTH=true` on an allowlisted loopback destination. It never becomes valid on a remote host, even if staging auth is enabled. A loopback CLI request may omit `Origin`; browser requests must send an exactly allowlisted origin. All other auth modes require an allowed origin.

The example assumes generation `1` and revision `0`. On an existing room, read the current snapshot and use its revision. Keep a command ID and its body unchanged when retrying an uncertain response. Reusing the ID with a different body produces `id_conflict`. After `revoke-connections`, the accepted receipt gives the new generation; old capabilities and socket attachments stop working, and replacement capabilities must use that new generation.

## Protocol reference

| Route | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Public service mode and enabled flag. |
| `/v1/rooms/:channel/state` | GET | Authenticated role-specific snapshot. |
| `/v1/rooms/:channel/commands` | POST | A bounded JSON command with identity, generation, revision, and role checks. |
| `/v1/rooms/:channel/socket` | GET upgrade | Authenticated WebSocket. |
| `/v1/rooms/:channel/art/:artId` | GET | Current-round approved private PNG, or 404. |

HTTP uses `Authorization: Bearer <JWT>`. WebSockets offer exactly `baited.v1` and `baited.auth.<JWT>` as subprotocols; the server echoes only `baited.v1`. Do not put tokens in URLs or send both credential transports. Query parameters are rejected on authenticated routes. A browser client can use this shape once it has a token in memory:

```js
const socket = new WebSocket('ws://127.0.0.1:8797/v1/rooms/123/socket', [
  'baited.v1',
  `baited.auth.${token}`,
]);
```

There is no remote token-minting route. This package does not provide a user-facing sign-in page or browser token provisioning flow.

A snapshot carries `type`, `protocol`, `revision`, `generation`, and `room`. A successful command receipt carries `ok`, `revision`, and `generation`; a WebSocket acknowledgement adds `type: "ack"` and the command `id`. Socket messages can be a command JSON string or the literal `resync`. The runtime handles the literal `ping`/`pong` pair without running room application code.

Commands share this envelope:

```json
{
  "id": "fixture-command-1",
  "generation": 1,
  "expectedRevision": 1,
  "action": {
    "type": "fixture-chat",
    "roundId": "replace-with-current-round-uuid",
    "epoch": 1,
    "text": "A synthetic clue"
  }
}
```

Use the round ID and epoch from the current snapshot; the shown placeholder is not a valid request. Viewer capabilities may send only `fixture-chat`. Studio capabilities may send `start`, `pause`, `resume`, `end`, `catch`, `reverse`, `award`, `guess`, `settings`, `fixture-transcript`, and `revoke-connections`, subject to the current game phase. Overlay capabilities have no command privileges. See [`src/protocol.ts`](./src/protocol.ts) for the exact action fields.

`fixture-chat` acts as a synthetic incoming chat event under the capability subject. `fixture-transcript` acts as a synthetic final transcript under a Studio capability. These are test inputs, not Twitch EventSub delivery or evidence that speech occurred. The room sets live microphone readiness to false and rejects enabling automatic rounds, chat bot output, and moderator commands through POC settings.

## Current bounds

| Item | Bound |
| --- | --- |
| Local channel | `123` in the CLI harness; programmatic tests may use explicit isolated overrides. |
| Connections | 64 per room, 4 per subject. |
| Command body or socket frame | 8 KiB. |
| Pending room operations | 32, serialized across asynchronous request, storage, and asset work. |
| Non-ping socket input | At least 100 ms between handled messages per connection. |
| Accepted-command receipts | 4,096 per room; 10-minute retention. |
| Partitioned checkpoint | 1 MiB and 30,000 records. |
| Overdue transitions | At most 128 per reconciliation attempt. |
| Fixture or staging capability | At most 300 seconds from issuance to expiry. |
| JWT | At most 4,096 characters. |
| Approved artwork | At most 1 MiB; PNG header dimensions up to 4,096 × 4,096. |

These are admission and storage limits for the proof. They are not a measured throughput promise, an account-wide abuse quota, or a billing cap. Slow-consumer queue behavior, large-room memory, reconnect storms, and sustained fanout still need workload tests. Receipt retention bounds the replay window; it is not an unlimited idempotency archive.

## What remains

P3 needs the existing clients, reconnect behavior, microphone session/lease checks, transcript timing, and native/mobile/OBS acceptance. P4 needs OAuth sessions, token refresh and revocation, signed EventSub acceptance and deduplication, subscription lifecycle, and shared Baity dispatch limits. P5 needs trusted scanning, owner/deck storage, broadcaster approval and attribution, quotas, removal, and retention. The protected reader supplies only one P5 boundary.

The P0 workload baseline, full P6 failure/load comparison, provider billing measurements, migration/rollback rehearsal, and operational monitoring remain separate evidence. Completing local tests does not close those gates or choose Cloudflare over the VPS alternative.
