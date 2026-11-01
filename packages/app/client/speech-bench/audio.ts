export type BenchAudio = { pcm: Float32Array; fingerprint: string };

/** A local listening preview of the retained PCM. Never used as a model input. */
export function previewWav(pcm: Float32Array): Blob {
  const bytes = new ArrayBuffer(44 + pcm.length * 2), view = new DataView(bytes);
  const tag = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  tag(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)), true));
  return new Blob([bytes], { type: 'audio/wav' });
}

/** Diagnostic equality marker, not a security hash. Works in a plain LAN preview too. */
export function pcmFingerprint(pcm: Float32Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}-${pcm.length}`;
}

const WAV_HELP = 'Choose an uncompressed PCM or float WAV with one or two channels. Convert MP3, M4A or other recordings to WAV first.';

/** Inspect PCM frame counts before a browser decoder can allocate the whole recording. */
export function inspectBenchWav(bytes: ArrayBuffer, maxSeconds = 300): { duration: number; channels: number; sampleRate: number } {
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 300) throw new Error('Invalid speech bench duration limit.');
  const view = new DataView(bytes);
  const tag = (at: number, text: string) => [...text].every((char, index) => at + index < view.byteLength && view.getUint8(at + index) === char.charCodeAt(0));
  if (bytes.byteLength < 44 || !tag(0, 'RIFF') || !tag(8, 'WAVE') || view.getUint32(4, true) !== bytes.byteLength - 8) throw new Error(WAV_HELP);
  let format: { channels: number; sampleRate: number; blockAlign: number } | null = null;
  let dataBytes: number | null = null;
  for (let offset = 12; offset < bytes.byteLength;) {
    if (offset + 8 > bytes.byteLength) throw new Error('This WAV has an incomplete chunk. Export a fresh WAV and try again.');
    const size = view.getUint32(offset + 4, true), start = offset + 8, next = start + size + (size % 2);
    if (next > bytes.byteLength) throw new Error('This WAV is incomplete. Export a fresh WAV and try again.');
    if (tag(offset, 'fmt ')) {
      if (format || size < 16) throw new Error(WAV_HELP);
      let encoding = view.getUint16(start, true);
      const channels = view.getUint16(start + 2, true), sampleRate = view.getUint32(start + 4, true);
      const byteRate = view.getUint32(start + 8, true), blockAlign = view.getUint16(start + 12, true), bits = view.getUint16(start + 14, true);
      if (encoding === 0xfffe) {
        // WAVE_FORMAT_EXTENSIBLE with the standard PCM/IEEE float subtype GUID.
        const guidTail = [0, 0, 0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113];
        if (size < 40 || view.getUint16(start + 16, true) < 22 ||
          view.getUint16(start + 18, true) !== bits || !guidTail.every((value, index) => view.getUint8(start + 26 + index) === value)) throw new Error(WAV_HELP);
        encoding = view.getUint16(start + 24, true);
      }
      if (![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 96000 ||
        !((encoding === 1 && [8, 16, 24, 32].includes(bits)) || (encoding === 3 && bits === 32)) ||
        blockAlign !== channels * bits / 8 || byteRate !== sampleRate * blockAlign) throw new Error(WAV_HELP);
      format = { channels, sampleRate, blockAlign };
    } else if (tag(offset, 'data')) {
      if (dataBytes !== null) throw new Error(WAV_HELP);
      dataBytes = size;
    }
    offset = next;
  }
  if (!format || !dataBytes || dataBytes % format.blockAlign) throw new Error(WAV_HELP);
  const duration = dataBytes / format.blockAlign / format.sampleRate;
  if (duration > maxSeconds) throw new Error(`Use a WAV clip up to ${maxSeconds === 60 ? 'one minute' : 'five minutes'} long.`);
  return { duration, channels: format.channels, sampleRate: format.sampleRate };
}

export async function decodeBenchAudio(file: File, maxSeconds = 300): Promise<BenchAudio> {
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Choose an audio file between one byte and 25 MB.');
  const bytes = await file.arrayBuffer();
  inspectBenchWav(bytes, maxSeconds);
  // Both adapters receive this very same decoded/resampled PCM, cached by the caller.
  const context = new OfflineAudioContext(1, 1, 16000);
  let decoded: AudioBuffer;
  try { decoded = await context.decodeAudioData(bytes); }
  catch { throw new Error('This WAV could not be decoded. Export a fresh PCM WAV and try again.'); }
  if (!decoded.length || decoded.duration > maxSeconds || decoded.numberOfChannels > 2 || decoded.sampleRate !== 16000) throw new Error('This WAV decoded outside the speech bench limits. Export a fresh 16 kHz mono WAV.');
  const pcm = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const values = decoded.getChannelData(channel);
    for (let index = 0; index < pcm.length; index++) pcm[index] += values[index] / decoded.numberOfChannels;
  }
  return { pcm, fingerprint: pcmFingerprint(pcm) };
}
