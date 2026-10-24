# Local preview handoff

This preview runs the compiled application with simulated Twitch/chat/speech input. It is not a deployment or live-provider test.

Working checkout: `/home/maff/foss/worktrees/twigame/bait-preview` on `feat/bait-preview`. The original imported source remains separate. The owner-authorized private remote is [Komediruzecki/bait](https://github.com/Komediruzecki/bait); remote checkpoints do not deploy the application.

Build from any directory:

```sh
rtk pnpm --dir /home/maff/foss/worktrees/twigame/bait-preview build
```

Start or restart from any directory after the previous instance has stopped:

```sh
rtk proxy env PREVIEW_PORT=3318 PREVIEW_SECONDS=10800 PREVIEW_DATA_DIR=/run/media/maff/Game_Shared/agent-out-live/twigame/2026-10-25/2c3339a32ba84d73ad991f9ce45337fc/scratch/preview-data pnpm --dir /home/maff/foss/worktrees/twigame/bait-preview preview:local
```

Open `http://127.0.0.1:3318`. The script uses a strict loopback port, clears Twitch/Deepgram credentials, the encryption key and proxy trust for the child process, and refuses a checkout containing `.env`. It stops after three hours; Ctrl+C stops it earlier. An occupied port is an error, not a request to kill another process. Restart only this preview through its own terminal. `PREVIEW_SECONDS` must be between 60 and 18,000; values outside that range are rejected, so five hours is the longest allowed run.

The process must actually respond before its URL is reported ready. Its launch and browser results are recorded in `validation.md`; the presence of this command alone does not prove it is running.

Use Try the local demo, open the viewer page separately, send a simulated hint and transcript, then inspect the reveal, award, pause/resume and reversal. The OBS view can be inspected in a browser, but actual OBS capture remains a separate gate.
