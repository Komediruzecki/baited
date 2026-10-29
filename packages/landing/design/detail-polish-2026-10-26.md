# Original wordmark and footer polish

> Historical design and verification record from disjoint-colliders revision `87bfc5d96bd63c39b30d39c8d7d245bd7252b578`. The maintained landing now lives in `Komediruzecki/baited/packages/landing`; see [the package README](../README.md) for current commands and deployment status. Prior verification and release statements below refer to the recorded source revision, not this migration.


Owner direction: restore the supplied BAITED image with no added hook, retain the three-card hand, preserve the generated alternatives, and make the footer credit a coherent text row. This is a refinement of the existing landing, not a new design direction.

## Evidence and changes

| Status | Observation and consequence | Change | Acceptance |
| --- | --- | --- | --- |
| Confirmed, resolved | The active B proof adds a hook inside the T, superseded by the owner's choice of the original. | Track the exact supplied JPEG, render its luminance as a display mask, keep the existing ink colors and card interaction. | Source SHA-256 matches the earlier reference record. Header and card backs use the original lettering. |
| Confirmed, resolved | The footer mixes a yellow display logo, small body copy and a large serif maker wordmark on one row. The credit competes with the navigation. | Use a sentence in Inter with an understated maker link. The credit, link and navigation share 14px / 21px regular type. | Computed typography matches. Desktop alignment and phone/tablet wrapping checked. |
| Confirmed, resolved | README and asset records still call the private concept canonical and the hook logo the default. | Name this package as the canonical runtime landing; keep the game repo separate and identify its old concepts as history/render sources. Update the proof gallery's labels. | Fresh clones have their own tracked runtime assets; plans have a separate durable personal home. |
| Proposal, later | The staged film still includes earlier BAIT lettering baked into the video. | Update it during the next film render, preferably alongside the real Twitch demonstration. | Review new renders separately. No video frames or approved card art changed in this pass. |

## Reference review

A design-polish review was applied to the existing page. Published footer examples were used for structure only: one separates a small attribution from secondary links without giving it a competing display headline; another keeps its builder credit subordinate to the site's main identity. Their fonts and page designs were not copied.

The mechanical design scan reports existing Inter usage and a 3px chat accent. Inter remains the established body face and is explicitly the footer's shared typography; the existing chat accent is outside this small change. These warnings are not evidence of a broken layout or a reason to replace the approved identity.

## Verification

- Browser inspection: normal desktop (1265px), tablet (834px), phone (390px), and narrow reflow (320px). No horizontal overflow in the measured narrow/tablet layouts. This is browser emulation, not a physical Safari test.
- Original logo loads under the existing Worker content policy; no browser errors were recorded.
- Keyboard focus opens the retained card fan. Reduced motion removes its transitions. The primary action still deals a card and focuses the hint field.
- The footer maker link is readable and keyboard reachable; legal/contact navigation remains intact.
- All 21 package tests, the package type check, and the development deployment dry-run passed. No new deployment, PR or production tag was made.
- A/B/C and the previous default PNG remain unchanged. Only the new source JPEG and reproducible SVG display mask were added.

Selected screenshots and the verification receipt are in the registered output run `f26e538f16f94be5bc9cecfe4e81577a` under `agent-out-live/twigame/2026-10-26/`. Personal cross-repository planning lives in `.dotfiles/personal/games/baited`; runtime docs and provenance stay with their code.

The review covered the changed branding/footer, relevant navigation and display behavior. It is not a new legal audit or a full backend/security review. This static package has no microphone capture, Twitch authentication or newly added data flow.
