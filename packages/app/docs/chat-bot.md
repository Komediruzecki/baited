# Chat bot

The bot announces the game in Twitch chat. It is optional and off for every room until the streamer turns on **Announce rounds in chat** in Game settings.

## The rule it follows

The streamer reads their own chat, so the bot must never know more than the stream shows. Every message is built from the OBS overlay projection: no active word, no off-limits clues, and a finished word only for a caught or escaped round. Skipped, ended and rejected words stay unrevealed, as they do on OBS. Hints that would describe the word (its category, length or first letter) are not possible for the same reason; the bot only nudges.

## What it posts

| Moment | Example |
| --- | --- |
| Round starts | 🎣 Round 7 is live: 2:00 on the clock. Chat's secret word is in the baited panel. Make the streamer say it, never type it. |
| Mission starts, next word | 🎣 Three-word mission: chat has 3:00 to land 3 words. / 🎣 Word 2 of 3 is live. |
| Halfway (rounds of a minute or more) | ⏳ Halfway: 0:59 left and 6 chatters baiting. The word is in the baited panel. |
| Last 10 seconds | 🔥 10 seconds left. Make them say it! |
| Pause, resume | ⏸ Round paused. The clock is frozen. / ▶ Back on. 1:46 left. |
| Catch pending | 👂 Did they say it? The streamer is checking the catch. |
| Chat wins | 🎣 Baited! The streamer said OCTOPUS after 16s. Chat wins. 🔥 3 in a row! |
| A streak badge | 🏅 New streak badge: Heating up! Chat won 3 in a row. Next badge: On fire at 5. |
| Time runs out | ⏰ Time! The streamer got away. The word was VOLCANO. That ends chat's 3-win streak. |
| Call the bait | 🧠 The streamer called the bait: it was VOLCANO. / 🎯 …guessed wrong. Chat gets +15s! |
| Skip votes, skipped | ⏭ Skip votes: 2/3. Type !skip to vote for a new word. / ⏭ Word skipped. New bait next. |
| Rejected, reversed | ❌ Catch rejected. That one doesn't count. / ↩ The streamer reversed that win. |
| Streamer's pick | 🏆 Streamer's pick: @name baited them. |

With automatic rounds or a mission running, results end with “Next round in 10s.” Waiting skip tallies, nudges and pause notices are dropped when their round ends, so they never arrive late.

Run `pnpm bot:transcript` to print every message from a scripted demo session, driven by the real game and bot.

## Win streak and badges

Chat's streak counts community wins in a row. Any other finished round ends it (time out, a correct Call the bait, a skip or an ended round); a rejected catch leaves it alone. Landing on a tier earns its badge: Spark (2), Heating up (3), On fire (5), Eruption (10), Dragonfire (15), Liftoff (25) and Ultraviolet (50). Each badge unlocks once per room, with its date; landing on a tier again is still celebrated, and reversing the win that unlocked a badge takes it back. The streak itself starts at zero after a restart, as before; best streak and unlocks are saved.

The streak shows as fire: on the OBS overlay (a strip with the count, fire coins and the next badge, and a medallion beside the result card on a tier), on the Extension card and panel, in the viewer room, and in the studio's Community tab, which lists every badge with its date or progress.

## Commands

`!bait` alone still joins the round. Anyone can type `!bait help`, `!bait score`, `!bait streak` or `!bait top`; each command is answered at most once every 20 seconds, as a threaded reply.

With **Moderator commands** on, the broadcaster, moderators and lead moderators can type `!bait start`, `!bait pause` and `!bait resume`. Starting and resuming need the same readiness as the studio buttons: chat connected and the streamer's microphone armed in the studio. Viewers' attempts are ignored silently. Commands work even when announcements are off; the bot just doesn't reply.

## Limits

Twitch lets a bot that is not a moderator send 20 messages per 30 seconds across all channels and one per second per channel, and silences it for an hour if it goes over. baited sends at most 18 per 30 seconds in total and 6 per 30 seconds per channel, at least 1.1 seconds apart. Waiting messages of the same kind replace each other, and stale ones expire instead of arriving late. A 429 pauses every channel until Twitch's reset; a 403 pauses that channel for a minute and shows the problem in Stream setup.

## Set it up

The bot posts with an app access token, which is what earns Twitch's **Chat Bot** badge. That needs two consents: the bot account's own (`user:write:chat`, `user:bot`) and each streamer's (`channel:bot`).

1. **Operator, once.** Create a separate Twitch account for the bot and find its numeric user ID. Set `TWITCH_BOT_USER_ID` to that ID (it is not a secret) and restart baited. In a private window, open `${PUBLIC_URL}/auth/twitch/bot` and sign in as the bot account. baited stores the grant only if the account matches `TWITCH_BOT_USER_ID`; any other account's grant is revoked. The existing callback URL is reused, so no new redirect URI is needed.
2. **Each streamer.** In **Stream setup → Add the chat bot**, choose **Allow the bot in your chat**. Twitch asks for `channel:bot` once; later reconnects keep it. Then turn on **Announce rounds in chat** (and optionally **Moderator commands**) in Game settings.

The bot's grant is validated at startup and hourly. If it is revoked, the studio shows the bot as not signed in until the operator repeats step 1.

## Try it locally

The local demo needs no bot account. Turn on the setting, start a round, and open **Demo controls**: the bot's posts appear under **Chat bot preview** with the same pacing. Tick **Send as a moderator** to try `!bait start` and `!bait pause` from simulated chat.

Real delivery to Twitch chat, the Chat Bot badge and a moderator command arriving through EventSub are covered by fixture tests only. Verify them on a test channel before relying on them live.
