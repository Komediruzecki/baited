# Baited: where we are and what's next

Rewritten 28 October 2026 after PR #8 (stream layer) and PR #12 (its follow-ups). This is the entry point for planning. The older version of this page, dated 25 October, is in git history; its account-setup and Extension-submission steps now live in [HOSTED_TEST.md](HOSTED_TEST.md), [chat-bot.md](chat-bot.md) and the [Twitch lifecycle docs](https://dev.twitch.tv/docs/extensions/life-cycle/).

**Deadline:** Devpost entry by **2 November 2026, 23:00 Zagreb**. Team review on 1 November. See [Devpost](#devpost) below.

## Where we are

| Part | State on 28 October |
| --- | --- |
| Repository | [Komediruzecki/baited](https://github.com/Komediruzecki/baited), private pnpm monorepo: `packages/app` (server, studio, Extension), `packages/landing`, `packages/review-host`. |
| Landing | [baited.maff.app](https://baited.maff.app/) from annotated `bait-v*` tags, [dev.baited.maff.app](https://dev.baited.maff.app/) from every push to `main`. Cut Open cards with Prism backs since `bait-v1.4.0`. |
| Game backend | Runs as the hosted-test Docker image on the owner's machine, behind the named Cloudflare tunnel at `play-baited.maff.app` ([HOSTED_TEST.md](HOSTED_TEST.md)). Not a permanent deployment: it is up only while someone runs it. |
| Extension | Panel 0.0.2 in Hosted Test. The video overlay and the award/MVP display need a 0.0.3 upload. Not submitted for review. |
| Chat bot | Baity (`baity_bot`, user ID 1596216112) is signed in on the hosted backend. Its `!bait` commands have not been tested in real chat. |
| Cards | Every plain card in the product uses the landing's Cut Open card from one shared `extension/card.css`; `tests/card-parity.test.ts` holds them to the landing value by value. |

## What PR #8 shipped (merged 28 October, 5f3676b)

- **Extension video overlay.** Viewers see the secret card on the stream; the broadcaster's own view only shows its back.
- **Chat bot, then Baity.** Round announcements, timer nudges, `!bait help/score/streak/top/who`, moderator `!bait start/pause/resume`, all under Twitch's rate limits. Baity (legally Baeittrice) is cute while chat wins and louder with every round chat loses.
- **Win streaks** with badge tiers on OBS, the Extension, the viewer room, the studio and chat. Fire streak back, OBS boxes in the original Baited Pixel font.
- **Studio in Material 3**, in the landing's colours.
- **Bait MVP.** OBS "BAITED BY @name" sting, MVP podium, top three in the viewer room. The spoiler check catches disguised words (`pengu1n`, `p e n g u i n`).
- **Fixes found in review:** `!skip` sits outside the 3-second hint limit and counts once per chatter; Shared Chat messages from partner channels are ignored.
- **Cut Open cards** on the panel, overlay, viewer room, studio, OBS reveal and sign-in back.

## What PR #12 adds

- Rate limiter with bounded memory that never refuses a new viewer (the old one refused everyone past 10,000 keys, about 5,000 viewers).
- Hint review newest first, with the time each hint was sent.
- Moderator deletes drop that hint; bans and timeouts drop the chatter's hints and, while the 10-minute review is open, the award.
- The streamer's pick and the MVP top three in the Extension panel and video overlay (data version stays `0.0.1`).
- Baity audit fixes: command replies in their own lane so they never push out an announcement, a 30-second cooldown per chatter, a fair share of the global budget across channels, queued posts dropped once the bot may no longer post, one automatic re-ask when a sign-in drops `channel:bot`, the bot-permission button held until the round ends, and a reason code logged for every failed sign-in.
- Decisions applied on 28 October (see the decision log): no emoji in Baity's lines or the streak UI, and the bot account refused in the streamer sign-in.

## Tested and not tested

**Tested live (27 October, hosted test with Paolo as remote viewer):** Twitch sign-in, real chat reaching the studio, physical microphone with Moonshine, catches, and the native panel from Twitch's CDN.

**Not yet tested live:**

- Baity's posts with the Chat Bot badge, and chat and moderator `!bait` commands through EventSub.
- Moderator delete and ban events reaching the game (fixture tests only).
- The video overlay and the award/MVP display on Twitch (needs the 0.0.3 upload).
- The rest of the [HOSTED_TEST.md](HOSTED_TEST.md) checklist: target hidden in Studio and OBS with the real scene running, every result path (confirmed, rejected, pause/resume, escape), reload without double scoring, real screenshots and a short OBS recording.

## What's left, in order

| # | Work | Done when |
| --- | --- | --- |
| 1 | **Extension and Baity test** (next session) | Rebuild the hosted image from `main`, upload Extension 0.0.3 (`--version 0.0.3`, `overlay.html` as the video overlay view), then on a test channel: Baity posts with the Chat Bot badge, every `!bait` command answers, a moderator delete and a timeout remove hints, the overlay shows the card, the pick and the MVPs. |
| 2 | Finish the HOSTED_TEST checklist | Every open item above ticked, with screenshots and an OBS recording saved through `agent-out`. |
| 3 | Make Baity a VIP, or exempt it from caps filters | Nightbot, Fossabot and Streamlabs Cloudbot leave its loud lines alone on the test channel. |
| 4 | Devpost entry | Video, description, repository access and judge instructions reviewed by both of us and submitted before the deadline. |
| 5 | Extension review submission | Listing, privacy and terms URLs, images, walkthrough and reviewer availability. Twitch estimates 8 to 14 days. |
| 6 | Spoiler-check tuning | The open gaps from the 27 October audit covered by tests, without new false positives on ordinary hints. |
| 7 | **TIME WARP** chaos card, about a day | Unlocks with 30 s left, once per word, when as many distinct chatters as the skip threshold type `!bait warp`. Reuses the +15 s from a wrong Call the bait guess. A "Warp x/y" count, an OBS sting, two Baity lines, no tally post per vote. Shown in the Extension as an optional field. |
| 8 | "Baity thinks @name got you" | A suggested pick from the card's clues in the hint review. Medium. Matching hints against the transcript is larger and later. |
| 9 | A pre-round vote with no secret in it | Chat picks difficulty, or one word against a three-word mission. One latest vote per viewer, fixed close, safe default. |
| 10 | Chat chooses the word, opt-in, about 9 to 11 days | Private voting by slot number in the panel or viewer room (never in chat), candidates typed in chat thrown out with a silent swap, a minimum candidate pool, and `violations` made viewer-only first (it reaches the Studio and OBS projections today). |
| 11 | A permanent game host | One persistent Node process with disk, HTTPS, SSE and WebSockets, the exact OAuth callback, restart checks, and an agreed monthly cost. Needed before Extension release, not for Devpost. |

Not planned: **COUNTER BAIT** already exists as Call the bait. **DOUBLE DOWN** waits for a chat-vs-streamer points score, since doubling a win would make the "N in a row" badges untrue. **DECOY** is cut: all words ship in the client, so a category shown to the streamer narrows the word down.

Earlier creative proposals (Six-word showdown, themed decks, reveal sequence, Bank or bait, Pass the mic) stay in [tabletop-options.md](tabletop-options.md) and [v2/gameplay-plan.md](v2/gameplay-plan.md), behind the items above.

## Decision log

| Date | Decision | Why |
| --- | --- | --- |
| 27 Oct | Bot persona is Baity, legally Baeittrice; account `baity_bot`. | `BaityBot` and `Baity` were taken. |
| 27 Oct | PR #8 merged as a merge commit, not a squash. | Keeps the original commit authors without a co-author trailer. |
| 28 Oct | No emoji in Baity's chat lines or the streak UI. Chat lines carry the persona in words; the UI uses SVG icons. | Standing owner rule: no emoji anywhere in code or UI. Twitch emote names were rejected because they show as raw words in the studio's Baity preview. |
| 28 Oct | The bot account cannot sign in as a streamer, unless `TWITCH_BOT_IS_STREAMER=1`. | On 27 October `baity_bot` signed in through the streamer flow by mistake and got its own room. The flag keeps the supported one-account setup working. |
| 28 Oct | A ban or timeout takes back an award only while that round's 10-minute review is open. | `channel.chat.clear_user_messages` cannot tell a ban from an automatic caps or link timeout. Telling them apart needs `channel.moderate` and a new moderator scope, which means every streamer signs in again. |
| 28 Oct | Partner channels' moderation in Shared Chat is accepted as it comes. | Twitch's reference gives Shared Chat copies their own `message_id` (with a separate `source_message_id`) but documents no source field on delete or clear events. Only this channel's messages become hints, so the worst case is a partner's ban removing a hint. |
| 28 Oct | Card port kept as reviewed: no glint, panel art shrinks to 104 landing px when both the pick and the MVPs show, Studio and OBS result cards leave the clue area empty. | Keeps the panel inside Twitch's 500 px height; the owner checked the screenshots. |

## Devpost

The rules allow Twitch chat, overlay and API integrations; native Extension approval is not required. Two eligible individuals can enter as a team with one representative. Prepare a public YouTube demo under three minutes showing working Twitch play and Codex use, the main Codex session ID, source, assets and run instructions, and the English description. Private GitHub is allowed with the judge access the [official rules](https://twitchcon-codex.devpost.com/rules) name; inviting judges is an owner decision.

Working documents: [submission draft](submission.md), [team checklist](team-and-release-checklist.md), [demo script](demo-script.md), [judge walkthrough](judge-walkthrough.md), [game-hosting runbook](deployment-runbook.md).

Split: maff handles runtime, accounts and hosting; Paolo tests as the independent viewer and reviews rules, art and the demo edit. Both review the final entry.

## Twitch organization

One account can own the first Extension. Shared console management needs a Twitch organization (it need not be a company): console account menu, **Create Organization**, Developer type, Extensions selected. Approval takes about two business weeks. Then add Paolo as Developer. Check Twitch's transfer path before moving the existing Extension; never recreate it. [Organization guide](https://dev.twitch.tv/docs/companies/).
