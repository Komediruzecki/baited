# Baity, the chat bot

Baity announces the game in Twitch chat. It is optional and off for every room until the streamer turns on **Announce rounds in chat** in Game settings.

## The rule it follows

The streamer reads their own chat, so the bot must never know more than the stream shows. Every message is built from the OBS overlay projection: no active word, no off-limits clues, and a finished word only for a caught or escaped round. Skipped, ended and rejected words stay unrevealed, as they do on OBS. Hints that would describe the word (its category, length or first letter) are not possible for the same reason; the bot only nudges.

## Who Baity is

Baity is short for Baeittrice. Deceptively cute while chat wins, and louder with every round chat loses. The mood comes from chat's losing run: escaped, skipped and ended rounds add to it, a win resets it, and a rejected or reversed catch counts for neither side.

| Losing run | Voice | Example |
| --- | --- | --- |
| None | Cute: lowercase, bows and sparkles | 🎣 hiii chat ✨ round 7 is live with 2:00 on the clock. the word is in the baited panel. make bait_channel say it, never type it 🎀 |
| 1 | Locked in, all caps | 🎣 YO CHAT. LOCK IN. ROUND 8, WE GOT 2:00. THE WORD IS IN THE BAITED PANEL. MAKE BAIT_CHANNEL SAY IT, NEVER TYPE IT. DON'T SELL. |
| 2 | Unhinged | ⏰ TIME. TWO IN A ROW?? THE WORD WAS VOLCANO. HOW. BAIT_CHANNEL ESCAPES. I NEED TO LIE DOWN 💀 |
| 3 or more | Baeittrice | ⏰ TIME. BAIT_CHANNEL ESCAPES. THE WORD WAS VOLCANO. BAEITTRICE IS DISAPPOINTED IN YOU. |

The win that ends a losing run brings the bow back: “🎣 ...bait_channel said OCTOPUS? after 16s? 🥺 chat wins!! the bow is back on 🎀 Baeittrice? don't know a Baeittrice.” Asked who runs the game (`!bait who`), Baity answers “it's Baeittrice, actually 🎀 we're not friends ✨”, less politely the more chat has lost.

Every line lives in `server/baity.ts`. Each moment has two or three variants per mood, rotated per room, so the same post never goes out twice in a row (Twitch drops an identical message sent within 30 seconds). Lines keep four rules: nothing about the live word; no pronoun for the streamer, who is named by channel; chat is roasted as a group, never one chatter; and no fixed line contains a target word, which a test checks against every word in every mood.

## What it posts

| Moment | Example |
| --- | --- |
| Round starts | 🎣 round 7, 2:00 on the clock. the word is in the baited panel. make bait_channel say it out loud, never type it. no pressure!! (some pressure) ✨ |
| Mission starts, next word | 🎣 three-word mission ✨ chat has 3:00 to land 3 words. … / 🎣 word 2 of 3 is live ✨ 1:41 left on the mission clock. it's in the baited panel 🎀 |
| Halfway (rounds of a minute or more) | ⏱ HALFWAY THERE AND BAIT_CHANNEL HAS NO CLUE. KEEP COOKING. 0:59 LEFT, 6 CHATTERS BAITING. THE WORD IS IN THE BAITED PANEL. |
| Three quarters in (rounds of 90 seconds or more, after a loss) | AINT NO WAY Y'ALL ARE THIS BAD AT ONE JOB 😭 0:30 LEFT. |
| Last 10 seconds | 🔥 TEN SECONDS. CHAT. THIS IS EMBARRASSING. |
| Pause, resume | ⏸ round paused! the clock is frozen ✨ go hydrate 🎀 / ▶ back on! 1:46 left ✨ |
| Catch pending | 👂 wait wait wait. did bait_channel say it?? checking the catch ✨ |
| Chat wins | 🎣 BAIT_CHANNEL SAID IT??? NAHHH SOMEBODY CLIP THAT 💀 OCTOPUS, 16S IN. CHAT WINS. |
| A streak badge | 🏅 new streak badge: Heating up!! chat won 3 in a row 🔥🎀 next badge: On fire at 5 in a row. |
| Time runs out | ⏰ BAIT_CHANNEL GOT AWAY. THE WORD WAS VOLCANO. 120 WHOLE SECONDS AND Y'ALL DID NOTHING. UNFATHOMABLE. THAT ENDS CHAT'S 3-WIN STREAK 💀 |
| Call the bait | 🧠 BAIT_CHANNEL CALLED THE BAIT AND ESCAPES. IT WAS VOLCANO. Y'ALL GOT READ LIKE A BOOK. / 🎯 wrong guess, bait_channel 🎀 that's +15s for chat. keep it sneaky ✨ |
| Skip votes, skipped | ⏭ skip votes: 2/3 🎀 type !skip to vote for a new word / ⏭ WORD SKIPPED. NEW BAIT NEXT. THAT ONE NEVER HAPPENED. |
| Rejected, reversed | ❌ catch rejected 🥺 that one doesn't count. it's okay!! we go again ✨ / ↩ bait_channel reversed that win 🥺 streak back to 2. fair is fair ✨ |
| Streamer's pick | 🏆 streamer's pick: @name baited bait_channel!! bait MVP ✨ |

With automatic rounds or a mission running, results end with “next round in 10s.” Waiting skip tallies, nudges and pause notices are dropped when their round ends, so they never arrive late.

Run `pnpm bot:transcript` to print every message from a scripted demo session, driven by the real game and bot.

## Win streak and badges

Chat's streak counts community wins in a row. Any other finished round ends it (time out, a correct Call the bait, a skip or an ended round); a rejected catch leaves it alone. Landing on a tier earns its badge: Spark (2), Heating up (3), On fire (5), Eruption (10), Dragonfire (15), Liftoff (25) and Ultraviolet (50). Each badge unlocks once per room, with its date; landing on a tier again is still celebrated, and reversing the win that unlocked a badge takes it back. The streak itself starts at zero after a restart, as before; best streak and unlocks are saved.

The streak shows as fire: on the OBS overlay (a strip with the count, fire coins and the next badge, and a medallion beside the result card on a tier), on the Extension card and panel, in the viewer room, and in the studio's Community tab, which lists every badge with its date or progress.

## Commands

`!bait` alone still joins the round. Anyone can type `!bait help`, `!bait score`, `!bait streak`, `!bait top` or `!bait who` (also `!bait baity`); each command is answered at most once every 20 seconds, as a threaded reply.

With **Moderator commands** on, the broadcaster, moderators and lead moderators can type `!bait start`, `!bait pause` and `!bait resume`. Starting and resuming need the same readiness as the studio buttons: chat connected and the streamer's microphone armed in the studio. Viewers' attempts are ignored silently. Commands work even when announcements are off; the bot just doesn't reply.

## Limits

Twitch lets a bot that is not a moderator send 20 messages per 30 seconds across all channels and one per second per channel, and silences it for an hour if it goes over. baited sends at most 18 per 30 seconds in total and 6 per 30 seconds per channel, at least 1.1 seconds apart. Waiting messages of the same kind replace each other, and stale ones expire instead of arriving late. A 429 pauses every channel until Twitch's reset; a 403 pauses that channel for a minute and shows the problem in Stream setup.

## Set it up

The bot posts with an app access token, which is what earns Twitch's **Chat Bot** badge. That needs two consents: the bot account's own (`user:write:chat`, `user:bot`) and each streamer's (`channel:bot`).

1. **Operator, once.** Create a separate Twitch account for Baity and find its numeric user ID. baited only knows the ID, so the login is free to choose. On 2026-10-27 `BaityBot` and `Baity` were taken; `Baity_Bot` and `Baeittrice` had no channel page, which suggests they are free, but only Twitch's sign-up can confirm it. Set `TWITCH_BOT_USER_ID` to the ID (it is not a secret) and restart baited. In a private window, open `${PUBLIC_URL}/auth/twitch/bot` and sign in as the bot account. baited stores the grant only if the account matches `TWITCH_BOT_USER_ID`; any other account's grant is revoked. The existing callback URL is reused, so no new redirect URI is needed.
2. **Each streamer.** In **Stream setup → Add Baity, the chat bot**, choose **Allow the bot in your chat**. Twitch asks for `channel:bot` once; later reconnects keep it. Then turn on **Announce rounds in chat** (and optionally **Moderator commands**) in Game settings.

Baity shouts once chat starts losing. A channel that runs a caps filter in another bot (Nightbot, Fossabot, Streamlabs Cloudbot) may delete those posts or time Baity out: exempt Baity in that filter, or make Baity a VIP or moderator if the filter already exempts them.

The bot's grant is validated at startup and hourly. If it is revoked, the studio shows the bot as not signed in until the operator repeats step 1.

## Try it locally

The local demo needs no bot account. Turn on the setting, start a round, and open **Demo controls**: Baity's posts appear under **Baity preview** with the same pacing. Tick **Send as a moderator** to try `!bait start` and `!bait pause` from simulated chat.

Real delivery to Twitch chat, the Chat Bot badge and a moderator command arriving through EventSub are covered by fixture tests only. Verify them on a test channel before relying on them live.
