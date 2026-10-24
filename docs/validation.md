# Validation record

Test date: October 24, 2026. Host: Windows, Node 24.22.1, pnpm 10.7.1.

## Automated checks

| Check               | Observed result                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`         | 70 tests passed; 0 failed, skipped or cancelled. Includes HTTP acceptance, development-preview isolation, clues, awards, missions and private guesses.                                                                          |
| `pnpm check`        | TypeScript passed. The production build also runs this check.                                                                                                                                      |
| `pnpm build`        | Client and Node server bundles built successfully.                                                                                                                                                 |
| `pnpm audit --prod` | No known vulnerabilities reported by the registry audit at test time.                                                                                                                              |
| `pnpm run licenses` | Inventory covers 184 installed dependencies in the lockfile, including build/test tools. Full available license texts, five font family notices and the Material icon Apache license are included. |
| Compiled start      | Initial build only: `pnpm start` served the built application and health endpoint successfully.                                                                                                                        |

The audit initially found an advisory affecting the original validator version. It was updated to Zod 4.6.7; the resulting suite, type check and build passed. The lockfile records installed versions. An audit is a point-in-time registry result, not a security certification.

## Initial browser rehearsal, before the redesign

Used the compiled application through the in-app browser, with a narrow 486-pixel studio view and a 1280-pixel desktop view. The viewer and OBS pages were opened in separate tabs against the same live Node instance.

Observed:

1. Rehearsal was explicitly labeled; Twitch and speech credentials were absent.
2. Saved a 300-second duration through the settings dialog; the studio updated to 05:00.
3. Started round 1. The viewer showed `trampoline`; the studio showed the hidden-target state.
4. Sent a simulated non-spoiler chat message through the UI. Participation changed from 0 to 1.
5. Sent “We used to bounce on a trampoline!” through the rehearsal transcript field. Both studio and viewer revealed one win, at 18 seconds.
6. Reversed that detection through the UI. The win, streak and best returned to zero; the result became `overturned`.
7. Started round 2. The target changed to `waffle`. OBS displayed “CHAT HAS A SECRET,” the round number and timer, with no word.
8. Paused and resumed. All three views showed the paused state and 04:54, then resumed from that time.
9. The missing-provider microphone button displayed setup instructions without requesting microphone access or pretending to transcribe.
10. Sent “I had waffles for breakfast.” The UI reported no match and the round stayed active. “I ate a WAFFLE!” then produced one win and the OBS celebration.
11. Started round 3 from the desktop studio. The desktop layout and hidden-target state rendered correctly.
12. After its five-minute timer elapsed, refreshing the compiled studio showed round 3 as `escaped` in the operation history. The latest compiled studio loaded successfully.

Separate screenshots show the narrow studio, desktop studio, viewer target and OBS celebration. All depict local rehearsal. No screenshot is evidence of a live Twitch broadcast or physical microphone transcription.

## Redesign verification

The purple and charcoal redesign was checked in the in-app browser at a 1280-pixel desktop viewport, a 486-pixel studio viewport, and 390-pixel embedded landing/studio viewports. The screenshots in `images/` show the current interface. The 390-pixel check used a temporary same-origin preview page; that page is excluded from the source package.

Observed after the redesign:

1. The landing page explains the banana round with a labeled illustration. Selecting penguin changed the word, chat hint and streamer response. The illustrated round advanced to its win state.
2. Connect Twitch opened credential setup guidance. Escape dismissed the dialog. The local demo remained explicitly labeled as simulated chat and speech.
3. Saved a 300-second duration in Game settings. Starting round 1 showed `squirrel` only in the viewer room; the studio and OBS kept it hidden.
4. Pause froze the studio, viewer and OBS timers at 04:28. Resume continued from that time.
5. A simulated non-spoiler chat message changed participation from 0 to 1. “There are squirrels outside.” did not match. “A SQUIRREL stole it.” recorded one shared win at 49 seconds, with the reveal on all three views.
6. Reversing the win returned wins, streak and best to zero and removed the OBS victory state. Participation credit remained.
7. Both the OBS document and body had computed transparent backgrounds.
8. A development preview WebSocket was initially blocked by the speech upgrade handler. The fix gives Vite its own explicitly enabled development route. A regression test checks static/production rejection, unrelated origins, unrelated protocols and the unauthenticated speech route. A fresh browser studio reported no console errors.

The copy pass covered the landing page, studio, viewer room, dialogs, privacy text, README, submission description and demo script. The interface uses local Google Material SVG icons and local Inter fonts. The two active Latin WOFF2 fonts total 93,128 bytes.

The final TypeScript/client/server build passed. A fresh compiled-runtime launch after the redesign was blocked by automatic approval review, which supplied only “blocked by policy.” The redesigned browser checks above used the development server. The earlier compiled-start result belongs to the initial build. The owned preview server was stopped after verification.

## Clues, missions, awards and card redesign

The later browser checks used isolated development rooms. All chat and speech inputs described here were simulated. The main rules now teach three actions, with optional rules in a native disclosure. The core game remains a single hidden word during ordinary streaming.

Observed:

1. Game settings saved a five-minute three-word mission with Hard difficulty and Call the bait enabled. The ready screen showed 05:00. Pause froze the shared timer at 04:51 in studio and viewer.
2. The viewer’s LABYRINTH card showed maze, minotaur, lost and paths. The target and all four clues fit a narrow 390-pixel viewport. The studio and OBS omitted them during play.
3. A simulated “Is that a maze?” hint left the round active. A later clean hint from the same friendly_viewer was retained. After the LABYRINTH win, review showed one eligible and one flagged hint. The flagged hint had no award action. Selecting the clean hint showed the name publicly as the streamer’s pick, with one community win.
4. The next target, NARWHAL, started automatically after the five-second cooldown even with automatic rounds disabled. Its success advanced progress to two of three. The third target was TUMBLEWEED.
5. A wrong private guess on that third word consumed the attempt and added fifteen seconds. The UI did not repeat the incorrect word. A simulated final transcript with TUMBLEWEED completed the mission at three of three, with 03:22 remaining. The remaining time froze.
6. The revised OBS frame showed a square charcoal panel, clipped lower-right corner, hard purple shadow, integrated mission cards and one visible clock. A pause changed its border and clock to amber. A win revealed the word and celebration. The later transparent-logo check confirmed computed alpha-zero backgrounds on the document, body and logo container.
7. The supplied logo’s original PNG is preserved. The selected imagegen derivative has an RGBA channel and alpha-zero outer canvas. A browser screenshot confirmed the logo directly on the charcoal header without the white tile.
8. The landing example uses stacked word cards, an illustrated Twitch chat, a separate streamer screen and a win band. Choosing penguin and microwave changed the target, hint and response. Replay and the timed reveal worked. The banana headline had computed color rgb(255, 218, 68).
9. The latest narrow landing check reported equal document content and client widths of 375 CSS pixels, with no horizontal overflow. The longest sample word, MICROWAVE, fit its card. The three-step rules dialog opened, its optional rules expanded, and Escape closed it.

The final source passed 70 automated tests, the TypeScript check and the client/server production build. No Twitch or speech credentials were introduced. The card/chat example remains explicitly labeled as illustrated. Images taken before the final alpha update show the earlier white-backed logo; the latest landing and overlay images show the transparent derivative.

## What the fixtures verify

- Whole-word/case/punctuation matching; pause/resume timing; stale, future, interim, low-confidence and wrong-round results; cooldowns; expiry; automatic rounds; score reversal and history compaction.
- The actual AudioWorklet’s capture gate, 48 kHz to 16 kHz PCM output, generation tags, and reset of partial buffers.
- 100 simultaneous engine participants and 50 simultaneous real HTTP rehearsal requests.
- Actual local HTTP/SSE studio/viewer updates, role projections, session/CSRF/origin/host boundaries, isolated rooms, rejected speech upgrades, invalid OAuth state and logout.
- Encrypted storage/tampering, concurrent writes, authorization-code exchange, identity verification, one shared refresh for concurrent callers, rotated tokens, revoked refresh, Helix 401 retry and rate-limit reset.
- EventSub welcome/subscription, duplicate/stale/channel checks, migration without resubscribing, keepalive timeout recovery and revocation, using injected socket fixtures.
- Server-side provider authorization, binary forwarding, rejected browser text injection, final-result normalization, one victory, and invalidated speech epochs, using a fixture speech socket.
- Original clue-card coverage, literal clue variants, per-hint eligibility, bounded review, private projections, manual award assignment/reassignment/reversal, private guesses, one continuous mission clock, cooldown expiry, skip replacement and third-word reversal.

## Checks requiring credentials or infrastructure

These have **not** been run:

- Twitch’s actual OAuth consent/callback and live channel EventSub subscription.
- Actual Twitch chat commands, refresh, revocation and reconnect against Twitch’s service.
- Browser permission grant with a physical microphone, device/noise/accent behavior, real Deepgram recognition, or measured end-to-end speech latency.
- An OBS application recording or broadcast capture; its browser-source page was checked in a browser.
- Public HTTPS hosting, reverse-proxy behavior, container build, internet fanout/load, or judge access.

No credentials were supplied or fabricated. Follow the real Twitch acceptance procedure in `judge-walkthrough.md`, then append observed results here. Keep the distinction between provider fixtures and live tests in any submission or demo claims.
