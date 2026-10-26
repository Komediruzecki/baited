#!/usr/bin/env python3
"""Bounded, silent OBS recording load. Never opens the user's OBS profile.

Needs a pre-created synthetic MP4, OBS and ffprobe. Run only after coordinating
with any speech benchmark. The output is a load probe, not a stream acceptance test.
"""
import argparse
import configparser
import datetime as dt
import json
import os
from pathlib import Path
import re
import signal
import statistics
import subprocess
import time


def ini_update(path, values):
    parser = configparser.ConfigParser(interpolation=None)
    parser.optionxform = str
    if path.exists():
        parser.read(path)
    for section, fields in values.items():
        if not parser.has_section(section):
            parser.add_section(section)
        for key, value in fields.items():
            parser.set(section, key, str(value))
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w') as stream:
        parser.write(stream, space_around_delimiters=False)


def snapshot(pid):
    # CPU is in units of one fully occupied logical CPU, like top(1).
    stat = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
    ticks = int(stat[11]) + int(stat[12])
    status = Path(f'/proc/{pid}/status').read_text()
    rss = re.search(r'^VmRSS:\s+(\d+) kB', status, re.M)
    return time.monotonic(), ticks / os.sysconf('SC_CLK_TCK'), int(rss[1]) * 1024 if rss else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True, type=Path)
    parser.add_argument('--label', required=True)
    parser.add_argument('--seconds', type=int, default=60)
    args = parser.parse_args()
    root = args.run.resolve()
    if not str(root).startswith('/run/media/maff/Game_Shared/agent-out-live/'):
        parser.error('--run must be the existing registered agent-out run')
    if not root.is_dir() or not (root / 'scratch').is_dir():
        parser.error('registered run does not exist')
    if not re.fullmatch(r'[a-z0-9-]{1,40}', args.label):
        parser.error('--label must contain lowercase letters, digits and hyphens')
    if not 10 <= args.seconds <= 180:
        parser.error('--seconds must be between 10 and 180')
    motion = root / 'scratch/obs-motion.mp4'
    if not motion.is_file():
        parser.error('create scratch/obs-motion.mp4 first; no display or audio capture is used')
    if subprocess.run(['pgrep', '-x', 'obs'], capture_output=True).returncode == 0:
        parser.error('OBS is already running; leave it untouched and coordinate the benchmark')
    config = root / 'scratch/obs-config'
    studio = config / 'obs-studio'
    scene_path = studio / 'basic/scenes/BAIT-Benchmark.json'
    if not scene_path.is_file():
        parser.error('isolated BAIT-Benchmark scene must be prepared first')
    scene = json.loads(scene_path.read_text())
    if any(s.get('id') not in ('scene', 'ffmpeg_source') for s in scene.get('sources', [])):
        parser.error('isolated benchmark scene contains an unexpected source type')
    sources = [s for s in scene['sources'] if s['id'] == 'ffmpeg_source']
    if len(sources) != 1 or Path(sources[0].get('settings', {}).get('local_file', '')).resolve() != motion:
        parser.error('benchmark requires exactly the task synthetic media source')
    sources[0].update({'volume': 0.0, 'muted': True, 'mixers': 0})
    timer = scene.setdefault('modules', {}).setdefault('output-timer', {})
    timer.update({'recordTimerHours': 0, 'recordTimerMinutes': args.seconds // 60,
                  'recordTimerSeconds': args.seconds % 60, 'autoStartRecordTimer': True,
                  'pauseRecordTimer': False, 'autoStartStreamTimer': False})
    scene_path.write_text(json.dumps(scene, indent=2) + '\n')
    settings = {'General': {'FirstRun': 'false', 'ConfirmOnExit': 'false'},
                'BasicWindow': {'PreviewEnabled': 'false', 'SysTrayEnabled': 'false',
                                'SysTrayWhenStarted': 'false', 'WarnBeforeStartingStream': 'false',
                                'WarnBeforeStoppingStream': 'false'}}
    ini_update(studio / 'user.ini', settings)
    ini_update(studio / 'global.ini', settings)
    # OBS migrates these documented legacy settings into its plugin config.
    # This disables the task-only server without reading a credential file.
    ini_update(studio / 'global.ini', {
        'OBSWebSocket': {'FirstLoad': 'true', 'ServerEnabled': 'false',
                        'AuthRequired': 'true', 'AlertsEnabled': 'false'}})
    recordings = root / 'scratch/obs-recordings'
    recordings.mkdir(parents=True, exist_ok=True)
    existing_bytes = sum(p.stat().st_size for p in recordings.glob('*.mkv'))
    if existing_bytes + args.seconds * 400_000 > 75 * 1024 * 1024:
        parser.error('recording estimate exceeds the task 75 MiB recording allowance; preserve existing files')
    ini_update(studio / 'basic/profiles/BAIT-Benchmark/basic.ini', {
        'SimpleOutput': {'FilePath': str(recordings), 'RecQuality': 'Stream', 'RecFormat2': 'mkv',
                         'VBitrate': 2500, 'ABitrate': 128, 'StreamEncoder': 'x264',
                         'RecEncoder': 'x264', 'Preset': 'veryfast'},
        'Video': {'BaseCX': 1920, 'BaseCY': 1080, 'OutputCX': 1920, 'OutputCY': 1080,
                  'FPSType': 0, 'FPSCommon': 60}})
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    prefix = f'obs-{args.label}-{stamp}'
    log = root / 'scratch/raw-logs' / f'{prefix}.log'
    log.parent.mkdir(parents=True, exist_ok=True)
    report_path = root / 'evidence' / f'{prefix}.json'
    env = dict(os.environ, XDG_CONFIG_HOME=str(config),
               XDG_CACHE_HOME=str(root / 'scratch/obs-cache'),
               XDG_DATA_HOME=str(root / 'scratch/obs-data'), QT_QPA_PLATFORM='offscreen')
    # Safe mode also suppresses --startrecording, so use bundled plugins only.
    command = ['obs', '--multi', '--only-bundled-plugins', '--profile', 'BAIT-Benchmark',
               '--collection', 'BAIT-Benchmark', '--scene', 'BAIT benchmark',
               '--disable-missing-files-check', '--startrecording']
    before = set(recordings.glob('*.mkv'))
    samples, cpu = [], []
    started = time.monotonic()
    recording_start = None
    recording_start_utc = None
    forced = False
    with log.open('w') as stream:
        process = subprocess.Popen(command, env=env, stdout=stream, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        last = None
        try:
            while process.poll() is None:
                text = log.read_text(errors='replace')
                if recording_start is None and '==== Recording Start' in text:
                    recording_start = time.monotonic()
                    recording_start_utc = dt.datetime.now(dt.timezone.utc).isoformat()
                    print(json.dumps({'event': 'recording-started', 'label': args.label,
                                      'pid': process.pid, 'seconds': args.seconds}), flush=True)
                if '==== Recording Stop' in text:
                    break
                if recording_start is None and time.monotonic() - started > 15:
                    forced = True
                    break
                if time.monotonic() - started > args.seconds + 25:
                    forced = True
                    break
                try:
                    sample = snapshot(process.pid)
                    samples.append(sample)
                    if last and recording_start is not None:
                        cpu.append(100 * (sample[1] - last[1]) / (sample[0] - last[0]))
                    last = sample
                except (FileNotFoundError, ProcessLookupError):
                    break
                time.sleep(1)
        finally:
            if process.poll() is None:
                # Signal only OBS; signaling the process group kills its muxer prematurely.
                process.send_signal(signal.SIGINT)
                try:
                    process.wait(timeout=12)
                except subprocess.TimeoutExpired:
                    forced = True
                    process.send_signal(signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
    text = log.read_text(errors='replace')
    outputs = sorted(set(recordings.glob('*.mkv')) - before)
    probes = []
    for output in outputs:
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                                'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate',
                                '-of', 'json', str(output)], capture_output=True, text=True, timeout=10)
        probes.append({'path': str(output.relative_to(root)), 'exitCode': probe.returncode,
                       'probe': json.loads(probe.stdout) if probe.returncode == 0 else None})
    lag = re.search(r'number of skipped frames due to encoding lag: (\d+)/(\d+) \(([\d.]+)%\)', text)
    frames = re.search(r'Total frames output: (\d+)', text)
    drawn = re.search(r'Total drawn frames: (\d+)', text)
    render_lag = re.findall(r'.*lagged frames.*', text)
    report = {'label': args.label, 'startedUtc': stamp, 'durationRequestedSeconds': args.seconds,
              'processWallSeconds': round(time.monotonic() - started, 3),
              'exitCode': process.returncode, 'forcedDeadline': forced,
              'recordingStarted': recording_start is not None,
              'recordingStartedUtc': recording_start_utc,
              'recordingStopped': '==== Recording Stop' in text,
              'encoder': 'x264 veryfast CBR 2500 kbps', 'video': '1920x1080 60 fps',
              'scene': 'silent looping synthetic MP4, CPU decode, no stream/game/browser/display/mic capture',
              'gpu': re.search(r'Loading up OpenGL on adapter (.+)', text)[1] if 'Loading up OpenGL on adapter ' in text else None,
              'encodingLag': {'skipped': int(lag[1]), 'total': int(lag[2]), 'percent': float(lag[3])} if lag else None,
              'framesOutput': int(frames[1]) if frames else None,
              'framesDrawn': int(drawn[1]) if drawn else None,
              'renderLagLog': render_lag, 'previewSwapchainErrors': text.count('Failed to create swap chain'),
              'muxerPipeErrors': text.count('os_process_pipe_write'),
              'meanObsCpuOneCorePercent': round(statistics.mean(cpu), 2) if cpu else None,
              'peakObsRssBytes': max((s[2] for s in samples), default=0),
              'processSamples': [{'secondsFromRecordingStart': round(s[0] - recording_start, 3),
                                  'cpuTimeSeconds': s[1], 'rssBytes': s[2]}
                                 for s in samples if recording_start is not None and s[0] >= recording_start],
              'recordings': probes, 'log': str(log.relative_to(root))}
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    summary = {key: value for key, value in report.items() if key != 'processSamples'}
    print(json.dumps({'report': str(report_path), 'sampleCount': len(report['processSamples']), **summary}), flush=True)
    return 0 if report['recordingStopped'] and not forced and process.returncode == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
