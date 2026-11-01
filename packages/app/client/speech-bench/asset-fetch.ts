import assetLock from '../../scripts/speech-bench/asset-lock.json';
import { SPEECH_ASSET_PREFIX } from './asset-policy';

const CHUNK_BYTES = 16 * 1024 * 1024;
const STATIC_LIMIT = 25 * 1024 * 1024;
const MANIFEST_LIMIT = 64 * 1024;
type Part = { path: string; bytes: number; sha256: string };
type File = Part & { source?: string; chunks?: Part[] };
type Manifest = Omit<typeof assetLock, 'files'> & { transport?: 'chunked-static-v1'; files: File[] };
const setupError = () => new Error('Whisper assets are unavailable or do not match this version. Choose Moonshine or reload after the model is prepared.');
const aborted = (signal?: AbortSignal | null) => {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Speech loading was cancelled.', 'AbortError');
};
const sha256 = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  .map((value) => value.toString(16).padStart(2, '0')).join('');

/** Never trust an unbounded Content-Length, stream, or fallback HTML body. */
async function readBounded(response: Response, maximum: number, signal?: AbortSignal | null): Promise<Uint8Array<ArrayBuffer>> {
  aborted(signal);
  if (!response.ok || response.headers.get('content-type')?.toLowerCase().includes('text/html')) throw setupError();
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw setupError();
  if (!response.body) throw setupError();
  const reader = response.body.getReader();
  const bytes = new Uint8Array(maximum);
  let used = 0;
  try {
    while (true) {
      aborted(signal);
      const result = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const cancel = () => {
          void reader.cancel().catch(() => {});
          reject(signal?.reason ?? new DOMException('Speech loading was cancelled.', 'AbortError'));
        };
        signal?.addEventListener('abort', cancel, { once: true });
        reader.read().then(resolve, reject).finally(() => signal?.removeEventListener('abort', cancel));
      });
      aborted(signal);
      if (result.done) break;
      if (used + result.value.length > maximum) throw setupError();
      bytes.set(result.value, used); used += result.value.length;
    }
    return used === maximum ? bytes : bytes.slice(0, used);
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

export function validateWhisperAssetManifest(value: unknown): Manifest {
  if (!value || typeof value !== 'object') throw setupError();
  const manifest = value as Record<string, unknown>;
  const fields = ['format', 'model', 'revision', 'transformers', 'onnx', 'dtype', 'device'] as const;
  if (fields.some((field) => manifest[field] !== assetLock[field]) || !Array.isArray(manifest.files)
    || manifest.files.length !== assetLock.files.length ||
    (manifest.transport !== undefined && manifest.transport !== 'chunked-static-v1')) throw setupError();
  for (const expected of assetLock.files) {
    const matches = manifest.files.filter((file) => file && typeof file === 'object' && file.path === expected.path);
    if (matches.length !== 1) throw setupError();
    const file = matches[0] as File;
    if (file.bytes !== expected.bytes || file.sha256 !== expected.sha256 || file.source !== expected.source
      || Object.keys(file).some((key) => !['path', 'bytes', 'sha256', 'source', 'chunks'].includes(key))) throw setupError();
    const split = manifest.transport === 'chunked-static-v1' && expected.bytes > STATIC_LIMIT;
    if (!split) { if (file.chunks !== undefined) throw setupError(); continue; }
    if (!Array.isArray(file.chunks) || file.chunks.length !== Math.ceil(expected.bytes / CHUNK_BYTES)) throw setupError();
    for (const [index, part] of file.chunks.entries()) {
      if (!part || typeof part !== 'object' || Object.keys(part).sort().join(',') !== 'bytes,path,sha256'
        || part.path !== `chunks/${expected.sha256}-${index}.bin`
        || part.bytes !== Math.min(CHUNK_BYTES, expected.bytes - index * CHUNK_BYTES)
        || typeof part.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(part.sha256)) throw setupError();
    }
  }
  return value as Manifest;
}

/** Same-origin model reads only. Large static files are reconstructed inside the browser worker. */
export async function createWhisperAssetFetch(fetcher: typeof fetch, origin: string, signal?: AbortSignal): Promise<typeof fetch> {
  const base = new URL(origin).origin;
  const get = (path: string, requestSignal?: AbortSignal | null) => fetcher(new URL(`${SPEECH_ASSET_PREFIX}${path}`, base), {
    method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: requestSignal,
  });
  const response = await get('manifest.json', signal);
  if (response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw setupError();
  const manifestBytes = await readBounded(response, MANIFEST_LIMIT, signal);
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(manifestBytes)); } catch { throw setupError(); }
  const manifest = validateWhisperAssetManifest(parsed);
  const files = new Map(manifest.files.map((file) => [file.path, file]));
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), base);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    if (method !== 'GET' || init?.body != null || request?.body != null || url.origin !== base || url.username || url.password
      || url.search || url.hash || !url.pathname.startsWith(SPEECH_ASSET_PREFIX))
      throw new Error('Whisper only reads its prepared same-origin model assets.');
    const signals = [signal, init?.signal, request?.signal].filter((item): item is AbortSignal => Boolean(item));
    const currentSignal = signals.length ? AbortSignal.any(signals) : undefined;
    aborted(currentSignal);
    const name = url.pathname.slice(SPEECH_ASSET_PREFIX.length);
    if (name === 'manifest.json') return new Response(manifestBytes.slice(), { headers: { 'Content-Type': 'application/json' } });
    const file = files.get(name);
    if (!file) throw new Error('Whisper requested an asset outside the pinned model.');
    const bytes = new Uint8Array(file.bytes);
    let offset = 0;
    for (const part of file.chunks ?? [file]) {
      aborted(currentSignal);
      const received = await readBounded(await get(part.path, currentSignal), part.bytes, currentSignal);
      if (received.length !== part.bytes || await sha256(received) !== part.sha256) throw setupError();
      aborted(currentSignal);
      bytes.set(received, offset); offset += received.length;
    }
    if (offset !== file.bytes || await sha256(bytes) !== file.sha256) throw setupError();
    aborted(currentSignal);
    const type = name.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(name) ? 'text/javascript'
      : name.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    return new Response(bytes, { headers: { 'Content-Type': type, 'Content-Length': String(bytes.length) } });
  }) as typeof fetch;
}
