export type BenchAudio = { pcm: Float32Array; fingerprint: string };

/** Diagnostic equality marker, not a security hash. Works in a plain LAN preview too. */
export function pcmFingerprint(pcm: Float32Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}-${pcm.length}`;
}

export async function decodeBenchAudio(file: File): Promise<BenchAudio> {
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Choose an audio file between one byte and 25 MB.');
  // Both adapters receive this very same decoded/resampled PCM, cached by the caller.
  const context = new OfflineAudioContext(1, 1, 16000);
  let decoded: AudioBuffer;
  try { decoded = await context.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error('This recording could not be decoded. Try WAV, MP3 or another browser-supported audio file.'); }
  if (!decoded.length || decoded.duration > 300) throw new Error('Use an audio file up to five minutes long.');
  const pcm = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const values = decoded.getChannelData(channel);
    for (let index = 0; index < pcm.length; index++) pcm[index] += values[index] / decoded.numberOfChannels;
  }
  return { pcm, fingerprint: pcmFingerprint(pcm) };
}
