# Portable game core

`@baited/game-core` exports the same `Game`, `defaults`, `settingsSchema`, matching helpers and public game types used by the Node app. The Node `server/game.ts` entry point re-exports this package. The card-library store also imports and re-exports the core's `CardLibraryError` and `DeckCard`, so errors keep their `instanceof` identity across adapters.

The core has no Node built-in imports. Default selection uses unbiased Web Crypto rejection sampling and UUID generation uses Web Crypto. Tests and adapters can inject `(clock, choose, uuid)` through the constructor or `Game.restore`. The existing pure shared card catalogue, spellings, presentation, words and clue modules remain in `packages/app`; the package is a workspace extraction, not yet an independently published distribution. There is one copy of the rules and deck content.

## Recovery contract

- `checkpoint(): GameCheckpoint` returns a detached version 1 object with JSON-safe Maps/Sets encoded as entries/arrays. This is **private server state**, containing the target, clues, identity facts and overlay capability. Never use it as a public projection.
- `Game.restore(input, clock?, choose?, uuid?)` strictly validates every field and state reference, restores Maps/Sets and reattaches the current result to its history object. Unknown versions, missing fields, duplicate entries and inconsistent links fail closed. A format change requires a new version and an explicit migration.
- `nextDeadline(): number | null` supplies the earliest game-rule deadline, including speech settling, mission/cooldown progression and private clue-review expiry. It does not create a timer.
- `advanceTo(now, maxTransitions = 10000): void` runs existing `tick()` transitions at each logical due time before returning to the caller's clock. A late alarm therefore retains the speech grace period and dates results/automatic rounds as the ideal timeline would. Legacy `tick()` behavior is unchanged. The configurable transition ceiling throws if a wake is too far behind (the edge adapter uses 128); callers must discard the candidate on failure and must not acknowledge or persist a partially reconciled command.

After restore, an adapter must rebind `deckFor`, `artFor`, `canRun`, `onChange` and `onEvent` as needed. Functions are not durable state. Mic status and connection status are restored, but an adapter's microphone lease, session ownership, authentication generation and transcript protocol state are separate authority state and need their own validation. `SavedGame` remains the legacy inactive-restart format; creating `new Game(saved)` still drops a live round and streak.

The checkpoint records phase, round metadata and immutable card snapshot; participant/vote/transcript sets; pending catch; result and its history reference; mission; streak and the pre-round best; private review and selected hint; award owners; recent-chat throttle and accepted/rejected chat IDs; skip-used state; microphone and connection status; retained history, repeat exclusions, leaders and badges. Callback return values are not mutation receipts: `chat()` and `transcript()` can return false while changing dedupe or private review state without calling `onChange`. Adapters must compare/persist the authoritative candidate state before acknowledgment, including these paths.

Checkpoints are a serialization contract, not a requirement to write a full-room JSON row per message. The edge adapter may store changed fields and normalized bounded records transactionally, then reconstruct the same checkpoint on wake.
