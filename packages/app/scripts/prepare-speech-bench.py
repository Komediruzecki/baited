#!/usr/bin/env python3
"""Opt-in static model preparation. No audio, inference, accounts, or cloud resources.

Without --download, prints the pinned asset plan only. Supply an existing registered
agent-out run as --output (a child directory is fine). Never writes to the repo.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import urllib.request

SOURCE = Path(__file__).resolve().parent / 'speech-bench'
LOCK = json.loads((SOURCE / 'asset-lock.json').read_text())
MAX_BYTES = 40 * 1024 * 1024
OUTPUT_ROOT = Path('/run/media/maff/Game_Shared/agent-out-live').resolve()


def check_bytes(data, asset):
    if len(data) != asset['bytes'] or len(data) > MAX_BYTES:
        raise ValueError(f"Unexpected asset size: {len(data)} (expected {asset['bytes']})")
    if hashlib.sha256(data).hexdigest() != asset['sha256']:
        raise ValueError('Asset checksum mismatch; nothing will be trusted or served.')


def fetch(url, size):
    started = time.monotonic()
    request = urllib.request.Request(url, headers={'User-Agent': 'Baited-local-speech-bench/1'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.headers.get('Content-Length') and int(response.headers['Content-Length']) > MAX_BYTES:
            raise ValueError('Download exceeds the per-file budget.')
        data = bytearray()
        while block := response.read(1024 * 256):
            data.extend(block)
            if len(data) > min(size, MAX_BYTES) or time.monotonic() - started > 180:
                raise ValueError('Download exceeded its size or time budget.')
        return bytes(data)


def atomic_write(target, data, root):
    # Replacing an existing symlink/hardlink changes that directory entry, not its target.
    if not target.parent.resolve().is_relative_to(root):
        raise ValueError('Asset destination escapes the prepared directory.')
    descriptor, temporary = tempfile.mkstemp(prefix='.speech-', dir=target.parent)
    try:
        with os.fdopen(descriptor, 'wb') as handle:
            handle.write(data)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--download', action='store_true', help='Explicitly fetch ~59 MB of public model/runtime assets.')
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    if not output.is_relative_to(OUTPUT_ROOT) or output == OUTPUT_ROOT:
        parser.error('--output must be inside a registered Game_Shared agent-out run, outside the repository.')
    print(f"Pinned assets: {sum(a['bytes'] for a in LOCK['files']):,} bytes. Model {LOCK['model']}@{LOCK['revision']}.")
    if not args.download:
        print('Plan only. Add --download after reserving output space. No files created.')
        return
    output.mkdir(parents=True, exist_ok=True)
    for asset in LOCK['files']:
        target = output / asset['path']
        if asset['path'] == 'NOTICES.md':
            data = (SOURCE / 'NOTICES.md').read_bytes()
            check_bytes(data, asset)
            atomic_write(target, data, output)
        else:
            if not target.resolve().is_relative_to(output):
                raise ValueError('Asset destination escapes the prepared directory.')
            if target.exists():
                if not target.is_file() or target.stat().st_size != asset['bytes']:
                    raise ValueError('Existing asset has the wrong size; preserve it and use a fresh prepared directory.')
                data = target.read_bytes()
            else:
                data = fetch(asset['source'], asset['bytes'])
            check_bytes(data, asset)
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                atomic_write(target, data, output)
        print(f"Verified {asset['path']}: {len(data):,} bytes")
    atomic_write(output / 'manifest.json', (json.dumps(LOCK, indent=2) + '\n').encode(), output)
    print(f'Ready. Restart the local preview with BAITED_SPEECH_ASSET_DIR={output}')


if __name__ == '__main__':
    main()
