# Game rules and inspirations

Start with the [quick rules](quick-rules.md). Single-word rounds during an ordinary stream remain the default. Guest/co-streamer missions are future work.

## Forbidden clues

| Difficulty | Forbidden clues per card |
| ---------- | ------------------------ |
| Easy       | None                     |
| Medium     | Two                      |
| Hard       | Four                     |

The existing difficulty pools contain 72 targets. Every target has four original related clues in `server/cards.ts`. The active subset appears only on the viewer card. The studio and OBS do not receive it.

For PENGUIN, the four clues are bird, ice, Antarctica and waddle. Medium reveals the first two; Hard cards reveal all four clues for their own target pool. The checker recognizes a listed word, common plural and possessive. It is a literal rule checker, not a semantic or evasion detector.

Only the violating hint becomes ineligible for the streamer’s award. A later clean hint from the same chatter can receive it. Community wins, time and other viewers are unaffected. BAIT flags messages within the game and never deletes them from Twitch. Explicit target spoilers also remain ineligible and receive no participation credit.

## “You baited me” award

After a community win, the authenticated studio shows recent eligible and flagged hints. The streamer can choose one eligible hint or leave the award unassigned. A different selection moves the award rather than adding a second point. Reversing the win removes its award and restores the previous score and mission progress.

The award is the streamer’s choice. BAIT does not infer causation. Public views receive the selected display name and award totals, with the label “Streamer’s pick.” Participation still counts completed rounds joined and is shown separately.

Review retains up to 40 clean hints and 20 flagged hints per word, with at most three clean hints and one flagged hint per author. The current word and previous review can coexist. Text stays in server memory, is shown only after that word is revealed, and clears ten minutes after the round or when the following round ends. Chat text is never written to disk. A selection can be made while the next word is active, until the previous review expires or is replaced. Chat commands such as `!skip` are not award candidates.

## Three-word missions

Enable Three-word mission in Game settings. The session timer defaults to three minutes and can be set from one to fifteen minutes. Each word is selected when its round starts; future targets are never sent to clients.

Chat must land three targets before the session timer expires. Each success counts as a normal word win and adds one mission step. The next target starts after cooldown, even when automatic rounds are off. Cooldowns consume session time. A skip replaces a target without adding progress. Pause freezes both speech detection and the mission clock.

At three successes, the mission ends and its remaining time freezes. If time runs out, the mission ends and earlier word wins remain. A correct Call the bait guess escapes the whole mission. End round also ends the mission. Automatic rounds, when enabled, can start a new mission after cooldown. Reversal retires the revealed target and restores mission progress; a replacement word is required.

## Call the bait

This setting is off by default. When enabled, the streamer can submit one private typed guess per word. A correct guess ends the word as an escape and ends an active mission. A wrong guess adds fifteen seconds to the current word and its shared mission clock. It consumes that word’s attempt.

The guess must be one word. Invalid or stale submissions do not consume an attempt. Requests are bound to the authenticated room, round ID, speech epoch and CSRF token. Guess text is not saved, included in URLs, displayed in chat or submitted to speech recognition. Only the outcome and time bonus are shared.

## Inspirations

The project draws on secret-word conversation games, including Word Sneak, and forbidden-clue play from [Hasbro’s Taboo](https://instructions.hasbro.com/en-us/instruction/taboo-game-instructions-manual). BAIT uses its own target and clue content. It adapts these ideas to a live Twitch audience with shared scoring, synchronized role-specific views, microphone detection, private guesses and a streamer-selected award.

The supplied BAIT logo is documented in [the brand asset notes](../public/brand/README.md). The application keeps its own interface and artwork rather than importing commercial game cards or branding.

The [official UNO mobile site](https://www.letsplayuno.com/) informed the short teaching sequence and bold card presentation. [Hasbro’s instruction library](https://instructions.hasbro.com/worldwide) informed the separation of goal, setup, play and optional rules. BAIT retains its own game loop and terminology.
