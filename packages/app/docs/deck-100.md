# The 100-card deck

The built-in deck contains 100 distinct English targets: 35 easy, 34 medium and 31 hard. The latest 22 additions favor recognizable objects, animals and scenes with different silhouettes. Existing targets keep their difficulty and order.

| Difficulty | New targets | Active forbidden clues |
| --- | --- | --- |
| Easy | balloon, guitar, carrot, cupcake, umbrella, elephant, hamburger, butterfly | None |
| Medium | pineapple, crocodile, astronaut, binoculars, seahorse, hammock, scarecrow, waterfall | First two |
| Hard | chameleon, metronome, terrarium, pendulum, pomegranate, marionette | All four |

Every target has four ordered clues in `server/cards.ts`. The easy cards still carry a complete authored clue set for review, but only the target itself is off limits in an easy round. The server selects the active subset. The review catalogue and landing examples read from the same authored content.

## Presentation and distribution

The cards keep the approved Cut Open face: a contained illustration without an inner rectangle, an angled color field, clear clue words, a Prism back and a pixel reveal. Card titles, clue restrictions, timers and the Baited wordmark remain interface elements. New art does not contain those elements.

Canonical images live in `public/cards/proofs/<word>.png`. The provenance manifest is `public/cards/proofs/expansion-100.json`. The sync script verifies the original hashes and copies each image unchanged to `extension/assets/card-<word>.png` and the landing's source catalogue. Development Card Lab can review the complete set.

The public landing keeps exactly ten fixed example cards. Its output excludes the remaining target records and artwork. Production also excludes Card Lab. This reduces casual browsing of the deck; it is not a promise that a curious streamer cannot learn built-in targets. During a round, the Studio and OBS payloads omit the active target, its clues, its example and its identifying ink color.

## Verification

`tests/deck-catalogue.test.ts` checks all 100 distinct targets, the difficulty counts, four nonduplicate clues per target, review-catalogue parity, image names and usable example questions. It deals every card and verifies the viewer receives the correct target and active clues while Studio and OBS do not. Text matching checks use the real game rule, including whole-word matching and spoiler checks.

The landing catalogue test verifies original PNG dimensions, provenance hashes and unchanged copies. The public-sample tests check that only ten example records and their artwork can reach the landing output. Card Lab's model and the selected-card tests cover the complete catalogue without changing the approved face.

These are content, code and asset checks. Recognition quality for the 22 additions still needs real Moonshine speech with the intended microphone and stream setup. In that session, try a natural sentence containing each target, a nearby-sounding word, background audio and a phrase without the target. Record misses or false catches before changing difficulty or adding speech aliases.

Updating source assets does not update an installed Twitch panel. The expanded Extension needs a fresh ZIP and Hosted Test upload after the local review. No production release or Twitch review submission is implied by this deck update.
