# Voice Call the bait

## Scope for the recording pilot

Use the existing English Moonshine microphone in Studio to prepare and lock a guess without switching away from the game. This is a small command vocabulary, not a conversational AI bot. No additional speech provider, API key or Twitch permission is required.

The owner chose two behaviors:

- Baity should announce a dictated draft guess publicly in Twitch chat when available.
- Preparing and locking the guess should still work through Studio when Baity is offline.

Voice guesses are opt-in. Typed guesses remain available and do not acquire public draft announcements. The stream microphone can broadcast spoken commands regardless of what the bot posts.

## Interaction

1. Enable Voice guesses in Studio and turn on the microphone.
2. Say: **“Baity bot, I am calling the bait. The bait is banana.”**
3. Pause. Check the draft in the Voice guesses control below the microphone. Baity receives an announcement request if its chat connection and announcements are available. A queued request must never be labelled “posted” without evidence of delivery.
4. Say **“lock in”**, **“locked in”** or **“locking”** as a separate phrase. Studio submits the same authenticated guess action as the existing button.
5. The normal rules decide the result: one guess per word; a wrong guess gives chat the existing time bonus. Voice commands do not change scoring.

The draft expires after 15 seconds. Repeat the command with a new word to replace it, or cancel and use the existing typed Call the bait box if the transcript is wrong. Expiry never auto-submits. Unrecognized phrases remain ordinary speech for catch detection. Say the lock phrase separately: a single utterance containing both the guess and the lock prepares the guess and asks for another confirmation. The exact wake phrase **“Bait bot”** is also accepted if Moonshine transcribes the name that way.

Public draft announcements are capped at three per round and six per minute, share Baity's existing send budget, and expire with the original draft deadline. “Asked Baity to share this guess” acknowledges a request, not a confirmed chat post. Cancel stops local lock-in; it does not retract an already requested or posted Twitch message, or speech on the stream.

## Implementation boundaries

| Part | Responsibility |
| --- | --- |
| Moonshine worker | Produce final English transcripts locally. Raw microphone audio stays on the streamer’s device. |
| Microphone controller | Recognize a narrow, complete command before sending ordinary speech for catch detection. Preserve transcript sequencing and microphone recovery. |
| Studio | Hold the draft briefly, show its announcement status, accept explicit confirmation, and discard stale commands when the round, take, connection or microphone changes. |
| Authenticated guess endpoint | Enforce the owner’s channel, current round and speech epoch, active game state, one-word constraints and the existing guess budget. |
| Baity announcement path | Post an explicitly unconfirmed draft, using existing send limits. Never reveal whether it matches the hidden target. A failed or unavailable announcement does not prevent the owner from locking the guess. |

In particular, the wake phrase contains **bait**. Recognized command words must be intercepted before scoring so using the command cannot itself lose the BAIT recording round. Ordinary speech such as “you will never bait me” must still count.

## Required verification

- Combined and split command phrases, one-word limit, capitalization and punctuation.
- Command handling before catch scoring, including the target BAIT.
- Negative phrases and normal speech still forwarded unchanged.
- Separate explicit lock, expiry, cancellation, duplicate finals and duplicate submission.
- Draft invalidation after pause, round change, Restart take, microphone loss, disconnect and lease change.
- Server authorization, round/epoch fencing, idempotency and existing bot budgets.
- No draft posting from viewers or OBS overlays; no secret-target comparison in draft announcements.
- No stale queued draft after a round ends or the take resets.
- Public draft wording and privacy copy agree; typed private guesses retain their behavior.
- Real microphone trial of the name “Baity” and pauses between phrases before filming. Automated text tests cannot establish speech recognition accuracy on a particular microphone.

## Follow-up candidates

Add further spoken commands only after this flow is reliable. Pause/resume and status could reuse existing owner actions. Starting or resetting a take should require a separate confirmation and should never trigger from ordinary conversation. Croatian speech recognition remains separate from the Croatian card-copy work.
