# Two-person team and release checklist

Suggested division of the remaining work for maff and Paolo. These are proposed responsibilities, not assertions about who wrote the original package. Both people can review the other's work.

| Work | Suggested lead | Second person checks |
| --- | --- | --- |
| Runtime, Twitch/speech setup, bug fixes and test receipts | maff | Paolo runs the independent viewer/judge walkthrough |
| Rules clarity, visual review, logo rights and real hint examples | Paolo | maff checks the copy against actual behavior |
| Two-person live rehearsal | maff as streamer, Paolo as viewer; swap if useful | Both confirm secrecy, timing and whether the trap feels fun |
| Demo recording and editing | Paolo | maff verifies that the Twitch and Codex footage is genuine and no credentials appear |
| Final form and team invites | Representative chosen by both | Other person accepts the invite and checks the final links |

The two-person development team can demonstrate streamer-plus-viewer play. A two-microphone co-streamer mode is not required and is not implemented.

## Before public deployment or external judge access

- [ ] Review the local preview on desktop and a narrow viewer layout.
- [ ] Confirm the latest local tests/build/browser evidence and remaining defects in `validation.md`.
- [ ] Confirm both entrants satisfy age, residence and conflict-of-interest conditions. Croatia is not named in the published exclusion list; that does not establish either person's full eligibility.
- [ ] Confirm ownership of the original source and permission to use the supplied BAIT logo and any recorded people/material. Preserve original assets.
- [ ] Confirm the source's creation during the event period and the original main Codex session candidate.
- [x] Create the owner-authorized private repository: [Komediruzecki/bait](https://github.com/Komediruzecki/bait).
- [ ] Verify the final tested checkpoint is pushed and review the exact contents before granting judge access. Sharing with `testing@devpost.com` remains a separate owner decision; no invitation has been sent.
- [ ] Approve the actual host/domain, operating cost and secret-reference configuration. Follow the runbook rather than pasting values into `.env`.

## After approved deployment

- [ ] Complete a real Twitch OAuth round, actual EventSub chat, physical microphone recognition and real OBS capture.
- [ ] Test near-deadline speech, ordinary long sentences, pause/resume, disconnect, win reversal, mission completion and wrong private guess.
- [ ] Have the other person open the public viewer link from another device/network and follow the judge instructions.
- [ ] Record the operator's availability and keep usage free to judges.
- [ ] Record the 2:45 video from actual play and Codex evidence. Check a public/unlisted YouTube link signed out.
- [ ] Capture and label 3–5 screenshots. Remove secrets and unrelated private context.

## Before the event deadline

- [ ] Replace every `TODO_...` placeholder in `devpost-submission.md` with a verified value.
- [ ] Verify the actual Devpost account registration/form; connector reauthentication was unavailable during preparation.
- [ ] Choose one representative. Add the teammate in Manage Team and verify the invite was accepted.
- [ ] Read the current official rules and personally confirm any required terms. No consent is inferred from local drafting.
- [ ] Review the exact project, repository, video, main session ID, English description and judge instructions together.
- [ ] After explicit authorization for final entry, click Submit and verify the event shows Submitted. A saved draft is insufficient.
- [ ] Preserve the submitted version and links through the conservative judging endpoint, 16 November 2026 at 02:00 Zagreb.

Target the team review for **1 November**; the official deadline is **2 November 2026 at 23:00 Zagreb**. Do not spend the last day adding optional mechanics. Six-word showdown, a bank-or-risk mission bonus and guest microphone relay remain future proposals until the existing live loop is proven.

Sources: [event FAQ](https://twitchcon-codex.devpost.com/resources), [official rules](https://twitchcon-codex.devpost.com/rules). The FAQ confirms eligible teams without a stated size cap. The owners' eligibility and consent remain personal confirmations.
