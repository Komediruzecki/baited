import { CARD_ART_LIMITS, cardArtIdPattern } from '../shared/card-art.js';

export const CLOUD_STORAGE_ORIGIN = 'http://baited.storage';
export const CLOUD_JSON_LIMIT = 16 * 1024 * 1024;
const snapshots = new Set(['state/bait.json', 'state/card-library.json', 'state/card-art/index.json', 'state/card-art/pending.json']);

export class CloudStorageError extends Error {
  constructor(public reason: 'unavailable' | 'conflict' | 'limit' | 'invalid' | 'restart', message: string) {
    super(message);
  }
}

/** Private container outbound binding. Never accepts a public endpoint or falls back to disk. */
export class CloudStorage {
  private versions = new Map<string, string | null>();
  private failed = new Set<string>();
  private chains = new Map<string, Promise<unknown>>();
  constructor(private fetcher: typeof fetch = fetch, private timeoutMs = 10_000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10_000)
      throw new Error('Storage timeout must be between 1 and 10000 milliseconds.');
  }
  private limit(key: string) {
    if (snapshots.has(key)) return CLOUD_JSON_LIMIT;
    if (key.startsWith('art/') && key.endsWith('.png') && cardArtIdPattern.test(key.slice(4, -4)))
      return CARD_ART_LIMITS.outputBytes;
    throw new CloudStorageError('invalid', 'Invalid storage object key.');
  }
  private etag(response: Response) {
    const tag = response.headers.get('etag');
    if (!tag || !/^"[\x21\x23-\x7e]{1,200}"$/.test(tag))
      throw new CloudStorageError('invalid', 'Storage response is missing a valid ETag.');
    return tag;
  }
  private async request<T>(key: string, init: RequestInit, consume: (response: Response) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new CloudStorageError('unavailable', 'Storage request timed out.'));
        }, this.timeoutMs);
      });
      const operation = (async () => {
        const response = await this.fetcher(`${CLOUD_STORAGE_ORIGIN}/${key}`, {
          ...init, redirect: 'error', signal: controller.signal,
        });
        try { return await consume(response); }
        finally { await response.body?.cancel().catch(() => {}); }
      })();
      return await Promise.race([operation, timeout]);
    } catch (error) {
      if (error instanceof CloudStorageError) throw error;
      throw new CloudStorageError('unavailable', 'Storage request failed.');
    } finally { clearTimeout(timer); }
  }
  private status(response: Response) {
    if (response.status === 412) throw new CloudStorageError('conflict', 'Stored data changed. Restart to reload it before saving.');
    if (!response.ok) throw new CloudStorageError('unavailable', 'Storage request was not accepted.');
  }
  async read(key: string): Promise<Uint8Array | undefined> {
    const limit = this.limit(key);
    return this.request(key, { method: 'GET' }, async (response) => {
      if (response.status === 404) {
        // Deleted artwork is a zero-byte CAS tombstone, with no retained image.
        const tag = response.headers.has('etag') ? this.etag(response) : null;
        if (!this.versions.has(key)) this.versions.set(key, tag);
        return undefined;
      }
      this.status(response);
      const tag = this.etag(response);
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit))
        throw new CloudStorageError('limit', 'Stored object exceeds its size limit.');
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > limit) throw new CloudStorageError('limit', 'Stored object exceeds its size limit.');
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      }
      // A later read must not silently refresh a stale snapshot's write precondition.
      if (!this.versions.has(key)) this.versions.set(key, tag);
      return Buffer.concat(chunks, size);
    });
  }
  private mutate<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const task = (this.chains.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      try {
        this.assertWritable(key);
        if (!this.versions.has(key)) await this.read(key);
        return await operation();
      }
      catch (error) {
        // A timeout or lost response can hide a committed write. Never retry a
        // cached snapshot or roll back remote objects after an uncertain outcome.
        this.failed.add(key);
        throw error;
      }
    });
    this.chains.set(key, task);
    return task;
  }
  assertWritable(key: string) {
    this.limit(key);
    // JSON indexes and image objects form one logical store. An uncertain write
    // freezes every mutation, including an upload retried with a fresh UUID.
    if (this.failed.size) throw new CloudStorageError('restart', 'Storage write failed. Restart to reload saved data.');
  }
  get healthy() { return this.failed.size === 0; }
  async write(key: string, bytes: Uint8Array): Promise<void> {
    try {
      this.assertWritable(key);
      if (bytes.byteLength > this.limit(key))
        throw new CloudStorageError('limit', 'Storage object exceeds its size limit.');
      // Capture queued bytes so caller mutation cannot alter the submitted snapshot.
      const body = Buffer.from(bytes);
      await this.mutate(key, async () => {
        const tag = this.versions.get(key);
        await this.request(key, {
          method: 'PUT', body,
          headers: {
            'content-type': key.startsWith('art/') ? 'image/png' : 'application/json',
            ...(tag ? { 'if-match': tag } : { 'if-none-match': '*' }),
          },
        }, async (response) => {
          this.status(response);
          this.versions.set(key, this.etag(response));
        });
      });
    } catch (error) {
      // The caller may already have changed its in-memory state, even when a
      // size check rejects the snapshot before the first network request.
      this.failed.add(key);
      throw error;
    }
  }
  delete(key: string): Promise<void> {
    return this.mutate(key, async () => {
      if (!key.startsWith('art/')) throw new CloudStorageError('invalid', 'Snapshot objects cannot be deleted.');
      const tag = this.versions.get(key);
      // Even a missing object needs a CAS tombstone: an upload whose response
      // timed out may still commit after this read and must be fenced out.
      await this.request(key, { method: 'DELETE', headers: tag ? { 'if-match': tag } : { 'if-none-match': '*' } }, async (response) => {
        if (response.status !== 404) this.status(response);
        this.versions.set(key, this.etag(response));
      });
    });
  }
}
