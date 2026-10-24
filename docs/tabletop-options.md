# BAIT: ideas from tabletop rules

Research checked 25 October 2026. Proposals only. No application changes.

Paolo's suggestion is useful for finding decisions that change a round. BAIT already has the core ingredients of a party game: a secret, a conversational trap, a timer, and a public reveal. The first priority is still a working round with two real people, Twitch chat, the microphone provider, and OBS. Add one optional rule only if that round is reliable.

## What BAIT already does

I inspected README.md, docs/mechanics.md, docs/quick-rules.md, and the relevant game.ts paths. These are existing source features, not new suggestions:

- Medium and Hard forbid two or four related clues. A violating hint loses award eligibility; it does not cancel the community win.
- Three-word missions share one clock. Cooldowns consume time, skips replace the target, and pauses freeze time.
- Call the bait permits one private typed guess per word. A correct guess escapes the word and active mission; a miss adds 15 seconds.
- You baited me gives the streamer one manually selected clean hint to award after a win. BAIT does not infer which person caused the spoken word.

The current mechanics document already credits Taboo and describes UNO as a presentation/teaching reference. Merely renaming these existing mechanics would not add play depth.

## Primary rules inspected

These observations come from the linked official instruction sheets, not fan summaries. They describe the specified editions; rules can differ between editions.

| Source | Rule actually inspected | What it suggests for BAIT |
| --- | --- | --- |
| [Mattel UNO, sheet 53641](https://service.mattel.com/instruction_sheets/53641.pdf), page 1, Action Cards and Penalties | Skip and Reverse alter the next turn. A disputed Wild Draw Four can be challenged, with a penalty for the wrong side. This particular sheet labels stacking as a house-rule variant. | A scarce interruption or challenge creates a decision. BAIT's existing typed guess already supplies a challenge with a cost. A full card deck would add explanation and state without fixing the core loop. |
| [Hasbro Taboo A4626 guide](https://instructions.hasbro.com/api/download/A4626_en-gb_taboo-game-instructions-manual.pdf), pages 1–2 | Forbidden clues are policed by the opposing team. An optional die changes a turn before its timer starts, including one-guesser and all-play variations. | Round-specific constraints can create variety without changing the objective. Do not import teamwide punishment for bad hints into open Twitch chat, where one stranger could deliberately sabotage everyone. |
| [Hasbro Ultimate Catch Phrase E9580 guide](https://instructions.hasbro.com/api/download/E9580_en-us_ultimate-catch-phrase-game-for-ages-12-and-up.pdf), page 2 | A correct answer transfers the device to the opposition while a shared 90-second timer continues. A 15-second stall instead passes to a teammate. The team left holding it loses the round. | Transfer responsibility while preserving time pressure. A co-streamer relay could create a visible handoff, but needs explicit active-speaker routing. |
| [Hasbro Cranium 16577 guide](https://instructions.hasbro.com/api/download/16577_en-ca_cranium.pdf), page 4 | The other teams choose the final activity's card box; failing that activity permits another attempt on a later turn. | Let the audience choose a final-round constraint rather than adding more hidden scoring. The PDF's earlier pages have poor text extraction; this report relies only on the legible final-activity rule. |

The ideas below are proposed BAIT adaptations. They are not rules from those games or claims that no other game has used similar mechanics.

## 1. Six-word showdown: the smallest useful addition

Use the Taboo modifier principle for one optional round: chat must craft an award-eligible hint in at most six words. Ordinary Twitch conversation continues. The streamer still tries to avoid the secret target, and microphone detection still decides the community win.

Suggested state rules:

1. The studio selects Classic or Six words before starting. Snapshot the choice into the new round so changing settings cannot change an active round.
2. In Six words, normalize the hint with BAIT's word tokenizer. A candidate must have one to six words and pass the existing target-spoiler and forbidden-clue checks. Punctuation does not count as a word. Explain how contractions count in the viewer rules.
3. Longer messages remain visible in Twitch. BAIT marks only that hint ineligible for the existing streamer award. No time subtraction, shared punishment, or message deletion.
4. Show the active constraint on the viewer card and OBS view. Keep the target and forbidden words out of studio/OBS projections.
5. Keep the current community score and manual award values. Do not claim objective causation or compare this mode's individual performance with ordinary rounds as if conditions were identical.
6. Skip starts a fresh target with the same selected mode; pause/resume preserves the mode; win reversal follows existing award rollback.

This creates a visible writing constraint using the existing hint/award system. It adds no speech service, deck, random action stack, or new score economy. An optional audience choice between Classic and Six words can follow later, with a fixed pre-round vote window and server-authoritative closing time. Do not make voting a prerequisite for shipping the simple mode.

Acceptance test: a seven-word clean hint remains in Twitch but cannot win the award; a six-word clean hint can; a short forbidden hint still cannot; the community can still win regardless; pause, skip, reversal and a settings change behave as above. Play three rounds and keep the option only if viewers understand it without an explanation during the round.

## 2. Bank or bait: stronger strategy, more state

Proposed addition to three-word missions, inspired by the earlier chat's risk/reward direction and tabletop challenge costs. This is not an UNO rule.

After the second successful word, chat can bank a small mission bonus or risk it for a larger bonus by landing the third word. Existing word wins remain untouched. Illustrative tuning: bank one bonus point now, or earn three on success and zero on expiry/streamer escape. These numbers need playtesting.

Use one server-timed decision window during cooldown; count one latest vote per authenticated Twitch user, default to bank on no vote or tie, and keep the session clock running. Do not reveal or choose the third target until the risk choice wins. The bonus needs a separate ledger and explicit rollback when the second or third win is reversed. This affects mission termination, automatic rounds, history, UI and persistence, so defer it until live play and existing reversal behavior are proven.

## 3. Pass the mic: future co-streamer mode

Catch Phrase suggests a relay for a streamer and one guest: after each successful bait, responsibility moves to the other speaker while a shared clock continues. Only the active speaker's correctly routed microphone can trigger the next target. Show that speaker prominently and require their ready confirmation before recognition resumes. Resolve expiry against the active side, not whichever network event arrives last.

This could make BAIT work well as a two-streamer segment, but it is larger than a new card. It requires separate microphone/session ownership, guest consent, attribution, reconnect handling and a tested handoff. The development team's two members can instead demonstrate the existing game as streamer plus viewer; a two-person development team does not require a two-streamer game mode.

## Recommendation

For this deadline, first make the current game work reliably on a real stream. If there is time for one experiment, test Six-word showdown. If it feels like needless restriction, remove it from the submission plan. Bank or bait is the next design experiment after that; Pass the mic is a future mode.

Use original BAIT wording, targets, clue lists, artwork and audio. Keep commercial game names in research attribution rather than product branding, and do not copy their card lists or visual assets. The references establish mechanical inspiration, not an endorsement or license.
