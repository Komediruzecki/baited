# Baited: Devpost submission draft

Updated 26 October 2026. This is the current draft; archived BAIT/Deepgram documents are historical.

**Save status:** preparation files updated; no online fields saved. The Devpost connector returned `UNAUTHORIZED` and requires reconnection. A browser check of the existing edit URL also reached `secure.devpost.com/users/login`. The sign-in tab is ready, but the saved project text and submission state could not be inspected. No online fields, media, submission state or visibility were changed by this pass. Do not interpret this document as a submission receipt.

**Verified source snapshot:** `d93edb9780f0607112e83debcbab154758f0a3a1` in the private [Komediruzecki/baited repository](https://github.com/Komediruzecki/baited). Current design work may be ahead of this snapshot. Recheck screenshots and the final revision after the redesign lands.

**Existing entry:** [Edit Baited project details](https://devpost.com/submit-to/31742-codex-x-twitchcon-hackathon/manage/submissions/1266473-baited/project_details/edit). This is the owner's edit URL, not a public Try it out link.

## Project name

Baited

## Tagline

Bait them. Chat gets a secret word and tries to make the streamer say it.

## About the project: copy the following sections

## Inspiration

A good Twitch conversation already has the ingredients of a party game: a streamer, a chat full of ideas, and someone waiting for the right moment to slip in a joke. Baited turns that exchange into a secret-word challenge.

We took the hidden target of conversation games and the off-limits clues of word games, then built around the split between what chat knows and what the streamer sees. Chat has a plan. The streamer has to keep talking.

## What it does

Chat gets a secret card in a native Twitch Extension panel. Viewers send clues through ordinary Twitch chat, trying to make the streamer say the target before time runs out. The target stays hidden from the streamer's active game view and the OBS overlay. Harder cards rule out obvious clues.

The streamer runs the round from Baited Studio. Moonshine listens through an explicitly enabled microphone and transcribes speech on the streamer's computer. A target-word match pauses the round for confirmation. The streamer decides whether it was a catch before chat gets a win.

The current build includes 78 illustrated targets across three difficulty levels, skip voting through `!skip`, a three-word mission mode, and a private guess for the streamer. After a confirmed catch, the streamer can credit an eligible chat clue. The OBS overlay shows the clock, wins, streak and settled result without giving away the active word.

Baited is currently in Twitch Hosted Test. We have tested real rounds with a remote viewer, live Twitch chat, a microphone and OBS. Public installation is a next step.

## How we built it

The app uses TypeScript, React, Node.js and Express. Twitch OAuth connects the broadcaster, and an EventSub WebSocket receives chat messages. The native Extension uses Twitch's Extension Helper and signed authorization tokens to read the state for its channel.

One server-side game state machine controls rounds, deadlines, votes and scores. It returns different views to chat, Studio and OBS. Studio, the standalone viewer and the overlay receive updates through server-sent events; the native Twitch panel polls an authenticated endpoint.

Moonshine runs in a browser worker using WebAssembly. The microphone audio stays on the streamer's computer in this mode. Finalized transcript text and timing metadata go to the authenticated game server for matching. No hosted speech API key is needed for this path.

We used OpenAI Codex throughout implementation, debugging, testing and integration. ChatGPT image generation supplied separate card illustrations; the app renders the word, clue text and controls as interface elements. This lets us improve readability without regenerating the artwork. Procedural sound effects use Web Audio. The landing runs on Cloudflare Workers, and our Hosted Test backend currently runs on a Linux computer behind a named Cloudflare Tunnel.

## Challenges we ran into

The same round has three audiences with different information. A useful viewer card would spoil the game if its target reached the broadcast. We made that distinction in the server's responses.

Speech recognition also needed a decision step. A model can mishear a word, and a late transcript can belong to an earlier round. We added streamer confirmation, round-bound transcript checks and duplicate protection instead of letting a tentative match change the score.

Browser security and streaming tools introduced their own problems. Moonshine's runtime initially failed under the worker's Content Security Policy. We fixed that worker configuration and tested it again in the hosted Studio. An OBS Browser source also fell behind the browser preview during testing; refreshing it restored the scores. Automatic recovery still needs a controlled test.

## Accomplishments that we're proud of

The core interaction works across Twitch chat, the viewer panel, local speech recognition and the streamer's controls. In our first remote sessions, a viewer saw the secret card and sent clues through Twitch while the streamer spoke. The streamer reported several successful Moonshine tests, and the OBS score display matched after refreshing its Browser source.

The card collection now has 78 illustrated targets with separate, editable text. We also kept the original source package intact while bringing the app, Extension and landing into one private repository.

## What we learned

Recognizing a word and deciding a win are different jobs. The model proposes a catch; the streamer makes the call.

We also learned to test each surface in its actual setting. A page working in a desktop browser does not establish that the Twitch iframe, another browser or OBS will behave the same way. Those checks changed both our implementation and our test plan.

## What's next for Baited

We are refining card readability and bringing the viewer panel and Studio closer to the landing's visual identity. Next come broader browser and microphone tests, reliable OBS reconnection, and a complete recorded Twitch round.

After those checks, we plan to prepare the Extension for Twitch review and make it easier for other streamers to host their own game. More illustrated and picture-led cards are planned; they are not required to understand or play the current round.

## End of About the project

The sections below are field values and preparation notes, not part of the public story.

## Built with

Suggested 20 tags, within the user-supplied limit of 25. Match Devpost's available tag spelling when saving:

`TypeScript`, `JavaScript`, `React`, `Node.js`, `Express`, `Vite`, `Twitch`, `Twitch Extensions`, `Twitch EventSub`, `Moonshine`, `WebAssembly`, `Web Audio API`, `Web Workers`, `WebSockets`, `Server-Sent Events`, `Cloudflare Workers`, `Cloudflare Tunnel`, `OBS Studio`, `OpenAI Codex`, `ChatGPT`.

Deepgram, Whisper and ElevenLabs are not tags for the chosen speech path. An explicit legacy Deepgram adapter remains in the source; the current default is Moonshine.

## Try it out links

| Link | Use and current limit |
| --- | --- |
| [Baited landing](https://baited.maff.app/) | Primary public product link. Shows the concept and cards; it is not an Extension installation flow. |
| [Twitch test channel](https://www.twitch.tv/komediruzecki7) | Coordinated Hosted Test only. The tester must be signed into an allowlisted Twitch account, and the backend must be running. Do not describe this as open public play. |
| [Baited source](https://github.com/Komediruzecki/baited) | Canonical private repository. Include where code is requested once the intended reviewers have access; the URL alone does not grant access. Keep the repository private unless the owner chooses otherwise. |
| [Development landing](https://dev.baited.maff.app/) | Team review link for the latest design. Prefer the production landing in the public submission once the selected design has shipped. |

There is no verified public Extension install/listing URL in this packet. Add Twitch's real listing/install link when it exists and access has been checked. Do not invent one from an Extension client ID.

[Studio](https://play-baited.maff.app/studio) is an operator interface behind the current PC-hosted tunnel. It is not an always-available public demo. Coordinate a test session instead of promising permanent access or publishing a room/overlay URL containing a read key.

**Recommended link set now:** the public landing, plus the private repository if the form requests code and reviewer access is arranged. Add the Twitch channel only with its Hosted Test instructions. Do not add a localhost link, this edit URL, a secret-bearing overlay URL or a non-working placeholder.

## Project media

The following limits come from the owner's pasted Devpost form on 26 October 2026. They were not independently refreshed through the unavailable connector.

- Gallery: up to 15 JPG, PNG or GIF files, each no larger than 5 MB; 3:2 preferred.
- Demo: a YouTube URL, public or unlisted without a password. Only the first three minutes will be reviewed.
- Show the project working on Twitch and how OpenAI Codex was used.

Six [format-ready review images](submission/media-review/README.md) are prepared from the actual local Studio, native fixture/standalone viewer, Card Lab, landing deck and browser HUD captures, plus an 18-illustration artwork sheet. All are 1500 × 1000 PNGs below 5 MB. They are private feature-branch review material; no replacement card edition has been chosen. A seventh staged-hero image is marked review-only and excluded from upload candidates because its film retains historical crossed-out clue styling. Re-render it after the edition is selected.

Real Twitch round screenshots, actual OBS/Codex evidence and the approved YouTube demo are still needed. Review and refresh product captures after the chosen design is applied. The personal media plan retains the 2:50 storyboard. No gallery files or video were uploaded by this pass.

## Codex-use field, if requested

OpenAI Codex was used to inspect the supplied project, implement and debug the Twitch connection and Extension, integrate browser-local Moonshine speech, build game-state and security checks, prepare assets, and maintain the unified app/landing workspace. Supporting footage should show actual code changes or tests from those sessions.

Recorded session candidates from the source provenance:

- Original package build: `01a16ee8-4685-73a1-8477-a738186e6ffc`.
- Later audit, integration, design and implementation thread: `01a16ffb-42f5-7b02-b9bf-6e7e3e2dc1e7`.

Confirm the field's exact wording and which thread contains most of the submitted work before selecting one. Do not claim this choice has been confirmed by the owners. Keep a truthful credit record for other tools used, including Claude's design guidance and ChatGPT-generated illustrations.

## Before saving online and submitting

1. Reconnect the existing Devpost app and read the existing project, form and current rules. Preserve the existing entry; do not create a duplicate. Check team membership, required fields, deadline and reviewer-access requirements from that live source.
2. Review and save the title, tagline, About text, tags and appropriate links. Read back the saved values. This draft is preparation, not authorization to final-submit.
3. Finish the card/product redesign and capture the approved state. Replace all planned media with real, checked files.
4. Record and upload the working Twitch + Codex demo to YouTube. Verify that the video opens signed out and the required proof appears before 3:00.
5. Arrange a judge-accessible test and source-access route. Hosted Test remains allowlisted, and the Linux backend is not permanent hosting. Keep private source access separate from making the repository public.
6. Record the final source revision, Extension version/ZIP identity and actual verification receipts. Resolve or disclose the deferred Firefox blank-panel and OBS reconnection issues. Do not claim cross-browser or physical mobile acceptance without those tests.
7. Confirm submission-specific declarations with both entrants, including contribution and asset rights. This pass has not changed team membership, granted access, submitted to Devpost or submitted the Extension for Twitch review.

## Evidence and maintenance

See [technology and architecture](docs/devpost-stack.md). The personal project home also holds the media plan and an About-only copy for pasting.

The stack note records implementation details and the boundary between code inspection, historical automated checks and user-reported live tests. The current personal project home is `/home/maff/.dotfiles/personal/games/baited`; this app-side draft is the shareable counterpart.

Preserve old documents under the personal archive. Update this active draft when a new capability is actually verified. In particular, do not change the current 78-card count into a 100-card or 1,000-word claim based on a plan.
