# Baited: the three-round shoot

31 October 2026 · English recording · target edit: **2:50**

Record Banana → Ghost → Bait as a coordinated demonstration on the real Twitch pilot. Then play at least ten random rounds for unscripted reactions. The demonstration should show real catches, real guesses and real chat. If a take goes differently, keep the recording and retake it; do not fabricate a result in the edit.

This guide replaces the earlier natural-only shooting order for these first three rounds. The previous topic prompts remain useful for the natural session afterward. The [original storyline](original-three-round-storyline.md) is preserved separately. Send participants their part of the [role cards](chat-role-cards.md).

## Before anyone presses Record

**Release check:** the recording sequence and Restart take control are available in the recording-kit branch. The hosted release must still be verified before the shoot; no deployment is claimed by this guide. This recording flow updates the backend and Studio and does not require a new Twitch Extension ZIP. After the pilot is updated, refresh Studio and check that **Recording take** is present.

1. Pick one streamer for a complete three-round take: **komediruzecki7** or **lakeeko**. Record the other streamer separately. Keep the same game throughout a take; choose something already installed and working.
2. Open [pilot Studio](https://pilot-baited.maff.app/studio) in the broadcasting account. Keep Studio outside the OBS capture.
3. In Game settings, set the round length to **120 seconds**, enable **Call the bait**, turn **Auto rounds off**, and keep **Announce rounds in chat on**. Save. Auto rounds off gives you time to hold each result for the camera.
4. Enable **Recording take** and save while no round is active. The mode supplies Banana, Ghost and Bait in that order, as easy single-word rounds with Call the bait available, regardless of the normal difficulty or mission settings. Studio shows the take's progress. After those three, normal selection resumes.
5. For another attempt, use **Restart take** in the Studio bar and confirm **Restart take** in the dialog. This ends an active round, starts this take at round 0 and clears its score/streak; Twitch connections and saved lifetime history stay intact. Viewers see the waiting card until you choose **Start round** again. Check the fresh score before rolling. Do not delete Cloudflare storage to restart a video take.
6. Enable the Studio microphone. Open **Show transcript**, say a short test phrase, pause, and check what the mic heard. Keep the transcript off the public capture. Headphones prevent the stream or game from being transcribed through the mic.
7. Each viewer signs into their own Twitch account and accepts the Hosted Test Extension. On the already-tested iOS flow: **Extensions → Baited → Accept test extension**. Desktop viewers must also accept the test extension when prompted. Confirm the secret card appears on the actual broadcasting channel, not somebody else's dashboard.
8. Start OBS recording and the separate viewer recording. Make a 30-second sample, stop, and play the saved files. Check mic, game sound, chat readability, card visibility and the absence of private windows. Delete nothing yet.
9. Start the stream if this take is being presented live. **Start Streaming** and **Start Recording** are separate actions in OBS. Confirm everyone is ready before **Start round**.

Use English for today's scored takes. Croatian card text is a separate addition; the current Moonshine worker loads an English model. A translated card does not prove Croatian speech detection works.

## Assign the jobs

| Person | Job | What they keep open |
|---|---|---|
| Maff or lakeeko | Streamer: play, read chat, use Call the bait and give real reactions | Game, Chatterino or phone chat, private Studio |
| Paolo | Lead baiter: send the first clue and control the pace | Twitch viewer card and chat |
| A second viewer | Follow-up clues and reactions, without flooding chat | Twitch viewer card and chat |
| Director, who can also be the second viewer | Watch the timer, mark usable moments, confirm recordings and score | Viewer recording and a private take log |

All participants should know their messages, usernames and voices may appear in a public video. Keep the language clean and leave personal or identifying details out of the stories. Agree on the three outcomes as a demonstration. Do not call this a blind first play or pretend the streamer did not know the prepared sequence. For the later natural session, the streamer should not inspect the card viewer.

## Record two views, not just the OBS output

The OBS source shows the public round HUD. **The secret card shown by the native Twitch Extension is not baked into OBS recordings.** Record a viewer's Twitch page or app as well, signed into a viewer account. That recording supplies the “Chat sees” insert, the hidden word, clues, skip state and result. Do not add the secret viewer room to the broadcaster's OBS scene.

Use a desktop viewer recording for the main edit if possible; a phone capture is a useful short proof that it works on mobile. Capture the genuine Twitch interface around the card for at least a few seconds so viewers can see where the experience runs. Avoid capturing account menus, private messages or notification banners.

At the beginning of each take, the streamer says: **“Baited, take one. Three, two, one.”** Leave a few seconds before starting the round. Both recorders note the round's start and result.

There are two timing systems in the viewer recording: delayed Twitch video/audio and the Extension's live state. Align a cropped card insert by its matching round start/result and the public HUD. Align the viewer's Twitch audio/video separately using the spoken marker. Matching audio alone can put the secret card several seconds out of sync.

## OBS and camera setup

The earlier checked setup on Maff's PC used a 2560 × 1440 display. Check the active display in OBS before assuming it is unchanged. Set **Base (Canvas)** and local recording **Output (Scaled)** to **2560 × 1440**. Use 60 fps if the sample is smooth; 30 fps is a sensible fallback if OBS reports rendering or encoding lag.

You do not need a Chrome window with exactly 1440 pixels of content. OBS records the canvas at the output resolution. Capture the chosen game/window, crop unused browser chrome, and fit it proportionally into the scene. Preview zoom changes only the editor view, not the recorded resolution. Avoid stretching a narrower window to fill the frame.

Suggested layout for a 2560 × 1440 scene:

| Element | Placement | Check |
|---|---|---|
| Game/window capture | Background, fit to canvas | No Studio, desktop notifications or private tabs |
| Public Baited HUD | Top left, about 40 px inset | Timer and score readable; no overlap with game UI |
| Chat | Top right, about 420 px wide | Show enough recent clues; use larger type rather than a long narrow column |
| Face camera, if available | Lower left, roughly 360 px wide | Keep the face clear of the game objective and HUD |
| Native card | Insert from the second recording during editing | Label “Chat sees”; do not misrepresent it as an OBS source |

Chatterino needs no OBS connection to read chat. **Super+Space** already worked to float its window on this Hyprland desktop. Add a separate window capture if you want it in the recording; otherwise use it privately on the side. If capturing an entire display already includes it, do not add a duplicate capture. Capture only the relevant game/window where the portal supports that.

For a face camera, place it near eye level and put the brightest light in front of you. Keep the reaction shot running through the result and for another ten seconds. If there is no camera, clear voice and a visible chat payoff are enough; do not delay the shoot to buy or install anything.

### Keep voice, game and music separate

For today, turn **in-game music off**, leave game effects/dialogue low enough to hear the streamer, and wear headphones. Publisher streamer mode can help when available; still check what it actually disables. There is no need to mute every game sound just to record a clear conversation. Add any cleared soundtrack during editing, rather than playing it into the microphone.

In **Settings → Output**, choose Advanced mode. Set Streaming to audio track **1**. Under Recording, choose **MKV** and enable tracks **1, 2 and 3**; enable **4** only if recording a separate music source. In the Audio Mixer, open **Advanced Audio Properties** and assign the sources as follows:

| OBS audio source | Track 1: stream/listening mix | Track 2: voice only | Track 3: game only | Track 4: separate music |
|---|---|---|---|---|
| Your microphone | Yes | Yes | No | No |
| Game output | Yes, at a lower level | No | Yes | No |
| Optional music source | Only if cleared for the stream | No | No | Yes |

Ordinary players usually play one audio track at a time, so track 1 should be a useful full mix. The editor can use tracks 2 and 3 to adjust speech and game independently. **File → Remux Recordings** converts the container to MP4 when needed; it does not mix the separate tracks together. [OBS audio tracks](https://obsproject.com/kb/multiple-audio-track-recording-guide), [OBS recording guide](https://obsproject.com/kb/standard-recording-output-guide).

On this Arch setup, use one mic input and one game/output capture path. If the mic is already captured as the global Mic/Aux device, do not add the same device again as a scene source. Likewise, do not capture the same output through both Desktop Audio and another output-capture source. Duplicate paths create doubled sound or echo.

If the installed OBS audio source supports application capture, select the game there. If it only offers output-device capture, that source records everything sent to that device, not just the game. Close other audio players, mute your own Twitch playback and silence notifications for the take, or use an already-configured separate output route. Do not label a mixed desktop source “game only” without checking what it contains.

Track checkboxes cannot separate sounds already mixed by the game. Its music, dialogue and effects normally arrive in one output source. Disable music in the game's settings to keep effects and dialogue without that soundtrack. The same limitation applies to a voice call mixed into Desktop Audio; give the call its own source/track only if the routing already supports it.

In **Baited Studio**, select the actual microphone input, not a desktop-monitor or loopback device. OBS track choices do not control what Moonshine hears. Headphones keep game audio out of the physical mic. Leave OBS audio monitoring off unless you have a tested reason to enable it.

Make a 30-second recording: speak, pause, trigger a game sound, then speak over it. In the editor, solo track 2 and then track 3. Track 2 should have only your voice; track 3 should have no mic or unrelated app audio. Check for echo and clipping. If you prefer a voice-only stream, remove game/music from track 1; you can still keep game audio isolated on track 3 for the later edit.

### Gameplay footage and the public upload

Choose the actual game before clearing the footage. YouTube says monetization of game content depends on the publisher's commercial-use rights. Check that publisher's current policy for a **Baited product showcase**, including monetized use if intended, rather than assuming ordinary fan-gameplay permission covers every promotional use. Commentary or turning music off does not by itself grant those rights. [YouTube game-content guidance](https://support.google.com/youtube/answer/138161?hl=en).

A Content ID claim can monetize or block a video; it is different from a copyright strike. A valid copyright removal request can produce a strike. Muting game music removes one possible source of claims, but does not guarantee that gameplay or remaining audio is cleared. [YouTube claims and strikes](https://support.google.com/youtube/answer/6013276?hl=en).

For a soundtrack added later, use your own music or a license covering the intended Twitch stream, YouTube upload and showcase use. YouTube Audio Library is an option for the YouTube edit, with attribution where required; do not assume that means every off-platform use is covered. Upload a private draft and review YouTube's Checks before publication, while remembering that a clean check is not legal clearance and later claims are possible. [Audio Library terms](https://support.google.com/youtube/answer/3376882?hl=en), [YouTube upload checks](https://support.google.com/youtube/answer/57407?hl=en).

### Lakeeko's existing footage: CONTROL Resonant

The recording `2026-10-30 22-52-56.mp4` in `/home/maff/Documents/screens/baity/` shows **CONTROL Resonant**: its Twitch category is visible at 00:10, 05:00 and 15:00, and the 15:00 frame shows the Underpass quest and matching HUD. The newest recording was excluded from this identification.

The older launch notice about having no licensed-music switch is superseded: Remedy's **1 October update 1.4.0** added **Mute copyrighted music**, specifically for Apocalyptica's *Upperhand* in the intro credits. Check the installed game version and that setting before recording. This is a specific audio control, not blanket clearance for all music or gameplay. [Official update notes](https://steamcommunity.com/app/3669870/announcements/).

We have not established an explicit Remedy permission covering a monetized Baited promotional showcase. Their [media and influencer page](https://www.remedygames.com/media-and-influencers) provides a press contact if clarification is needed; no inquiry has been sent.

`ffprobe` found **one stereo AAC audio stream** in that MP4. It therefore does not supply separate exported microphone, game and music tracks. Stream count alone cannot tell us which sounds are in that track. Preserve it and ask for any original multitrack recording if independent audio editing is needed; remuxing this file cannot create missing stems.

## The three takes

The 120 seconds are a round limit, not a required recording length. Start each file early and keep ten seconds after the result. A wrong guess adds 15 seconds, so the final round can run longer than two minutes. Current catches have a **15-second automatic confirmation window**. Keep that window in the raw recording; the edit can jump forward, with a visible time cut. **Confirm now** is also a real control, but do not imply the automatic confirmation was instant.

### Round 1: Banana. Streamer wins.

**Purpose:** teach the rules with a fast, readable escape. Target edit: 20 seconds.

| Approximate round time | Action |
|---|---|
| 0–10 seconds elapsed | Start round. Viewer records the Banana card; streamer plays normally. |
| 10–25 seconds | Paolo: “What do you put in a smoothie?” Another viewer: “Something yellow. Suspiciously boomerang-shaped.” |
| 25–40 seconds | Streamer: “You are making this one very obvious. I'm calling it.” Open Call the bait and **type `banana` without saying it aloud**. |
| Result + 10 seconds | Show the actual successful guess and score: **Streamer 1, chat 0**. Streamer can now say “Banana. Nice try.” Chat: “We were warming up.” |

Saying “banana” before submitting can give chat the catch first. Record the typed guess in a separate, tightly cropped Studio pickup if needed, after hiding private links and transcript. The public result is the main proof.

### Round 2: Ghost. Chat wins.

**Purpose:** a chat conversation steers the streamer into saying the word. Target edit: 25 seconds.

| Approximate round time | Action |
|---|---|
| 0–30 seconds | Start with the game and a light horror topic: “Would this place be worse with the lights off?” |
| 30–60 seconds | “Do you watch horror for the story, or just to see who survives?” Let the streamer give an honest answer. |
| 60–90 seconds | Paolo: **“What's your favorite scary movie?”** If needed: “What about the mask in Scream?” |
| Around 90 seconds | Streamer may use this prepared observation: **“That long white mask looks like a ghost.”** Then react to the actual catch. |
| Confirmation + 10 seconds | Record “Catch heard,” its confirmation and the real score: **1–1**. Chat: “We only asked about movies.” |

Use **ghost as a separate spoken word**. The current matcher does not treat the single token “Ghostface” as “ghost.” The Scream mask is a useful topic, but the line above avoids depending on how Moonshine spells that proper name. Do not invent a favorite film or a personal anecdote for the streamer.

### Round 3: Bait. Chat wins at the finish.

**Purpose:** misdirection, a wrong guess, extra time, then the self-inflicted last line. Target edit: 33 seconds.

| Clock / moment | Action |
|---|---|
| Early round | Show the viewer's **BAIT** card. Chat talks about fishing and Friday dinner. Streamer thinks the target is fish. |
| About 40 seconds left | “What swims and ends up on a Friday plate?” Another viewer: “You are circling the answer.” Keep the actual target out of chat. |
| **0:10 left** | Streamer: “It's fish. It has to be.” Open Call the bait, type **`fish`**, and submit. A wrong guess should visibly add **15 seconds**. Allow for time spent typing; the displayed timer may be below 0:25. |
| After the bonus | Streamer reacts to the real rejection: “Wrong? Fine. I can survive this.” Chat: “Plenty of time.” |
| About **0:06 left** | Finish the line **“You guys will never bait me.”** Leave a short pause so the recognizer can finalize it before the round expires. |
| Catch and confirmation | Record the actual catch, automatic confirmation, **Streamer 1, chat 2**, and the two-win streak. Hold the face/chat reaction for ten seconds. |

Say **bait**, not only “baited.” A single wrong guess uses the round's only guess; do not script a second one. Do not push the spoken payoff into the final fraction of a second just for drama. If the round times out before the catch, keep the honest outcome and restart the take for a new attempt.

The third word is a recording-sequence card. The script should follow the exact card and controls actually served by the updated pilot, rather than rely on a normal random deck drawing Bait.

## Keep recording for the natural session

After round three, do not restart the take if you want normal random play next. Let the normal deck resume; check the usual difficulty/mission settings before continuing. You can turn Auto rounds back on after the scripted result has been safely recorded.

Play at least ten rounds. Use topics that make conversation without requiring a personal disclosure: a game shortcut that looks suspicious, a tiny interface detail you care about, or a decision you just made in the game and want to defend. Save the actual unexpected phrases and chat reactions. A genuine miss, a well-handled wrong detection or a convincing streamer escape can make a better closing clip than another prepared win.

## The 2:50 edit

The current hackathon page requires a demo of at most three minutes showing the project working on Twitch and how Codex was used. Put both in the main cut, not only the description. [Official event page](https://twitchcon-codex.devpost.com/).

| Final video | What is on screen | Spoken / editorial direction |
|---|---|---|
| **0:00–0:06** | Flash forward: the real Fish guess fails, +15 appears, then cut before the final catch. Baited name is visible. | “One wrong guess bought chat another fifteen seconds.” |
| **0:06–0:12** | Streamer back beside the real viewer card; brief “Coordinated demo · live Twitch gameplay” label. | “Chat gets a word. The streamer tries not to say it. This is Baited.” |
| **0:12–0:32** | Banana clue → typed guess → streamer win. | Let real chat and reaction carry it. Establish the 1–0 score. |
| **0:32–0:57** | Ghost card, movie question, literal “ghost,” catch, 1–1. | Keep the decisive spoken word and the app response audible and readable. |
| **0:57–1:30** | Bait card, fish clues, wrong guess/+15, final line, catch and 1–2 streak. | Close the opening promise here. Use an honest jump over the 15-second review, not a fake instant confirmation. |
| **1:30–2:15** | A real Codex interaction/diff, short test evidence, then client/Worker diagram and real mic transcript. | Use the build/learning narration below. |
| **2:15–2:32** | Card maker or Croatian card preview only if it is actually working; otherwise present a clearly labelled next-step sketch. | “Next, we want communities to bring their own references into the deck, and to play in more languages. Local speech support needs testing for each language.” |
| **2:32–2:44** | One genuine natural-round reaction or a short blooper. | Keep the best real line. No new feature explanation here. |
| **2:44–2:50** | Original Baited wordmark and current Prism card move toward camera; one short impact sound. | “Bait them.” Then the landing address. |

Leave the final ten seconds of the three-minute allowance unused so export slates or platform duration rounding cannot cut off important proof. Cut quiet waiting, not the causal steps. A small “Later in the round” label is clearer than silently changing the timer.

### Build and learning narration, about 45 seconds

> We used Codex to build and debug Baited across the Twitch Extension, streamer Studio and backend. One hurdle was getting the browser's speech model to load safely; another was keeping the secret card out of the streamer's view. Moonshine checks speech locally. Cloudflare Workers and Durable Objects coordinate the round, while Twitch brings in chat. We also studied how creators talk with their audiences. During long gameplay, conversation can stall while everyone waits for something to happen. A shared secret gives chat something to work toward, and gives the streamer a reason to keep talking. Testing together taught us where the timing and controls needed to change.

Show evidence for those claims: an actual Codex exchange, the real change and its test, not a staged terminal full of invented output. The earlier Moonshine CSP fix is recorded as commit `85ecdcc`; choose a verified diff or conversation that is easy to read. Credit Claude for design critique and ChatGPT for artwork if showing that work. Do not attribute their work to Codex or call Moonshine an OpenAI model.

### Opening alternatives

Use the same six-second footage and change only the narration when comparing these:

| Option | Spoken hook | Promise and payoff |
|---|---|---|
| A, recommended | “One wrong guess bought chat another fifteen seconds.” | The recorded +15 proves the premise immediately; the catch at 1:20–1:30 shows what chat does with it. |
| B | “The word was bait. I was convinced it was fish.” | Reveal the secret up front and invite the viewer to watch the wrong guess unfold. This is explicitly the coordinated demo, not a claim of blind surprise. |
| C | “Chat had one word to make me say. I helped them.” | The final spoken “bait” closes the loop near 1:30. Use only if that line and catch are in the actual take. |

Frame one should already contain gameplay, a readable timer or the wrong-guess result. Save the full logo animation for the ending. No empty opening title card.

## Hand off the raw files

Keep each take's master recording, viewer recording and audio together. Use names such as `komediruzecki7_game_take-01_master.mkv` and `komediruzecki7_game_take-01_viewer.mp4`. Note the real game name, take number, the three round start/result times and any sync issue in a small text file. Mark good moments while watching; do not trim the originals.

Before sharing footage, check browser bars, OBS properties, Studio setup links, notifications and account settings for private data. Do not record OAuth callbacks, keys, private overlay URLs, Cloudflare controls or a password manager. Keep authentication and setup outside the take. The game and chat are the subjects.

Export a 2560 × 1440, 16:9 SDR video at the frame rate you actually recorded. For H.264/MP4, YouTube's SDR reference is 16 Mbps for 1440p at 24–30 fps or 24 Mbps at 48–60 fps, with 48 kHz audio. These are upload recommendations, not OBS stream bitrate targets. [YouTube encoding guidance](https://support.google.com/youtube/answer/1722171?hl=en).

Suggested title: **Baited: Twitch Chat Sets the Trap | Built with Codex**. A thumbnail can use the real Fish rejection, BAIT viewer card and the streamer's recorded reaction, with **WRONG GUESS. +15s.** as the only extra text. Do not invent a reaction shot. Keep the repository private until its separate sharing decision; uploading this video is not permission to publish code or submit the Extension for review.
