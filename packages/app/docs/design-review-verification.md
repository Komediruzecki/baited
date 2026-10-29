# Card and product design review verification

26 October 2026. Review implementation on `feat/card-design-lab`, based on `d93edb9`. This records local evidence, not a deployment or Twitch review receipt.

## Implemented

- Eight card studies in a local-only Card Lab, using the fixed public catalogue of 78 illustrated targets. Word, difficulty and forbidden clues come from the game's catalogue. Selecting an edition does not change the game.
- Comparison, front/back, reduced motion, keyboard controls, picture-word reveal, long-word examples, synthetic round states and browser-local preference export.
- Updated standalone viewer, streamer Studio, native Extension viewer/configuration and OBS presentation using the original Baited wordmark, charcoal cards and violet accents.
- A local-only product review route that frames the actual app at phone, tablet and desktop sizes. It requires a credential-free demo session and disables microphone and camera access in the frames.
- Removed active bomb/hook/old `bait!` branding from the landing and current product. Historical assets remain available. The landing hero film was refreshed with the plain wordmark; its staged card layout still needs a final render after the owner selects an edition.
- Current Devpost story, stack notes, media plan and labelled review captures. No online submission fields were saved.

## Design direction

A bounded design inspection completed in 26m59s, within a 45-minute limit. The resulting specification is in `card-product-design-spec.md`.

One deliberate deviation: while OBS reconnects, the current implementation hides old word/result presentation, freezes the clock and labels retained scores as last known. It does not keep a result animation running across a disconnect. This preserves the existing reconnect behavior until fresh state arrives.

## Checked locally

- Focused React tests cover catch confirmation, result-word privacy, OBS result ownership and reconnect state, microphone states, solo mode and transcript handling.
- Native Extension tests cover Helper renewal/role changes, authorization errors, package contents and gateway behavior.
- Six Card Lab model tests cover the 78-entry catalogue, exact game clues and preference parsing.
- Landing branding/card tests, the app TypeScript check, client builds and `git diff --check` passed during implementation. The branch's GitHub Actions suite is the complete gate; consult its actual result rather than treating this note as a CI receipt.
- In-app browser inspection covered desktop Studio, phone Studio/viewer layouts, actual local OBS, native panel/configuration and Card Lab controls. The tested pages reported no captured browser-console errors at the end of the review.
- All eight studies fit the lab's 318 × 500 hard-word panel fixture with KALEIDOSCOPE and four clues. Wide deliberately uses the Table fallback in this context. Native long-word/long-clue fixtures remained readable at 318px; the 159px zoom fixture uses vertical scrolling.
- Picture's keyboard reveal and hide worked while clues remained visible. Choice notes, clearing choices, comparison and reduced-motion previews were exercised. The Card Lab itself was inspected at 320px with the touch bar visible.
- The local demo was started and paused through its real Studio controls. The viewer showed the paused target while Studio and OBS kept it hidden. This was a demo test, not a fresh live Twitch round.
- All three LAN preview endpoints returned HTTP 200. They are bounded local processes; restart commands are in `card-product-review.md`.

## Not established by this pass

- Owner/Paolo acceptance of a preferred card edition, or physical phone/tablet acceptance of the new layout.
- This redesign working inside the current Twitch Hosted Test or a native OBS Browser source. Neither was replaced or restarted.
- A controlled OBS reconnect test, the deferred Firefox blank-panel issue, or broader microphone/browser acceptance.
- An online Devpost save: the connector requires reauthentication, and the browser edit link redirects to sign-in. The saved local drafts remain the handoff.
- Final submission gallery approval, a working Twitch and build-session YouTube demo, public Extension installation, or final submission/review.

The repo stays private. No production tag, deployment, Twitch ZIP upload or review submission is part of this pass.
