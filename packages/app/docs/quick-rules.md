# BAIT — quick rules

**Goal:** Chat tries to make the streamer say a secret word before time runs out.

## Set up

The streamer connects Twitch, shares the viewer link and enables their mic. Add the optional OBS overlay to show the clock and score on stream. Only the viewer page shows the active word.

A live round starts only when Twitch and the microphone are ready. If the microphone disconnects, the game pauses. Re-enable it before resuming.

## Play

1. **Chat gets the word.** Keep it secret. The streamer keeps streaming.
2. **Chat drops hints.** Ask questions in Twitch chat. Don’t type the target or its listed forbidden clues.
3. **The streamer says it.** Say the whole word before time runs out: chat wins. Outlast the clock: the streamer escapes.

Wrong detection? The streamer can reverse the win. Stuck? Viewers can vote `!skip` to replace the target.

At zero, live recognition may take up to 1.5 seconds to finish checking speech already captured before the buzzer. Speaking after zero does not count.

## Optional rules

| Option | Rule |
| --- | --- |
| Forbidden clues | Easy: none. Medium: two. Hard: four. A violating hint can’t receive an award; the round continues for everyone. |
| Three-word mission | Land three targets on one clock. Gaps count. Pause freezes time; a skip replaces a target. |
| Call the bait | One private typed guess per word. Correct: escape the round and mission. Wrong: chat gets 15 extra seconds. |
| You baited me | After a win, the streamer may award one eligible hint. The community keeps the shared win; the chatter gets a “BAITED BY” sting on stream and a spot on the Bait MVPs board. |

Play along: no peeking, no spoilers. Full timing, matching and award details are in [mechanics.md](mechanics.md).
