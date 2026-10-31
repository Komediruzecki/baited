# Read chat with one screen

Use a phone or tablet beside the PC for the current pilot. Chatterino is installed on the Linux PC for the next desktop test. A second monitor is optional.

## What each view does

| View | Who sees it | Purpose |
| --- | --- | --- |
| Twitch chat on a phone/tablet | Streamer | Read clues beside the game. Mute the stream audio to avoid an echo. |
| Chatterino floating overlay | Streamer, plus anyone whose recording captures that window | Read ordinary Twitch chat over the desktop/game. It is a separate desktop app. |
| Chat widget in an OBS Browser Source | Everyone watching the video | Put public chat into the broadcast. This alone does not put chat over the game on the streamer's desktop. |
| Baited OBS HUD | Everyone watching the video | Show public round information and the result. |
| Baited native Twitch Extension | Each viewer separately | Show the live secret to viewers and the card back to the broadcaster. |

Keep the viewer's secret-card page out of the streamer's reading setup. Chatterino shows normal Twitch chat, including anything viewers actually type; it does not filter spoilers or replace Baited's clue rules.

## Installed on this PC

Verified 30 October 2026 on Archcraft:

- Chatterino **2.5.5**, official Arch build, package revision `2.5.5-9`.
- User-local executable: `/home/maff/.local/bin/chatterino`.
- Application-menu entries: **Chatterino** and **Baited Chat**.
- Files: `/home/maff/.local/opt/chatterino/2.5.5-9/`.
- The published archive SHA-256 matches both the upstream release and the reviewed AUR recipe. `ldd` found no missing shared libraries. An offscreen `--version` check exited successfully.
- The launcher uses XWayland (`xcb`) with this PC's installed Qt packages. Native Qt Wayland support is not installed. Actual floating-window behavior on Hyprland still needs the desktop test below.

This install does not require sudo and is not managed by pacman. Its launcher, icon and MIT license are installed under `~/.local`. It does not auto-start. The GUI was left closed; OBS scenes, Twitch settings and account authorizations were not changed.

The [MIT license](https://github.com/Chatterino/chatterino2/blob/v2.5.5/LICENSE) permits free and commercial use. Using the app beside Baited does not change Baited's license. Preserve Chatterino's notices if distributing its code or binaries.

The [official Linux guide](https://chatterino.com/linux) recommends `yay -S chatterino2-bin` on Arch. If you later choose that system-managed installation, remove the user-local launcher first so it does not shadow `/usr/bin/chatterino`; keep any saved Chatterino account/settings files. Linux stable is 2.5.5 at this checkpoint; the 2.5.6 release is Windows/macOS only.

## Next test: Chatterino over the game

1. Open **Baited Chat** from the application menu, or run:

   ```sh
   /home/maff/.local/bin/chatterino --safe-mode --channels t:komediruzecki7
   ```

   This opens only that public channel with plugins disabled. Start by reading chat without adding an account. Sending messages or moderation may require a separate login; review that consent yourself. Never paste an OAuth token into a command, Baited or a setup document.
2. Select the channel split and press **Ctrl+Alt+N** to open its floating overlay. This shortcut is documented in the [official changelog](https://chatterino.com/changelog).
3. Place the chat where it leaves the game and Baited HUD readable. On this PC, if the chat tiles beside the game, focus that chat window and press **Super+Space** once to make it float. The owner confirmed this works on 30 October 2026. Maximize the game with **Super+Ctrl+F**, retaining Waybar. Increase chat text size, then check it at normal viewing distance. Exclusive fullscreen and click-through behavior are not yet verified here.
4. Ask Paolo to send an ordinary clue and check that it arrives while the game has focus. Minimize and restore the overlay; verify new messages still arrive.
5. Record a short OBS clip and inspect it. A whole-display capture can include the floating chat; a chosen game/window capture may exclude it. Confirm the actual result with the capture method you use.

The fixed-channel `--channels` launch does not save settings. For persistent font/layout preferences, open the standard **Chatterino** launcher, add `komediruzecki7` as a channel and save preferences there. This behavior is defined in the [versioned argument implementation](https://github.com/Chatterino/chatterino2/blob/v2.5.5/src/common/Args.cpp).

If the overlay is awkward with the game or compositor, keep the phone/tablet. That is a complete one-PC streaming setup while the desktop option is tested.

## Public chat widget in OBS

**Prepared, not configured:** there is no new public chat Browser Source or StreamElements account grant from this task. Chatterino's built-in floating overlay is installed; the broadcast widget is a separate choice.

When you want chat drawn into the broadcast:

1. Use the StreamElements web Overlay Editor, connect the intended Twitch channel with owner-reviewed consent, and add a chat widget. Its [overlay documentation](https://docs.streamelements.com/overlays) describes rendering widgets through an OBS Browser Source. The SE.Live desktop plugin is not needed for this Linux setup.
2. Start with a transparent chat area about 360 by 520 pixels, sized for the actual scene. Use readable type, restrained purple accents and enough contrast over the game. Avoid covering the Baited HUD, captions or game controls.
3. In OBS, add a **Browser** source named **Public Twitch chat**, paste that provider's overlay URL directly into its properties, and set matching dimensions. Keep private overlay URLs out of Git, screenshots and support logs. Do not replace the existing Baited OBS source.
4. Put this source above the game in the Sources list. Test messages and moderation/deletion behavior with a short local recording before streaming it.
5. Keep the phone or Chatterino for the streamer's own reading view. An OBS source changes the output scene; it does not create a floating desktop window. [OBS chat guidance](https://obsproject.com/kb/faq-stream-chat).

If you want to avoid another provider, test capturing a dedicated Chatterino window instead. This avoids a widget account but needs cropping, styling and a check that it remains captured when the game is focused. Choose one public-chat source to prevent duplicate chat in the video.

## Baited integration plan

1. **Now:** phone/tablet chat remains the working setup. The installed desktop app is available for a separate test.
2. **After the desktop test:** add a short one-screen setup choice to Studio's Stream setup help: phone/tablet, Twitch chat popout or Chatterino. Link instructions and copy the current broadcaster's channel name. Do not add Chatterino tokens or an embedded viewer secret-card page to Studio.
3. **If public chat is wanted in the video:** configure and review the separate OBS widget above. Match its typography and spacing to the Baited HUD; preserve each streamer's existing scene.
4. **After acceptance:** put the confirmed Linux steps and capture behavior into general onboarding. Test other operating systems before presenting the floating overlay as a supported cross-platform feature.

Chatterino connects directly to Twitch and its emote providers. It does not join a Baited room, add Worker requests or consume Baited's viewer-socket allowance. No new Baited server, storage or paid cloud resource is needed for this desktop setup. Recheck any optional widget provider's current terms before choosing a paid feature.

## Acceptance before calling the overlay ready

- A real clue is readable while the game has focus, with the microphone and Baited round running.
- Resizing, minimizing/restoring and reconnecting preserve readable chat.
- A short recording confirms which windows the OBS capture includes and that the scene has no duplicate chat.
- The streamer's chat tools show ordinary chat, not Baited's live secret-card view.
- The phone/tablet remains a usable fallback.

Installation checks passed. The owner subsequently confirmed that chat loads and **Super+Space** makes its window float. Capture, game focus, reconnect and recording checks remain for the owner; no stream, chat message or Baited deployment was started by the agent. See the [Arch recording guide and three-round plan](./recording/README.md).

Install evidence: registered run `baited/2026-10-30/ae9e92ff9da24434bf352b28ac84d765`.
