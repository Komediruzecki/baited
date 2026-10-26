# BAIT: Make the streamer say it.

> Imported project narrative, retained for context. The current submission draft and unresolved requirements are in [devpost-submission.md](../devpost-submission.md). This narrative is not evidence that the current build has passed a real Twitch, microphone and OBS test or been submitted to Devpost.

Current repository: [Komediruzecki/bait](https://github.com/Komediruzecki/bait), private. The archive-time availability statements below describe the supplied package; use the current draft for repository access and remaining live/video links.

## Short description

Chat knows the word. The streamer doesn’t. Viewers drop hints in Twitch chat, trying to make the streamer say it. When they do, microphone recognition triggers a win for the whole chat.

## How a round works

The target is banana. A viewer asks, “Best fruit in a smoothie?” The streamer answers, “Banana, obviously.” The overlay lights up. The streamer realizes why everyone was suddenly interested in smoothies.

That’s the game. The streamer keeps gaming or talking while chat tries to steer the conversation. Viewers open a companion page to see the word, then play through normal Twitch chat. They agree to keep the target out of their messages.

The studio and OBS overlay receive no active target. The streamer can open the viewer link, so fair play depends on them choosing not to look. A final, sufficiently confident whole-word speech result ends the round. The win belongs to the community. Participation counts record rounds joined. After a win, the streamer can select an eligible hint for a separate “You baited me” award. It records their choice.

## What is built

The studio controls rounds, microphone consent, difficulty, timing and automatic play. Viewers get the word, timer, rules and shared score without an account or extension. A transparent OBS browser source shows progress and reveals the word when the round ends. Skip voting lets chat move past a difficult target. Medium and Hard add two and four forbidden clues. A violating hint loses award eligibility without ending the round or removing anyone else’s win. A streamer can reverse a mistaken detection, which corrects the score, removes any award and retires the revealed word.

Optional three-word missions run on a single session timer. Call the bait gives the streamer one private typed guess per word: a correct guess escapes; a miss adds fifteen seconds for chat. The word and its forbidden clues stay out of the studio and OBS responses.

The Node/TypeScript server owns game state. Twitch authorization and EventSub bring in channel chat. A server-side speech bridge forwards consented microphone audio to Deepgram. Separate server responses keep the active word out of the studio and OBS.

The interface uses purple and charcoal Twitch cues, square cards with a hard offset shadow, the project owner’s supplied logo, Google Material icons, locally bundled Inter fonts and an original illustrated example. The landing page lets visitors replay the banana exchange or try penguin and microwave. Three short steps teach the core game; optional rules stay in a disclosure. The local demo is clearly marked as simulated.

## Inspirations

BAIT draws on secret-word conversation games, including Word Sneak, and the forbidden-clue idea in [Taboo](https://instructions.hasbro.com/en-us/instruction/taboo-game-instructions-manual). The target lists and clue cards were written for BAIT. Its contribution is adapting that conversational format to a live Twitch audience, with separate synchronized views, microphone detection, private guesses and streamer-selected awards. Guest/co-streamer missions remain future work.

UNO informed the bold card presentation and quick teaching sequence; Hasbro’s instruction library informed the goal/setup/play structure. BAIT uses its own artwork, terminology and rule text.

## How Codex contributed

Codex researched the official hackathon and API documentation, designed the roles and data boundaries, wrote the game engine and integrations, and built the interface. It ran automated tests and exercised the app in a browser. That work caught stale audio buffers, connection recovery issues and a dependency advisory; fixes were checked before packaging.

The genuine session identifier is `01a16ee8-4685-73a1-8477-a738186e6ffc`. Its source is recorded in `docs/codex-session.json`.

## What we learned

Hiding a word needs more than hiding a label. The server must leave it out of the studio and OBS responses entirely.

Speech results also need a clear lifetime. A recognizer can return a result after a pause or after a new round has started. BAIT binds each connection to a round and speech epoch, clears capture buffers and checks freshness before accepting a win.

## Verification and submission status

Automated tests and local browser checks are recorded in `docs/validation.md`. Provider adapters have fixture coverage. A real Twitch channel round and a physical microphone round through Deepgram still need to be recorded.

Before submitting, publish the source repository, configure the production Twitch app and speech service, and provide a tested HTTPS judge URL with free access through judging. Record a real round and the public YouTube demo described in `demo-script.md`. Confirm entrant eligibility against the official rules. Hosting, repository and video URLs have not yet been supplied.
