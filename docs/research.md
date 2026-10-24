# Research and decisions

Checked October 24, 2026, before development.

## Official submission requirements

The [official rules](https://twitchcon-codex.devpost.com/rules) set the development window to October 23 at 10 a.m. Pacific through November 2 at 2 p.m. Pacific, 2026. Entries must be new, original work built with Codex, connected to Twitch, and runnable as described. Permitted third-party tools remain subject to their licenses.

Submission needs an accessible source repository, English description and testing instructions, the genuine Codex session ID, and a public YouTube demonstration shorter than three minutes showing Twitch operation and Codex use. Judges need free access through the end of judging. Entrants must check the rules’ age, location, ownership and conflict-of-interest conditions themselves.

The four equally weighted criteria are originality, impact for streamers and communities, technical implementation/Codex use, and design/entertainment. The [overview](https://twitchcon-codex.devpost.com/) emphasizes a functioning Twitch experience. The [resources](https://twitchcon-codex.devpost.com/resources) link the developer documentation and dates.

This build started from an empty workspace on October 24. No proprietary application source was imported. Original artwork is made in CSS/SVG, and the short sound is synthesized. Full dependency license texts accompany the source.

## Twitch architecture

Sources read: [developer docs](https://dev.twitch.tv/docs/), [chat](https://dev.twitch.tv/docs/chat/), [EventSub](https://dev.twitch.tv/docs/eventsub/), [WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [chat message subscription](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatmessage), [OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/), [refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/), [validation](https://dev.twitch.tv/docs/authentication/validate-tokens/), and [rate limits](https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits).

Decision: a confidential server application uses the broadcaster’s own user token, requesting only `user:read:chat`. It subscribes to that user’s channel chat with EventSub WebSockets. This avoids an extension, separate bot identity and chat-write permissions.

Twitch requires validation on startup and hourly. BAIT also refreshes expiring tokens, retries a Helix 401 once after refresh, and observes rate-limit reset responses. On WebSocket migration it keeps the old connection until the new welcome and does not recreate migrated subscriptions. Unexpected disconnects use bounded exponential backoff; a watchdog checks keepalives. Notifications are checked for age, channel and duplicate IDs. Revocation invalidates control sessions and ends the active round.

The [Twitch Developer Services Agreement](https://legal.twitch.com/en/legal/developer-agreement/) is linked from Twitch’s documentation. Its body was not available in the research tool’s rendered response. This is a recorded research limit, not a claim that its full legal text was verified. The operator must review Twitch’s applicable terms before public operation and keep a privacy/contact policy appropriate to the deployment.

## Speech choice

Sources: [Deepgram live audio](https://developers.deepgram.com/reference/speech-to-text/listen-streaming) and [keepalive behavior](https://developers.deepgram.com/docs/audio-keep-alive).

Decision: Deepgram Nova-3 English streaming behind a server proxy. The documented endpoint supports raw PCM, final/interim results, per-word confidence and timestamps. An AudioWorklet captures only the consented microphone. The server never gives the provider the target as a prompt, avoiding target-conditioned guesses.

Final results are checked against the active round and epoch, audio position, receipt freshness, confidence and normalized word boundaries. This is text verification, not proof of the speaker’s intent. Household voices, poor microphones, accents and recognizer mistakes remain possible. The streamer can reverse a win; the revealed word is retired for subsequent rounds.

The local demo transcript input is a labeled development fixture. It does not perform speech recognition. The real Twitch studio cannot access it.

## Design decisions against the judging criteria

| Criterion | BAIT decision |
| --- | --- |
| Originality | Adapts conversational secret-word and forbidden-clue games to live Twitch chat, with role-separated views, speech detection and manual awards. |
| Community impact | No viewer accounts or downloads; low-population rooms can lower the skip threshold. Every win belongs to the group. |
| Implementation | Server-owned transitions and projections, typed contracts, encrypted tokens, live adapters, and automated failure-path tests. |
| Design and entertainment | Purple and charcoal Twitch cues, Material icons and controls, an illustrated example round, a mobile viewer room and a transparent broadcast overlay. |

The companion page shows the word separately from the broadcast. The studio and OBS receive no active target, but the streamer can still open the viewer link. The product explains that trust-based rule. See [the design notes](design.md) for the visual references and copy decisions.
