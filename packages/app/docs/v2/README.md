# BAIT v2: Dealt In

Status: the design review's required fixes are implemented in the isolated local mockup. The corrected page, card hand and film frames were checked; the final desktop and phone exports are complete. The mockup is available for owner review. Source checks passed; branch CI is tracked in the [verification record](verification.md). No release, deployment or live landing change.

## Design lead

A separate design pass completed the direction, page plan, film storyboard and gameplay plan on 25 October 2026. The run had a 45-minute deadline; it completed successfully in about 30 minutes without permission denials. The implementation is built and checked against the current game.

The art proof review accepted the three new film sheets with specific crop, mask, alignment and motion fixes. Its subsequent page/film review identified seven required fixes, including a blocking hero overlap. Those fixes were implemented and checked without regenerating the art. Both reviews had a 45-minute limit. The design review has not re-reviewed the final exports, and neither review constitutes release acceptance. The [verification record](verification.md) contains the exact verdict, completed fixes and review limits.

- [Landing and interaction plan](landing-plan.md)
- [The Spicy Mountain: hero storyboard](hero-storyboard.md)
- [Gameplay and the 100-card / 1,000-word plan](gameplay-plan.md)

The plans are proposals, not claims of shipped capabilities. Existing game functionality and remaining acceptance work are tracked in [the master plan](../master-plan.md).

## Review boundary

The study lives in `concepts/bait-v2/` on a private feature branch. Paolo's sources, the existing game and both hosted landing domains remain unchanged. The 18 approved card images and bomb are reused. No bulk card generation or gameplay expansion belongs to this mockup.

The next owner decision is whether to polish or integrate this direction. Integration into the maintained landing package, deployment, tags and Extension submission are separate steps.

The current study includes the staged film, the 18-card hand, a local hint-writing toy and responsive layouts. It has no live Twitch, microphone or OBS connection. The [verification record](verification.md) separates completed checks from remaining acceptance work and records differences from the original proposal.

## Source corrections

Implementation must preserve the real game's distinction between an unconfirmed candidate and a scored catch. The candidate stops the round and may reveal the target; the win and celebration happen only after the streamer confirms. The active, paused and settling studio views keep the word hidden.

The design pass's new opener-eligibility rule, rarity ideas, recognition thresholds, schema, card mix and playtest thresholds remain proposals. A clean hint in the landing toy is only eligible under the current literal-word rule; it does not guarantee the streamer's manual pick.

## Local review

Run from any directory:

```sh
env V2_PORT=3321 V2_SECONDS=10800 node /home/maff/foss/worktrees/twigame/bait-v2-mockup/scripts/preview-v2.mjs
```

Open http://127.0.0.1:3321/. The server uses a strict port, is local to this computer, and stops after three hours or Ctrl+C. Physical iPhone review is still needed; browser viewport checks do not substitute for it.

The corrected videos are 32 seconds at 30 fps, with desktop and phone MP4/WebM versions and optional Sound Lab audio. Both WebM versions play in the local browser; playback starts muted. The 18-card hand loads all seven visible cards before showing them, including BOOMERANG. Phone headline checks passed at 390 px and 320 px. Physical iPhone/Safari, touch and subjective audio review remain pending. See [local verification](verification.md) for the evidence and remaining gates.
