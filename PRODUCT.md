# BAIT

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Twitch streamers hosting a round and viewers working together in chat. The landing also helps prospective streamers and hackathon judges understand the game.

## Product Purpose

Chat gets a secret word and tries to make the streamer say it before the round ends. The streamer cannot see the word. Speech recognition detects the spoken target; the game resolves the round and shows the result.

## Positioning

Viewers steer an ordinary conversation toward a hidden word. The entertainment is the moment the streamer realizes what chat was doing.

## Operating Context

The current build is a standalone browser game connected to Twitch chat through EventSub, with an OBS browser overlay. It is not yet a native Twitch Extension. The first real rehearsal will use OBS on the owner's Linux computer.

## Capabilities and Constraints

- Keep Paolo's original source safe and the GitHub repository private.
- Local previews and the public development landing at dev.bait.maff.app are authorized. Its static package lives in disjoint-colliders/packages/bait. The live game and production bait.maff.app remain undeployed. Both repositories stay private.
- Simulated previews must identify themselves. A staged landing example must never be represented as a live Twitch session.
- Current speech integration uses Deepgram, recommended for the first rehearsal if the existing account has usable starter credit. Its balance and expiry still need checking. Neither Twitch nor the hackathon requires speech recognition; the static landing needs none. The current live game requires it for automatic scoring. A manual moderator mode is possible but not implemented. ElevenLabs Realtime remains an alternative; no provider switch is implemented.
- Real provider, microphone and OBS acceptance testing remains pending credentials and channel confirmation.
- Never show the active secret word on the streamer's studio or OBS overlay. The landing may explain it through a clearly labeled example.

## Brand Commitments

Working product name: BAIT. The owner supplied an orange pixel-art bomb with hooked fuse, angular bait lettering, and a censored-symbol band. Use that supplied direction in the new local mockup. Purple, yellow and charcoal remain accepted colors.

The owner rejected the current landing's generic composition and requested a new motion-led mockup informed by design.maff.app and the disjoint-colliders reference work. Use product-voice for visible language.

## Evidence on Hand

The current app, automated tests and simulated preview are available. The supplied bomb screenshot and regenerated transparent candidate are preserved in the registered output run. There is no captured real Twitch/OBS round yet; no customer count, endorsement or performance claim should be invented.

## Product Principles

- Demonstrate the actual secret-word loop before explaining setup.
- Keep streamer and viewer information separate.
- Make detection failure and correction understandable.
- Let users choose audio explicitly.
- Preserve a playable, readable experience when motion is reduced.
