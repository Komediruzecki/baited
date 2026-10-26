# Baited Twitch listing assets

These exports use the approved original BAITED lettering, without a hook, with
the purple `#9146FF` and yellow `#FFFC79` brand colors. The square logo pairs the
wordmark with a card back. The optional tiny icon uses the B from that same
original lettering. The discovery image uses the original wordmark and a
three-card fan. The approved bomb artwork remains available separately at
`../../../public/brand/bait-bomb.png`.

| File | Twitch field | Size |
| --- | --- | --- |
| `logo-100.png` | Logo Image | 100 × 100 PNG |
| `icon-24.png` | Taskbar Icon Image | 24 × 24 PNG |
| `discovery-300x200.png` | Discovery Image | 300 × 200 opaque PNG |

The taskbar icon is required only for video-component Extensions. Baited v0.0.1
is a panel, but the export is ready if a component is added later. Editable SVG
exports and hashes are alongside the PNGs. No Twitch or third-party game logo
is included.

Run `node scripts/build-twitch-brand-assets.mjs` from `packages/app` to reproduce
the exports with librsvg (`rsvg-convert`). This also synchronizes the app and
Extension copies of the original wordmark. It preserves all older variants.

## Version Details text

**Name:** Baited

**Summary:** Chat gets a secret word. Bait the streamer into saying it before the
timer runs out.

**Description:**

Chat knows the word. The streamer doesn't. Read your card in the panel, then ask
questions and drop hints in Twitch chat without giving the word away. Get the
streamer to say it before the clock runs out and chat wins the round.

The streamer opens Baited Studio to connect their channel, enable their mic and
start a round. Speech recognition runs in the streamer's browser. The streamer
reviews possible catches before confirming a win, and can reverse a wrong call.
An optional OBS overlay shows the timer and result on stream while keeping the
active word hidden.

**General Category:** Games in Extensions

**Game Category:** Leave empty. Baited is its own game, not an integration with a
separate commercial game.

**Support contact:** hello@irchiinnuss.com

**Terms:** https://baited.maff.app/terms

**Privacy:** https://baited.maff.app/privacy

Keep the existing owner-confirmed author identity. Author email verification is
a separate Twitch email action; these files do not prove verification.

## Screenshots and submission status

Screenshots must come from the actual running panel and studio. Use 1024 × 768
or larger at 4:3, under 10 MB each. Do not use the staged landing movie or an
AI-generated interface as evidence of a working Extension. Label any local
preview capture truthfully and replace it with the real Hosted Test round
before review.

Preparing this asset folder does not upload files, change the Extension state,
or submit it for review. Track those actions in the Hosted Test run receipt.

Requirements checked against Twitch's [Extension life cycle documentation](https://dev.twitch.tv/docs/extensions/life-cycle/)
on 26 October 2026.
