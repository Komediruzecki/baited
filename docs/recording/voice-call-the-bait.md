# Voice Call the bait

## Scope for the recording pilot

Use the existing English Moonshine microphone in Studio to prepare and lock a guess without switching away from the game. Studio recognizes a small set of spoken commands. No additional speech provider, API key or Twitch permission is required.

The owner chose two behaviors:

- Baity should announce a dictated draft guess publicly in Twitch chat when available. An immediate combined lock-in skips the intermediate draft post.
- Preparing and locking the guess should still work through Studio when Baity is offline.

Voice guesses are opt-in. Typed guesses remain available and do not acquire public draft announcements. The stream microphone can broadcast spoken commands regardless of what the bot posts.

## Interaction

1. Enable Voice guesses in Studio and turn on the microphone. The round must be live and its one guess must still be available.
2. To submit immediately, say **“I am calling the bait, fish, lock in.”** Replace *fish* with your guess. You do not need to add pauses between the command, word and lock-in.
3. To check the draft first, leave off **“lock in.”** Say **“I am calling the bait, fish.”** Check the word in the Voice guesses control, then say **“lock in”**, **“locked in”** or **“locking.”** Studio submits the same authenticated guess action as the existing button.
4. The normal rules decide the result: **one guess per word**. A wrong guess gives chat **15 extra seconds**. Voice commands do not add another guess or change scoring.

When the microphone delivers the guess and lock-in together, Studio submits it immediately and skips the intermediate public draft. Speech recognition can split continuous speech into several final phrases. If the guess arrives before the lock-in, Baity can receive a draft announcement request first. That optional request does not block the later lock-in.

The draft expires after **15 seconds**. Calling intent and unfinished command prefixes also have a bounded 15-second window. Repeat **“I am calling the bait”** with a new word to replace an unsubmitted draft, or say **“cancel”** and use the typed Call the bait box. Expiry never auto-submits. While Studio shows **“Checking your guess…”**, repeating the lock phrase does not send another guess. Check the result before trying another command.

Naming Baity is optional. **“Baity bot, I am calling the bait. The bait is banana.”** also prepares a draft. The exact aliases **“Bait bot”** and **“Baity bought”** are accepted. Supported splits include **“I am calling the” / “bait” / “fish lock in”** and **“Baity” / “bot I am calling the bait fish lock in.”** Finite lead-ins such as **“Okay”**, **“So”** and **“Um”** can precede the calling phrase.

These are supported transcripts, not a guarantee that the microphone will recognize every delivery. A recognized, eligible command is intercepted before catch detection. Unrecognized wording remains ordinary speech. Negated, reported and hypothetical phrases such as **“Don’t say I am calling the bait”**, **“He said I am calling the bait”** and **“If I am calling the bait”** do not start a guess.

After the guess is used, Studio says: **“You already used your guess for this word. Voice guesses return with the next word. Saying the target still counts.”** Calling wording no longer protects speech for that word. The same applies when Voice guesses are off or the command is otherwise ineligible.

Public draft announcements are capped at three per round and six per minute, share Baity's existing send budget, and expire with the original draft deadline. “Asked Baity to share this guess” acknowledges a request, not a confirmed chat post. Cancel stops local lock-in; it does not retract an already requested or posted Twitch message, or speech on the stream.

Baity’s **`!bait` chat reply cooldowns** limit chat replies. They do not govern voice commands or the authenticated server guess action. The one-guess-per-word rule still applies even when a chat reply is ready again.

## If a possible catch appears

A recognized voice command does not create a pending catch. If the command is missed and its transcript contains the target, ordinary catch detection can trigger. The server stops the round **before** revealing the word in Studio. A pending catch confirms after 15 seconds unless rejected.

Once that notice appears, the word cannot be guessed or edited into an escape. Both Studio and the server require an active round for guesses. Rejecting a mistaken catch records a rejected catch and requires a fresh word; it does not reopen the revealed word. Command recognition must happen before catch scoring, with no retroactive conversion of a revealed catch into a successful guess.

## Implementation boundaries

| Part | Responsibility |
| --- | --- |
| Moonshine worker | Produce final English transcripts locally. Raw microphone audio stays on the streamer’s device. |
| Microphone controller | Recognize ordered commands across one or several final phrases before sending ordinary speech for catch detection. Preserve transcript sequencing and microphone recovery. |
| Studio | Hold an unconfirmed draft briefly or submit an explicit combined lock-in. Show announcement status, preserve command recognition while a guess is pending, and discard stale commands when the round, take, connection or microphone changes. |
| Authenticated guess endpoint | Enforce the owner’s channel, current round and speech epoch, active game state, one-word constraints and the existing guess budget. |
| Baity announcement path | Post an explicitly unconfirmed draft, using existing send limits. Never reveal whether it matches the hidden target. A failed or unavailable announcement does not prevent the owner from locking the guess. |

The calling phrase contains **bait**. Recognized command words must be intercepted before scoring, including when BAIT is the target. Ordinary speech such as **“you will never bait me”** must still count. A standalone **“bait”** remains scoring speech unless explicit calling or guessing intent has already armed the continuation.

## Required verification

- Combined and split command phrases, one-word limit, capitalization and punctuation.
- Command handling before catch scoring, including the target BAIT.
- Negative phrases and normal speech still forwarded unchanged.
- Combined lock-in without an intermediate public draft; separate explicit lock after a reviewed draft.
- Expiry, cancellation, duplicate finals and repeated lock-in while a request is pending.
- Slow or failed public draft requests do not block scoring; late replies cannot restore an older round or session.
- A used guess disables further voice guesses while ordinary target speech still counts.
- A pending catch stops play before reveal and cannot be converted into an escape.
- Draft invalidation after pause, round change, Restart take, microphone loss, disconnect and lease change.
- Server authorization, round/epoch fencing, idempotency and existing bot budgets.
- No draft posting from viewers or OBS overlays; no secret-target comparison in draft announcements.
- No stale queued draft after a round ends or the take resets.
- Public draft wording and privacy copy agree; typed private guesses retain their behavior.
- Real microphone trial of continuous commands, the name “Baity” and deliberate phrase splits before filming. Automated text tests cannot establish speech recognition accuracy on a particular microphone.

## Follow-up candidates

Add further spoken commands only after this flow is reliable. Pause/resume and status could reuse existing owner actions. Starting or resetting a take should require a separate confirmation and should never trigger from ordinary conversation. Croatian speech recognition remains separate from the Croatian card-copy work.
