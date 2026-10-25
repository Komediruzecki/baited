# OBS load probe, October 25, 2026

This checks whether browser speech recognition can run alongside a repeatable OBS encoding workload. It is not acceptance of a real Twitch broadcast or the streamer's voice.

## Setup

- OBS 32.2.2 on the local Linux computer.
- Ryzen 9 5900X, 12 physical cores and 24 logical CPUs.
- OpenGL rendering on the AMD Radeon RX 9070 XT, verified in the OBS log.
- 1920 × 1080 at 60 fps. CPU x264 encoder, `veryfast`, CBR 2500 kbps.
- A muted synthetic motion MP4 loops as the sole source. No microphone, webcam, desktop, game or live Twitch source is captured.
- Qt runs offscreen with the OBS preview disabled. This measures rendering and encoding without a visible OBS window.
- Task-only `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` and `XDG_DATA_HOME`. The normal OBS profile is untouched. The WebSocket server is disabled; no OBS listener appeared during the baseline.

The installed OBS package has no Browser Source plugin. This probe therefore does not validate a BAIT browser overlay inside OBS. That integration remains a separate test.

## Measurements

| Measurement | OBS alone | OBS with Moonshine test window |
| --- | ---: | ---: |
| Recording duration | 59.984 s | 90.384 s |
| Encoding frames skipped / total | 24 / 3648 | 35 / 5470 |
| Encoding lag reported by OBS | 0.7% | 0.6% |
| Frames output | 3598 | 5421 |
| Mean OBS CPU, one logical CPU = 100% | 158.58% | 139.44% |
| Peak OBS process RSS | 1,248,669,696 bytes | 1,242,185,728 bytes |
| Preview swapchain errors | 0 | 0 |
| Muxer pipe errors | 0 | 0 |
| Process exit | 0, graceful | 0, graceful |

The loaded run recorded from approximately 09:37:52 UTC for 90 seconds. The confirmed speech interaction window was 09:38:07.285–09:39:01.307 UTC, entirely inside that recording. CPU averages and encoding totals in the table cover the whole recording. The loaded JSON preserves one-second process samples and a separately calculated `speechWindow`. Speech metrics are in `evidence/moonshine-obs-recording.json`.

OBS already skipped some encoding frames in the baseline. A lower percentage in one loaded sample does not demonstrate that Moonshine improves OBS performance. These runs show no observed increase in the aggregate encoding-lag percentage for this short synthetic workload. They do not establish performance in a GPU-heavy game, with a webcam, with Browser Source, or during a long broadcast. No explicit render-lag line was emitted; absence of a line is not a separately measured render-lag value.

## Evidence

The registered task run is `bc3311e50e1a4f3cab679e1668ec8a36` under the shared `twigame/2026-10-25` output directory.

- Valid baseline: `evidence/obs-baseline-20261025T093110Z.json`.
- Valid concurrent recording: `evidence/obs-moonshine-active-20261025T093751Z.json`.
- Second control: `evidence/obs-moonshine-loaded-20261025T093345Z.json`. The filename retains the intended condition; `label` and `speechConcurrent` record the actual OBS-only condition.
- Visible recorded source: `evidence/obs-baseline-frame.png`, extracted at 30 seconds and inspected.
- Raw OBS logs live in `scratch/raw-logs/`; recordings stay in `scratch/obs-recordings/`.
- The earlier `obs-baseline-20261025T092627Z.json` is an invalid setup attempt: safe mode suppressed automatic recording. It is excluded from the table.
- The second OBS-only control is also excluded from the table. It was intended to include Moonshine, but no speech test ran during that window. Its classification was corrected before drawing the comparison.

## Repeat the existing isolated setup

The helper requires the prepared task scene and `scratch/obs-motion.mp4`. It refuses to run while any OBS process is active and refuses an estimate that would exceed the task's 75 MiB recording allowance. It never deletes recordings. Coordinate with the speech test before starting it.

```sh
rtk proxy timeout 180 python3 /home/maff/foss/worktrees/twigame/bait-preview/scripts/benchmark-obs.py \
  --run /run/media/maff/Game_Shared/agent-out-live/twigame/2026-10-25/bc3311e50e1a4f3cab679e1668ec8a36 \
  --label repeat-loaded --seconds 120
```

The helper checks current recording usage before starting. Preserve the existing evidence. Removal of the initial probe and unused second-control media was explicitly authorized to make space for a measured concurrent run; the exact paths, hashes and reasons are retained in `evidence/obs-owned-recording-cleanup.json`. Their JSON reports and raw logs remain.

The helper emits `recording-started` when OBS has started output. Begin the speech file then. OBS's output timer stops the recording; the helper signals only the OBS process to close, allowing its muxer child to finalize the file. It then checks the result with `ffprobe`.

Implementation references: [OBS signal handling](https://github.com/obsproject/obs-studio/blob/master/frontend/OBSApp.cpp), [OBS frontend recording and preview API](https://docs.obsproject.com/reference-frontend-api), and [OBS WebSocket configuration migration](https://github.com/obsproject/obs-websocket/blob/master/src/Config.cpp).
