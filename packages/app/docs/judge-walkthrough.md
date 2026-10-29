# Judge walkthrough

## Current access

Use the [feat/bait-preview candidate branch](https://github.com/Komediruzecki/bait/tree/feat/bait-preview), with authorized access to the private repository. The imported `main` branch preserves the original package. Verify the candidate's final pushed revision before judging.

The repository runs locally with the README commands. The local demo is free and needs no credentials. An externally accessible live Twitch deployment has not yet been configured. The project owner must add the tested HTTPS URL and Twitch channel here before submission; no placeholder URL should be submitted as a working demo.

The operator should provide the configured speech service and hosting free of charge to judges, with a broadcaster available to enable their microphone. Judges should not need to buy a provider plan or receive client secrets.

## Local core test, about two minutes

1. Install with `pnpm install --frozen-lockfile`. For this improvement checkout, build and start the isolated compiled preview using [local-preview.md](local-preview.md); open its verified URL. A normal development checkout can use `pnpm dev` at `http://localhost:3000`.
2. Select **Try the local demo**. Start a round.
3. Open the viewer-room link in a second tab. The word appears there and stays absent from the studio.
4. In the studio’s Demo controls, send chat under a test chatter name. The unique participant count increases. Repeated messages under the same name do not create extra participants.
5. Send a simulated final transcript containing the viewer’s word. Studio and viewer reveal the result and record one community win.
6. Reverse the detection and verify the win and streak are restored. The round stays closed.
7. In Stream setup, preview the OBS URL. It receives read-only game state. After cooldown, start another round and confirm its target stays absent from OBS.

This demo uses simulated Twitch and speech inputs. Live integration checks are listed below.

## Clues, awards and missions

The [quick rules](quick-rules.md) teach the core game in three steps. For the extra modes:

1. In Game settings, select Medium or Hard, Three-word mission, and Call the bait. Set a five-minute session timer for this check.
2. Start the mission. The viewer sees one target and two or four forbidden clues. The studio and OBS show the clock and progress without that information.
3. Send a simulated forbidden-clue hint, then a clean hint under the same test chatter. The round continues. Submit the exact target through the simulated transcript field.
4. In You baited me, check that the first hint is flagged and the clean hint can be selected. Pick it. Public views show the name with “Streamer’s pick.” The award does not add another community win.
5. After cooldown, the second target starts on the same clock even with automatic rounds off. Repeat until three words are landed. The mission completes and its time freezes.
6. Reverse the third win before the next word starts. Progress returns to two of three and a fresh target replaces the revealed one.
7. On a live word, submit a wrong private guess: the attempt is consumed and the clock gains fifteen seconds. On another word, submit the correct guess: the streamer escapes the word and mission. Guess text does not appear in public views.

Hints are retained only within the documented review limits; private guess text is not retained. See [mechanics.md](mechanics.md).

## Real Twitch acceptance, after configuration

Use a streamer account and a different viewer account. Keep keys in Proton Pass and inject them with the reference-only configuration in [deployment-runbook.md](deployment-runbook.md). The current local preview intentionally has no live keys.

1. Complete Twitch authorization and wait for a connected status. Before arming the microphone, confirm a real round cannot start. Enable the physical microphone through the consent flow, then confirm it can start.
2. Copy the public viewer URL to the second account. Add the read-only OBS source to the live scene.
3. Start a round. Send a subtle Twitch chat message and verify participation increments. Check that repeated chat does not multiply one person’s participation.
4. Have the streamer say a substring or plural of the target first; it must not win. Then say the exact target clearly. Confirm one shared victory on all three views.
5. Reverse a deliberate incorrect result; verify score correction and a new target next round.
6. Pause/resume and verify no speech during the pause can trigger the resumed round.
7. Temporarily interrupt network access, restore it, and verify EventSub reconnects. Reload a viewer page and verify the same authoritative timer and score.
8. Test `!skip` with the configured number of distinct viewers. Do not give multiple votes to one account.
9. Revoke access in Twitch connection settings and confirm the studio session stops being authorized. Reconnect to continue.
10. Speak a normal long sentence with the target near its end. Confirm unrelated low-confidence words do not alone discard a clear target. Record misses and provider latency rather than describing one successful utterance as an accuracy benchmark.
11. Say the target just before zero and separately after zero. The server may wait up to 1.5 seconds for a final result from pre-deadline speech; post-deadline speech must not win. Record what actually happens.
12. Disable or unplug the microphone and verify live play pauses, including with automatic rounds enabled. Re-enable and resume. Close or sign out of the owning studio and confirm a stale session cannot keep authorizing the microphone.
13. Open a second studio tab. Confirm it cannot keep the first tab's capture authorized after that capture is stopped. Reconnect the real capture and verify it requires its own readiness lease rather than a delayed renewal reviving it.

Record the date, browser, account/channel, observed outcomes and any failures in `validation.md`. Keep a short live capture. Do not mark these steps passed from fixture tests alone.
