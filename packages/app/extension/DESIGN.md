# baited Extension panel

Scope: viewer and broadcaster configuration surfaces, Operate mode. This extends the approved landing's charcoal playing cards into the actual Twitch panel. Streamers and viewers often keep Twitch in a dark window beside the broadcast, so a dark ground lets the live video retain attention.

The canonical private repository is Komediruzecki/baited. The landing reference is packages/landing, served at baited.maff.app and dev.baited.maff.app. Extension version 0.0.1 is in Twitch Hosted Test, with the test backend at play-baited.maff.app; this is not a review submission or public Extension release. The owner reported successful rounds with Paolo, live Twitch chat and Moonshine. Simulated previews remain separate from those live reports and do not establish device acceptance.

The card and product-surface redesign is in progress with Opus leading the specification. The owner will choose the card edition. The current layout and behavior below are the baseline, not a new approved visual direction or final Opus acceptance. The latest branding decision is the supplied plain original BAITED wordmark, with no bomb or hook branding.

The viewer reads a single secret word, its off-limits clues, and the clock while following a Twitch stream. One left-aligned charcoal card carries all three. The asymmetric card corner, small outlined clue tags and joined `bait them.` signature follow the approved landing cards. Violet identifies actions and state; pale yellow is reserved for the active word, final seconds and the small signature. The essential rule sits inside the active card: “Make them say it. Don't type it.” The footer says “Nudge the conversation.” Waiting cards say “Only chat will know.”

- Ground `#121016`, card `#242426`, card edge `#515057`, copy `#fffdf7` / `#dedce3`, secondary `#b5afbf`.
- Violet `#9146FF`, readable violet text `#c9a8ff`, pale yellow `#FFFC79`. The main studio link uses `#7330cf` so normal-size white button text has sufficient contrast.
- Inter for controls, explanations and timing. Russo One for the word. Use the plain original BAITED artwork for branding rather than the older provisional text or hook variants.
- Earlier bomb masters, display derivatives and hook variants remain preserved references. They are not the source of authority for the new product branding.
- All 78 current playable targets have approved illustrations. Clue restrictions are interface text, separate from the artwork, and remain readable without strike-throughs.
- Static defaults; reconnect and authorization states are explicit. No automatic sound, ongoing mascot motion or hidden content that depends on animation.
- Responsive within Twitch's 318 px content width, with a 240 px defensive floor. At 318 × 500, the word, rule, four hard-mode clues, clock and skip action must remain visible. The earlier width check covered the then-current 72 words; it is not proof that the expanded 78-target catalogue or the new card edition fits. Recheck every target and hard-mode clue set in the selected design. Time uses tabular numerals. The local harness defaults to the actual 318 × 500 viewport and offers a hard-mode fixture.
- Configuration is a handoff sheet: channel status, one studio action, then numbered microphone/OBS preparation. The first step changes to “Twitch channel connected” after authorization. It has no duplicate game controls. The setup action is still hidden until authorization gives a validated destination.
- Error and reconnect messages remain above the card. Broadcaster and renewed-authorization states keep secrets cleared. No redesign changes request handling, game state, retry behavior or announcements.

## Video overlay

`overlay.html` is the Video - Fullscreen view. It deals the same charcoal card onto the live video, at the right edge and vertically centred, clear of the title and player controls. The card is 5:7 and sized from the player height (54 vh, 150–420 px); its type scales with the card but never drops below 9–10 px. Cards under 300 px tall drop the rule line and signature, and under 230 px they also drop the artwork, so the word, clues and clock stay legible in the default player. A mini player shows nothing.

- The card lands face down. A viewer's card turns over to the word; the broadcaster's never does, because the broadcaster's projection carries no target. A decided round turns over for everyone and leaves after 12 seconds. Between rounds the frame is fully transparent.
- A tab beside the card hides it; the choice is remembered per viewer when storage is available.
- Chat's win streak is public. From two wins in a row, a flame chip replaces the front kicker and sits under the clock on the back. A win shows the last positions as coins (the newest ringed, the next ones dim); a win that lands on a badge tier swaps the art for that tier's medallion. The panel adds the streak to its header and result.
- The frame keeps the default color scheme. Declaring `dark` would make browsers paint an opaque canvas behind the transparent overlay.

The Extension ZIP must exclude preview fixtures and test code. Real Twitch authorization is required by the shipped entry points. Local preview state is labelled by its separate harness, not passed off as a live session.
