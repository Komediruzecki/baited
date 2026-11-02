# Baited edge pilot

A Cloudflare Worker routes authenticated traffic to one SQLite Durable Object per Twitch channel. A shared Control object handles Twitch authorization, chat subscriptions and Baity’s account-wide sending budget. Studio, OBS and the native Twitch Extension use persistent WebSockets. Moonshine runs in the streamer’s browser; audio stays there.

**Active pilot, verified 30 October 2026.** [Open Studio](https://pilot-baited.maff.app/studio). The Worker serves the exact pilot custom domain with two SQLite Durable Object namespaces and six secret bindings. Only `komediruzecki7` and `lakeeko` may register as streamers. Studio renders and signed-out access checks pass; the first real Twitch session and round remain to be tested. The PC server and tunnel stay stopped. Landing production is unchanged.

- [Active deployment receipt and next test](./ACTIVE-PILOT.md)
- [Historical inactive deployment receipt](./INACTIVE-DEPLOYMENT.md)
- [Pilot setup, limits and acceptance steps](./PILOT.md)
- [Architecture, hidden cards and cost tables](./ARCHITECTURE-AND-COSTS.md)
- [Verification and review status](./VERIFICATION.md)
- [Synthetic proof commands and protocol](./POC.md)

## Pilot scope

The active streamer allowlist is `komediruzecki7,lakeeko,yahwehwastaken`, with a three-channel ceiling. Paolo (`yahwehwastaken`) became a pilot streamer on 2 November 2026; on the other channels he joins as a Twitch-allowlisted viewer. Each channel admits up to 100 distinct chat participants per round and 100 concurrent viewer sockets, with separate capacity for Studio and OBS. These are different limits: a person can open more than one Extension view.

The existing illustrated deck is included. Custom decks, card creation, image uploads, scanning and R2 are disabled in this pilot. The existing Node application remains available for those features; this is not a complete product migration.

| Part | Implemented boundary |
| --- | --- |
| Identity | OAuth state and secure cookie sessions; exact host/origin allowlists; signed Twitch visitor identities; short-lived Studio and OBS credentials. |
| Authority | One serialized channel room selects the word, controls deadlines, validates commands and owns scores. |
| Privacy | Viewers receive the live word. Broadcaster, Studio and OBS projections hide it until the result. A Twitch broadcaster identity remains hidden even on a viewer route. |
| Recovery | Changed SQLite records, command receipts and deadline alarms commit together. Stable-ID hint/history rows avoid rewriting a list when one item expires. |
| Speech | One Studio socket owns a renewable microphone lease. Bounded sample counters and final text are checked against the round and timing; no audio upload. Missing audio pauses the round. |
| Twitch chat | Signed EventSub ingress, durable replay protection, bounded room admission, moderation events, reconnect and idle subscription removal. |
| Bot | One shared durable queue, 15 messages per 30 seconds by default, at least 1.1 seconds between messages to the same channel. |
| Delivery | Hibernating WebSockets, local countdowns and role-specific projections. Native pilot Extension transport is an explicit build option. Legacy Node transport is preserved. |

## Local verification

Run from the repository root with Node 24 and pnpm 10.34.3:

```sh
pnpm --filter @baited/edge-game check
pnpm --filter @baited/edge-game build
pnpm --filter @baited/edge-game test
pnpm --filter @baited/edge-game build:pilot-assets
```

Tests use synthetic credentials, local Miniflare and fake Twitch responses. They do not contact Twitch or Cloudflare APIs. The production client integration exercises a complete round against the actual gateway and room implementation; it does not replace a live microphone, OAuth or native Twitch test.

The asset builder selects the Studio assets, built-in card art and pinned Moonshine runtime. It does not load `.env`, copy databases or bundle server credentials. Model weights download into the streamer’s browser from Moonshine’s host when speech is first enabled.

The retained loopback proof launcher is documented in [POC.md](./POC.md). It remains bounded, synthetic and separate from real Twitch sign-in. There is no deployment workflow or automatic activation in this branch.
