# Game rules and inspirations

Start with the [quick rules](quick-rules.md). Single-word rounds during an ordinary stream remain the default. Guest/co-streamer missions are future work.

## Microphone readiness and the deadline

Real Twitch rounds require connected Twitch, a configured speech service and an armed microphone belonging to the current studio session. Readiness is renewed while the studio owns its microphone; it expires if the session stops renewing. Disabling/disconnecting the microphone pauses live play. Local demo controls remain a separate simulated path.

When a live round reaches zero while the microphone is listening, the server allows at most 1.5 seconds for a provider final covering speech completed before the deadline. It accepts no new speaking time during that settlement. Word-level confidence and capture timing determine whether a target counts. This policy needs real-provider latency/accuracy acceptance; fixture timing is not a microphone benchmark.

## Forbidden clues

| Difficulty | Forbidden clues per card |
| ---------- | ------------------------ |
| Easy       | None                     |
| Medium     | Two                      |
| Hard       | Four                     |

The built-in difficulty pools contain 100 targets: 35 easy, 34 medium and 31 hard. Every target has four original related clues in `server/cards.ts`. The active subset appears only on the viewer card. The studio and OBS do not receive it. See [the 100-card deck notes](deck-100.md) for the latest additions and checks.

For PENGUIN, the four clues are bird, ice, Antarctica and waddle. Medium reveals the first two; Hard cards reveal all four clues for their own target pool. The checker recognizes a listed word, common plural and possessive, and the usual disguises (`spoils` in `server/game.ts`): any case or accent, look-alike letters from other scripts, digits or symbols for letters (pengu1n, b!rd), stretched letters, letters typed one at a time (p e n g u i n, p.e.n.g.u.i.n), and a word split in two or three (snow man). A longer word that only contains the listed one stays clean: discord does not spoil DISCO, and birdwatching is not bird. It is a literal rule checker, not a semantic detector.

Only the violating hint becomes ineligible for the streamer’s award. A later clean hint from the same chatter can receive it. Community wins, time and other viewers are unaffected. BAIT flags messages within the game and never deletes them from Twitch. Target spoilers, disguised or not, also remain ineligible and receive no participation credit. Speech and the streamer’s private guess still need the exact word.

## “You baited me” award

After a community win, the authenticated studio shows recent eligible and flagged hints. The streamer can choose one eligible hint or leave the award unassigned. A different selection moves the award rather than adding a second point. Reversing the win removes its award and restores the previous score and mission progress.

The award is the streamer’s choice. BAIT does not infer causation. Public views receive the selected display name and award totals, with the label “Streamer’s pick.” Participation still counts completed rounds joined and is shown separately.

A new pick plays a six-second “BAITED BY @name” sting on the OBS overlay, with pixel confetti, before the corner chip takes over. Moving the award to another chatter plays it again for the new name; another hint by the same chatter does not. The sting shows the name only, never the hint.

Picks add up on the Bait MVPs board: up to five chatters with the most picks, ties broken by rounds joined. The studio’s Community tab shows it as a podium, the viewer room lists the top three, and `!bait top` posts it in chat. Room records keep 1,000 chatters; when a busy channel goes over, chatters with picks are kept before anyone with only more rounds.

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
