# Judge walkthrough

Baited gives Twitch viewers a secret word and asks them to make the streamer say it through ordinary conversation. This guide offers a self-run local test and explains what is needed for hosted Twitch access.

## Access and tested scope

The source repository is [Komediruzecki/baited](https://github.com/Komediruzecki/baited). Use the submitted revision identified by the team. If it is private, repository access must be granted before cloning; this document does not establish that an invitation has been accepted.

The [Cloudflare pilot Studio](https://pilot-baited.maff.app/studio) is running for two invited streamer channels. The project owner has tested live play on desktop and iOS. Each channel has a limit of 100 distinct participants per round and 100 concurrent viewer connections. The pilot uses Moonshine and the built-in 100-card deck.

The pilot URL does not automatically authorize a judge's Twitch account or a new channel. The native Extension remains in **Hosted Test**, so testing its real Twitch views requires configured tester access plus installation and activation on an allowed channel. Arrange that session with the project team before relying on it for judging. The Extension is not offered as a publicly installable directory release.

The local demo below needs no credentials or paid service. It exercises the actual game with fixture chat and optional physical microphone recognition; it does not prove a Twitch connection on the judge's device. A separate Extension workbench shows the real panel/config frontend with local fixtures. These routes make the game inspectable without handing judges broadcaster secrets.

## Run the local demo

Use Node 24 and pnpm 10.34.3. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @baited/app build
pnpm preview:local
```

Open [http://127.0.0.1:3318](http://127.0.0.1:3318). The fixed-port preview stops after three hours or **Ctrl+C**. Rebuild after source changes. [Setup details](GETTING_STARTED.md) cover cloning and troubleshooting the separate live configuration.

1. Choose **Try the local demo**, then start a round in Studio.
2. Open the viewer-room link from **Stream setup** in another tab. The viewer sees the word; Studio keeps it hidden during the round.
3. Use **Demo controls** to send chat under a test chatter name. Reusing the same name does not create another participant.
4. Send a simulated final transcript containing the target. Check the catch/result and shared score. If a review is pending, confirm it.
5. Reverse the confirmed catch. The score and streak are corrected; the revealed round stays closed.
6. Open the OBS preview from **Stream setup**. It is read-only. Start another word after cooldown and confirm that its active target is absent from OBS.

For a physical microphone check, turn on the microphone and wait for Moonshine to become ready. Start a fresh round after cooldown, open **Solo test → Reveal secret word**, then say the target in a sentence. A detected catch stops the round and has a 15-second rejection window before automatic confirmation. This is a device-specific recognition check, not an accuracy benchmark. Use headphones.

## Try Call the bait

Enable **Call the bait** in Game settings before starting a fresh word. It permits one guess per word.

- Submit a wrong typed guess. The guess is used and chat gains 15 seconds.
- On a different word, submit the correct guess to escape. Keep optional Baity chaos off for this basic rules check.
- On another fresh word, enable **Voice guesses** and the microphone. Say **“I am calling the bait, banana, lock in”**, replacing banana with the demo target. A recognized combined command submits without requiring pauses. Leave off the lock phrase to inspect the draft first; it expires after 15 seconds.

Speech recognition can miss a command. Once the guess is used, saying the target still counts. Once a possible catch reveals a word, it cannot be converted into an escape, even if the catch is rejected. Voice drafts may be announced when the bot is connected and announcements are enabled; typed guesses do not request public draft announcements.

## Inspect the native views

Run in a second terminal from the repository root:

```sh
pnpm preview:extension
```

Open [http://127.0.0.1:3322](http://127.0.0.1:3322). Compare viewer and broadcaster fixtures, phone/panel sizes, active rounds and results. This fixed-port preview stops after three hours or **Ctrl+C** and does not authorize or install anything on Twitch.

## Arrange a hosted Twitch session

Before the session, the team should confirm the judge's required access, an allowed broadcaster, the active Extension version and a free testing window. Use a separate viewer account and keep the viewer card out of the broadcast scene.

During the session, check real chat participation, the secret card, the OBS clock and a catch from the broadcaster's physical microphone. Try pause/resume and a new word after the result. Record device/browser and observed behavior; successful fixture tests do not establish those live outcomes. Do not paste keys or broadcaster tokens into a judging form.

Moonshine processes English audio locally. Only final transcript text and timing reach the game server. [Speech Lab](https://pilot-baited.maff.app/speech-lab) is a separate local-audio comparison tool. Whisper there cannot replace Studio's recognizer or score a round.

The submission must provide the access needed for free testing through judging. A video, reachable Studio page or private repository URL alone is not proof of that access. [Hackathon requirements](hackathon-requirements.md) records the current deadline and freeze instructions.
