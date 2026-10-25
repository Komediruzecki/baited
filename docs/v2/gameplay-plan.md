> Design proposal by Claude Opus 5.5, completed 25 October 2026 using the irch account. Max effort was requested; the CLI did not report an effective effort level. This is a local review study. Gameplay additions, live integration and release remain pending owner review. The original full response is preserved separately; see README.md for evidence and implementation corrections.

# PLAN B: gameplay, surprises and the growing deck

## B1. Starting point

**Already built** (not sold as new):

- Easy, Medium and Hard with 0, 2 or 4 off-limits clues
- Skip votes
- Pause and resume
- Win reversal
- Three-word missions
- Call the bait (one private guess; +15 s when wrong)
- Streamer's pick (a manual award)
- Moonshine catch with broadcaster confirmation
- Six opt-in sound cues

**Content today:** 72 single-word English targets (24 per difficulty), each with 4 ordered clues; 18 of them illustrated.

**Not built:** the Extension, Six-word showdown, Bank or bait, Pass the mic, any rarity system, and real-mic and real-Twitch acceptance.

**Ground rule for every proposal:** none of them ships before that real-round acceptance passes.

## B2. Prioritized features

Each row lists the player moment and an example, the rule or state change, the effect on scoring and fairness, the risks, what it needs to build, and the playtest that would justify keeping it.

### First-release additions (after acceptance)

**1. Openers: authored question hints**

- **Moment and example.** A quiet chat doesn't know how to start. A viewer taps **Need an opener?** and sees _"Where would you definitely not build a house?"_
- **Rule change.** One authored bait line per card. It is revealed per viewer on tap, and appears in the viewer view and Extension only, never in studio or OBS. A hint that pastes the opener word for word is not eligible for the streamer's pick (normalized comparison).
- **Scoring and fairness.** The community win is unchanged. The award still rewards original bait.
- **Risks.** Copy-paste floods, and a streamer who learns the openers. Mitigations: openers are hidden until tapped, and each card has up to three that rotate.
- **Needs.** A panel button, a `baitLines` field per card, and the eligibility check.
- **Depends on.** The deck metadata (B6).
- **Playtest.** Three quiet-channel rounds with openers and three without. Keep it if the time to the first clean hint drops and fewer than 30% of hints are verbatim pastes.

**2. Moment stamps: cosmetic outcomes from real timing**

- **Moment and example.** A catch at 9 s gets a **Speedrun** stamp on the celebration. A catch with 3 s or less left gets **Photo finish**.
- **Rule change.** None. The stamp is computed from the existing `elapsed` value after confirmation.
- **Scoring and fairness.** No effect on time, score or recognition.
- **Risks.** None for moderation.
- **Needs.** Two stamp SVGs and an optional layered cue. Reduced motion shows the stamp still.
- **Depends on.** Nothing.
- **Playtest.** Ask after the round whether anyone noticed or mentioned it. Keep it if it is mentioned in chat at least once per session.

**3. Card reactions on the reveal**

- **Moment and example.** In the OBS celebration, PENGUIN belly-slides across the overlay; ROCKET leaves through the top.
- **Rule change.** None. The 5.5 s celebration window is unchanged.
- **Scoring and fairness.** None.
- **Risks.** Visual noise on stream. Each reaction is capped at one sprite path.
- **Needs.** One motion path per illustrated card. Reduced motion shows a single reaction still. Sound is opt-in, from the studio only.
- **Depends on.** The illustrated cards.
- **Playtest.** Streamers rate on-stream readability. Keep reactions that don't cover the word for more than 0.5 s.

**4. Join nudge on the overlay**

- **Moment and example.** A viewer without the panel sees **Chat has a word. Open the BAIT panel below the stream.** for the first 10 s of a round.
- **Rule change.** An overlay copy state only.
- **Scoring and fairness.** None.
- **Risks.** It must never show the word.
- **Needs.** One overlay string.
- **Depends on.** The Extension.
- **Playtest.** Ask new viewers after round 1, "How did people know the word?" Keep it if at least 70% answer correctly.

**5. Reconnect restore**

- **Moment and example.** A viewer's phone sleeps mid-round. On return the panel shows **Back in the round.** with the current card.
- **Rule change.** The panel re-authorizes and fetches state. Nothing secret goes in URLs.
- **Scoring and fairness.** None.
- **Risks.** A stale card after a skip.
- **Needs.** A state version check and a chip.
- **Depends on.** Extension auth.
- **Playtest.** Kill the network for 20 s mid-round on three devices. It must recover within 2 s.

**6. Six-word showdown: the first playable experiment**

- **Moment and example.** The panel shows **Six words or fewer.** A clean seven-word hint stays visible in chat but can't win the pick.
- **Rule change.** As in `tabletop-options.md`: the mode is snapshotted per round, the game's tokenizer counts words, and only the award eligibility changes.
- **Scoring and fairness.** Community wins are unchanged. Don't compare its awards with Classic rounds.
- **Risks.** Contraction counting needs to be explained.
- **Needs.** A studio toggle, a panel badge and an overlay badge.
- **Depends on.** The existing award system.
- **Playtest.** Below.

### Later experiments

**7. Bank or bait**

- **Moment and example.** After word 2 of a mission, chat votes **Bank 1** or **Risk for 3**.
- **Rule change.** A separate bonus ledger, one decision window, the latest vote per user, and a tie banks.
- **Scoring and fairness.** It adds a bonus economy, with rollback on reversal.
- **Risks.** Vote brigading. Use one vote per authenticated user.
- **Needs.** A vote interface and a ledger.
- **Depends on.** Proven missions and reversal.
- **Playtest.** Five missions. Keep it if at least 60% of chat votes without being prompted.

**8. Pass the mic**

- **Moment and example.** Two streamers relay; each catch hands the mic over.
- **Rule change.** An active-speaker state and per-mic ownership.
- **Scoring and fairness.** Expiry is attributed to the active side.
- **Risks.** Guest consent and attribution.
- **Needs.** Two-mic routing and a ready confirmation.
- **Depends on.** Multi-session microphones.
- **Playtest.** One two-streamer segment with zero mis-routed catches.

**9. Shiny backs (cosmetic rarity)**

- **Moment and example.** Roughly 1 deal in 40 uses a dithered gold card back, visible to chat only.
- **Rule change.** None. Chosen when the card is dealt, server-side, with no effect on which word is picked.
- **Scoring and fairness.** None. Stated publicly as cosmetic.
- **Risks.** People thinking it's pay-to-win. It is never sold.
- **Needs.** Two back designs. The existing rare-catch cue plays on a shiny catch.
- **Depends on.** The Extension.
- **Playtest.** Check chat mentions. Drop it if it is never noticed.

**10. Combo flourish**

- **Moment and example.** A mission lands ROCKET and then TELESCOPE (a proposed family pair).
- **Rule change.** Needs family pairs in the deck.
- **Scoring and fairness.** Cosmetic only.
- **Risks.** It nudges word selection. The pick stays random; the flourish only reacts.
- **Needs.** Pair metadata.
- **Depends on.** Deck families.
- **Playtest.** Later.

**Six-word showdown playtest.** Three streamers × six rounds, alternating Classic and Six. Measure the share of hints at six words or fewer, and the time to catch. After round 1 ask, "What was different this round?" Keep it if at least 70% answer correctly _and_ at least two of three streamers want it on.

**Spam and moderation across all features:**

- BAIT never deletes Twitch messages.
- Flagged and verbatim hints only lose award eligibility.
- Hint review text stays in memory for at most ten minutes after the round stops, and may be replaced sooner.
- No feature punishes all of chat for one stranger's message (the Taboo lesson in `tabletop-options.md`).

**Low attendance.** Recommend Easy, 180 s and openers on. Moment stamps make even a slow catch fun to see.

## B3. Question hints and conversation setups

**Three kinds of hint, all viewer-only:**

1. **Openers:** per-card authored questions (feature 1).
2. **Setups:** per-category nudges that point at a topic, not the word. For example, Food: **Ask what they'd cook for chat.** Places & nature: **Ask where they'd build a secret base.** One per category, shown under the opener.
3. **Twists:** a later mode for authored constraints, such as "Hint only with questions." Six-word showdown is the first of these.

**Rules for every authored line:**

- It must pass the game's own checker against the target and **all four** clues, so it stays legal on any difficulty.
- It must not contain an inflection or compound of a clue (JUMPING, HOUSEPLANT).
- Test whether the expected answer is the target rather than a synonym. METEOR is an example to reject or revise if participants answer "asteroid". A source review alone cannot establish natural-answer quality.
- It must be a question to the streamer, not a statement of the answer.

## B4. Easter eggs and surprises

Every surprise is cosmetic, triggered by an event that already happened, and changes nothing about timing, scores or recognition. Each one has a still, reduced-motion form and stays silent unless sound is on.

**In the game:**

- Moment stamps (feature 2).
- Card reactions (feature 3).
- When BANANA is caught, the bomb on the overlay briefly wears a peel. Each illustrated card gets one gag like this, written into the reaction sheet.

**On the landing:**

- Typing `bait` while the deck has focus flips all 18 cards to their backs, then deals them back. Reduced motion: an instant swap.
- The 19th card at the end of the deck is a back reading **Shh.**

**Sound combinations:** a celebration on a shiny back layers the existing rare-catch cue. Shiny backs would introduce cosmetic rarity. They do not change the word, clock or score; the existing rare-catch sound does not implement that system.

## B5. Readability and robustness after one round

The test is that a newcomer can answer three questions after one round:

1. Who knew the word?
2. Why did the streamer avoid the mountain?
3. Who won?

Support for that:

- The overlay join nudge (feature 4).
- The panel's result state uses the real copy (**The streamer said it.**).
- The streamer's pick is shown publicly as **Streamer's pick: @name**.

Measure it in every playtest with those three questions; at least 2 of 3 correct counts as understood.

## B6. The deck: 100 playable cards, then about 1,000 words

**Two separate inventories:**

- **Target: 100 playable cards in deck v2.** Each is a complete playable card: target, difficulty, 4 ordered clues, 1 to 3 openers, a category, and an art treatment.
- **The word bank** grows to about 1,000 vetted entries. They render through reusable layouts. Bespoke art is reserved for the best roughly 150.

**Mix for the 100 cards:**

- **50 illustrated:** the 18 approved, untouched, plus 32 new bespoke pixel illustrations made in proof-sheet batches.
- **50 type-led:** cards in a shared family layout.

**Type-led family layout.**

- Same card stock and footer (**Bait them.** + **bait!**).
- The art window holds:
  - a category field: one of 10 hues, desaturated and tested at 3:1 or better against the yellow word
  - one of 3 pixel dither patterns
  - the category's pixel pictogram, placed left, centre or right by a hash of the word
- That gives 90 combinations, so neighbouring cards differ. The word stays in its yellow title slot.

**Categories and pictograms (10):**

| Category              | Pictogram     |
| --------------------- | ------------- |
| Food & drink          | fork          |
| Animals               | paw           |
| Places & nature       | peak          |
| Objects & gadgets     | gear          |
| Myth & fantasy        | star          |
| Music                 | note          |
| Sports & motion       | ball          |
| Space & sky           | ringed planet |
| History & wonders     | column        |
| Clothes & accessories | hat           |

There is no gameplay rarity. Difficulty follows the existing pools.

**To reach 100: the 72 existing targets plus these 28 candidates** (pending the editorial pass):

- **Easy:** toaster, umbrella, backpack, candle, pineapple, skateboard, snail, crown, ladder, kite
- **Medium:** hedgehog, kangaroo, snorkel, lantern, hammock, trumpet, scarecrow, walrus, hourglass, treehouse
- **Hard:** cauldron, chameleon, metronome, gondola, stalactite, xylophone, lasso, anchor

**Worked examples, with the checks applied:**

| Word (diff.) | Clues, strongest first             | Opener                                                     | Check notes                                                                   |
| ------------ | ---------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| TOASTER (E)  | bread, toast, kitchen, pop         | What pings when breakfast is ready?                        | Avoids all four clues.                                                        |
| HEDGEHOG (M) | prickly, spines, hibernate, garden | Who rolls into a ball when you say hello?                  | SPINES is also a CACTUS clue: a cross-link, allowed and logged.               |
| KANGAROO (M) | australia, pouch, hop, joey        | Who keeps their baby in a front pocket?                    | "Pocket", not "pouch".                                                        |
| SNORKEL (M)  | diving, breathe, mask, underwater  | What lets you watch fish without coming up for air?        | Passes.                                                                       |
| HAMMOCK (M)  | swing, nap, trees, beach           | What do you lie in when you're too lazy for a chair?       | The first draft "…that swings…" failed: the checker reads SWINGS as a plural. |
| CAULDRON (H) | witch, potion, pot, bubbling       | What does a spooky soup get stirred in?                    | Passes.                                                                       |
| LANTERN (M)  | light, candle, lamp, glow          | What would you carry through a haunted house?              | CANDLE is also a target: logged.                                              |
| TRUMPET (M)  | brass, instrument, jazz, loud      | What does the kid in the back row of band class blow into? | A draft with "loudest" was rejected as an inflection.                         |
| METEOR (H)   | (not used)                         | (not used)                                                 | **Rejected**: people answer "asteroid" (answer ambiguity).                    |

**Proposed content shape** (for review; the schema is the owner's call under PROC-02):

```json
{
  "id": "volcano",
  "word": "volcano",
  "difficulty": "medium",
  "category": "places-nature",
  "clues": ["lava", "eruption", "magma", "mountain"],
  "baitLines": ["Where would you definitely not build a house?"],
  "watchForms": ["volcanoes", "volcanic"],
  "crossLinks": [],
  "pronunciation": "vol-KAY-no",
  "art": {
    "treatment": "illustrated",
    "asset": "cards/proofs/volcano.png",
    "provenance": "manifest.json"
  },
  "recognition": { "status": "pending", "voices": 0, "decoyFalseCatches": null },
  "review": { "status": "proposed", "notes": "" },
  "retired": false
}
```

`watchForms` is diagnostic metadata only. Current target matching does not accept "volcanoes" or "volcanic" as "volcano"; adding aliases would need a separate gameplay decision. The metadata example is proposed, while existing art approval remains intact.

The full word bank stays server-side, as today. Only the showcase cards appear on the landing.

**Editorial checklist, for every entry:**

1. **No duplicates or inflections:** no plurals, -ing, -ed or compound neighbours of an existing target.
2. **Recognizable** across UK, US and AU English; no regional words.
3. **Appropriate content:** no brands, real people, religion, politics or violence; no innuendo when the word is said aloud.
4. **The four clues are the four most obvious paths**, ordered so Medium bans the two strongest.
5. **Collisions logged:** a clue that is another card's target.
6. **The opener passes** the checker against all four clues, and its natural answer is the target.
7. **Pronunciation is unambiguous:** no homophones and no common mispronunciations.
8. **Rate of accidental use:** words streamers say constantly ("game", "chat") are excluded, and very rare words are capped at Hard.
9. **One word** of 3 to 14 letters. Phrases and other languages are a separate proposal.

**Real-voice recognition check, per new word:**

- Three real voices with different accents. Each says the word alone, mid-sentence, and shouted fast: 9 takes.
- Plus 3 near-miss decoys per word (for VOLCANO: "volcanic", "Vulcan", "vol-au-vent").
- **Proposed screening threshold:** 8 or more of the 9 detected in Moonshine, and 1 or fewer false candidates across three decoys. This is not a validated accuracy measure and permits one false candidate in only three decoys. The implementation review recommends zero decoy false candidates before promotion, followed by broader speaker/noise checks. Keep manual confirmation.
- Synthetic speech doesn't count toward a pass.

**Retiring a word in live play.** Count Not said, confirms, skips and escapes per word. Retire the word if Not said is pressed in more than 20% of its catches over at least 10 catches, or if it is skipped in more than 40% of its rounds over at least 10 rounds. Retired words keep their record and are never deleted.

The retirement thresholds above are proposed heuristics and require new aggregate counters. Review microphone, accent and word ambiguity before retiring a target; do not retain raw audio or chat solely to collect these metrics.

The voice-check workload is 336 takes for the first 28 additions, 1,800 per 150-word wave and 11,136 for all 928 additions. Start with the 28-word pilot and a consented, labeled corpus.

**Production batches:**

| Batch  | Contents                                                                                                                                                                                                                  | Gate before the next batch                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 0      | The 11 gallery opener fixes (A5, including three Easy-card editorial changes); a type-led template proof (one sample in each of the 10 categories); metadata for the 72 existing targets (category, openers, watch forms) | Owner review of the template sheet                                                                                  |
| 1      | The 28 new targets with full metadata; 12 bespoke illustrations (proof sheet of 4, then 8)                                                                                                                                | Editorial and recognition checks pass                                                                               |
| 2      | 20 more bespoke illustrations (total 50), and 50 type-led cards rendered                                                                                                                                                  | A visual consistency review of all 100 side by side                                                                 |
| 3 to 8 | Word bank waves of 150 words each, up to about 1,000: 40% Easy, 35% Medium, 25% Hard; about 100 per category; original brainstorming, never commercial card lists                                                         | Each wave passes editorial review, recognition checks run in groups of 50, and fewer than 5% are retired in a trial |

## B7. First batch and first experiment

**First batch: Batch 0.** It needs no generated bulk art, and it fixes a live content defect.

**First playable experiment: Six-word showdown.** It reuses the existing award system and changes only award eligibility. Its playtest is defined in B2.

Nothing is generated in bulk or merged into gameplay during this planning pass.

---
