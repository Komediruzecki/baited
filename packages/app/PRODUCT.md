# baited

## Platform

web

## Users

Twitch streamers hosting a round and viewers working together in chat. The landing also helps prospective streamers and hackathon judges understand the game.

## Product Purpose

Chat gets a secret word and tries to make the streamer say it before the round ends. The streamer cannot see the word during live play. Local Moonshine proposes a catch for the streamer to confirm; the game then resolves the round and shows the result.

## Positioning

Viewers steer an ordinary conversation toward a hidden word. The entertainment is the moment the streamer realizes what chat was doing.

## Operating Context

The current build has an external streamer studio connected to Twitch chat through EventSub, a standalone viewer room, an OBS browser overlay, and native Twitch Extension viewer/configuration surfaces. The redesigned Extension version 0.0.2 is uploaded in Twitch Hosted Test, not publicly released or submitted for review; its activation on the channel still needs confirmation. Earlier successful rounds used version 0.0.1. The test backend at play-baited.maff.app runs through a named Cloudflare Tunnel on the owner's Linux computer; its availability depends on that computer and the bounded backend/tunnel processes. OBS testing uses the same Linux computer.

## Capabilities and Constraints

- Keep Paolo's original source safe and the GitHub repository private.
- The canonical private repository is Komediruzecki/baited. It contains the app and Extension in packages/app and the landing in packages/landing. The landing domains are baited.maff.app and dev.baited.maff.app; a private upstream snapshot is the preserved migration source, not the active landing package. Landing releases, Hosted Test updates and public Extension releases are separate. See docs/master-plan.md and docs/HOSTED_TEST.md for the setup and Extension plan.
- The current playable catalogue has 78 illustrated targets. Artwork stays separate from titles, clue restrictions and example questions. Off-limits clues remain readable without a strike-through.
- Simulated previews must identify themselves. A staged landing example must never be represented as a live Twitch session.
- Current speech integration defaults to local English Moonshine in a browser worker. Its proposed catches require broadcaster confirmation because the SDK confidence field is a constant placeholder. Deepgram remains optional for automatic scoring; ElevenLabs has no adapter. The landing needs no speech provider. See docs/moonshine.md and docs/moonshine-rehearsal.md.
- The owner reported successful Hosted Test rounds with Paolo, live Twitch chat and accurate Moonshine recognition. The owner also confirmed that refreshing the OBS browser source restored the displayed wins and streak. These are reports from that test session, not a substitute for repeatable connection checks, recorded evidence or physical-device acceptance. Simulated fixtures establish none of those live outcomes.
- Never show the active secret word in the live streamer's studio or OBS overlay. A labelled local/demo-only reveal exists for solo testing. The landing may explain the word through a clearly labelled example. Transcript preview is opt-in local/test diagnostics and must not reach viewer or overlay payloads.

## Brand Commitments

Product name: Baited. The latest owner decision is to use the supplied plain original BAITED wordmark for product mastheads and card backs. The card's own signature follows the landing's approved card, which signs with the pixel logo. Earlier hook variants and bomb artwork are preserved references, not authority for the current branding. Existing product screens use violet, charcoal and limited yellow; the in-progress redesign must follow the owner's latest direction rather than treating the older palette or mascot choices as new approval.

The approved landing in packages/landing is the current visual reference. Extend its typography, playing cards and violet accents into useful product controls. Keep each surface's information boundary: secret card for viewers, round and microphone controls for the streamer, compact transparent broadcast graphics for OBS. Earlier design critiques and the subsequent polish are recorded in docs/product-design-review.md; they do not constitute final acceptance of the current redesign. Use product-voice for visible language.

The card and product-surface redesign is in progress, following the written design specification. The owner will choose the card edition. Preserve the current behavior and readable-clue baseline while that decision is pending; do not invent or present an unapproved visual direction as settled.

## Evidence on Hand

The current app, automated tests, simulated previews and the owner's reports of successful Twitch/Paolo/Moonshine rounds are available. Original and alternative artwork remains preserved. A reported live test is distinct from a captured demo or a device-specific acceptance check; do not infer a recording, customer count, endorsement or performance claim from it.

## Product Principles

- Demonstrate the actual secret-word loop before explaining setup.
- Keep streamer and viewer information separate.
- Make detection failure and correction understandable.
- Let users choose audio explicitly.
- Preserve a playable, readable experience when motion is reduced.
