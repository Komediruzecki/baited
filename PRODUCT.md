# baited

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Twitch streamers hosting a round and viewers working together in chat. The landing also helps prospective streamers and hackathon judges understand the game.

## Product Purpose

Chat gets a secret word and tries to make the streamer say it before the round ends. The streamer cannot see the word during live play. Local Moonshine proposes a catch for the streamer to confirm; the game then resolves the round and shows the result.

## Positioning

Viewers steer an ordinary conversation toward a hidden word. The entertainment is the moment the streamer realizes what chat was doing.

## Operating Context

The current build has an external streamer studio connected to Twitch chat through EventSub, a standalone viewer room, an OBS browser overlay, and native Twitch Extension viewer/configuration surfaces. The native Extension is in local testing, not publicly released. OBS testing uses the owner's Linux computer.

## Capabilities and Constraints

- Keep Paolo's original source safe and the GitHub repository private.
- The owner-authorized static landing is released at bait.maff.app and dev.bait.maff.app from disjoint-colliders/packages/bait. Landing releases and game releases are separate. The live game remains undeployed. Both repositories stay private. See docs/master-plan.md for the setup and Extension plan.
- Simulated previews must identify themselves. A staged landing example must never be represented as a live Twitch session.
- Current speech integration defaults to local English Moonshine in a browser worker. Its proposed catches require broadcaster confirmation because the SDK confidence field is a constant placeholder. Deepgram remains optional for automatic scoring; ElevenLabs has no adapter. The landing needs no speech provider. See docs/moonshine.md and docs/moonshine-rehearsal.md.
- The owner reported a successful local microphone round on 2026-10-25. The opt-in transcript display still needs a refreshed real microphone check. Native Twitch installation, remote-player and actual OBS-scene acceptance remain separate checks; simulated fixtures do not establish those outcomes.
- Never show the active secret word in the live streamer's studio or OBS overlay. A labelled local/demo-only reveal exists for solo testing. The landing may explain the word through a clearly labelled example. Transcript preview is opt-in local/test diagnostics and must not reach viewer or overlay payloads.

## Brand Commitments

Product name: baited. Use the owner-approved BAITED wordmark B from the landing for product mastheads, card backs and result signatures. Reuse the approved bomb asset where a mascot is useful. The supplied bomb direction is an orange pixel-art bomb with hooked fuse, angular bait lettering, and a censored-symbol band. Violet #9146FF, restrained yellow #FFFC79 and charcoal remain accepted colors.

The approved landing in disjoint-colliders/packages/bait is the current visual reference. Extend its typography, charcoal playing cards and violet accents into useful product controls. Keep each surface's information boundary: secret card for viewers, round and microphone controls for the streamer, compact transparent broadcast graphics for OBS. Opus completed an evidence-based product critique on 2026-10-25. Codex applied the next product polish on 2026-10-26 while Opus usage was unavailable; this is not a new Opus acceptance review. See docs/product-design-review.md. Use product-voice for visible language.

## Evidence on Hand

The current app, automated tests and simulated preview are available. The supplied bomb screenshot and regenerated transparent candidate are preserved in the registered output run. There is no captured real Twitch/OBS round yet; no customer count, endorsement or performance claim should be invented.

## Product Principles

- Demonstrate the actual secret-word loop before explaining setup.
- Keep streamer and viewer information separate.
- Make detection failure and correction understandable.
- Let users choose audio explicitly.
- Preserve a playable, readable experience when motion is reduced.
