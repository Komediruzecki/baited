# Baity chaos

Baity chaos is an optional rule, off by default. When chat has a streak of at least three, a correct locked guess has a one-in-four chance of becoming a chat win. Baity can do this once per chaos session.

The result says the streamer guessed correctly and Baity gave chat the win. It is not a speech-detection result. Incorrect guesses still add 15 seconds; ordinary catches keep their existing confirmation flow.

## Turn it on

1. Update the hosted app and upload the matching Twitch Extension ZIP before testing this rule. Older Extension scripts do not understand the new result reason.
2. In Studio's Game settings, enable Call the bait and Baity chaos, then save.
3. Start a new word. The rule is fixed when that word starts; changing settings does not change a live word.
4. Play normally. Typed guesses and locked voice guesses use the same server-side rule.

There is no guaranteed intervention after four guesses. Each eligible correct guess has a 25% chance, until Baity uses the session's one intervention. With the setting off, no chaos roll is made.

## A session and its reset

The allowance survives Studio refreshes, reconnects and server recovery. Turning the setting off and on does not restore it. Reversing a gifted win restores the score but does not restore the allowance.

Between rounds, the owner can reset the chaos session from Game settings. This resets only Baity's allowance, not scores, history or the prepared card sequence. Restarting a recording take also starts a fresh chaos session.

If Baity cannot post to chat, the result still explains what happened in Studio, the viewer card and OBS. Bot delivery is not required for scoring. A gifted win does not open the “You baited me” hint-award picker.

## Review checks

- Off, streak below three and wrong guesses preserve the existing rules.
- The server chooses the outcome once; retries cannot reroll a committed guess.
- Recovery preserves both the result and the used allowance.
- Undoing a gift restores streaks and scores without granting another intervention.
- A reset requires the current owner session ID and cannot interrupt a live round or pending catch.
- No secret word is included in a public announcement before the result is decided.
- Studio, native cards and OBS distinguish the gift from an actual spoken catch.

For a scripted recording, leave this off unless the intervention is part of the story. It cannot affect the first three prepared rounds on a fresh take because chat cannot already have a three-win streak before those rounds.
