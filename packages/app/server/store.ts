import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SavedGame } from './game.js';
import type { CloudStorage } from './cloud-storage.js';
export interface Credentials {
  access_token: string;
  refresh_token: string;
  expiresAt: number;
  userId: string;
  login: string;
  name: string;
  scope: string[];
}
interface Snapshot {
  version: 1;
  rooms: SavedGame[];
  vault: Record<string, string>;
}
export function seal(value: unknown, key: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
}
export function unseal<T>(value: string, key: string): T {
  const [iv, tag, body] = value.split('.').map((v) => Buffer.from(v, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString());
}
export class Store {
  snapshot: Snapshot = { version: 1, rooms: [], vault: {} };
  private chain = Promise.resolve();
  constructor(
    private dir: string,
    private key: string,
    private cloud?: CloudStorage,
  ) {}
  async load() {
    if (!this.cloud) await mkdir(this.dir, { recursive: true });
    try {
      const bytes = this.cloud ? await this.cloud.read('state/bait.json') : await readFile(join(this.dir, 'bait.json'));
      if (bytes === undefined) return;
      const raw = JSON.parse(Buffer.from(bytes).toString('utf8'));
      if (raw.version !== 1 || !Array.isArray(raw.rooms) || !raw.vault)
        throw new Error('Invalid state file.');
      this.snapshot = raw;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  credentials(id: string) {
    this.cloud?.assertWritable('state/bait.json');
    return this.snapshot.vault[id]
      ? unseal<Credentials>(this.snapshot.vault[id], this.key)
      : undefined;
  }
  setCredentials(id: string, c: Credentials) {
    this.snapshot.vault[id] = seal(c, this.key);
    return this.save();
  }
  deleteCredentials(id: string) {
    delete this.snapshot.vault[id];
    return this.save();
  }
  save() {
    const text = JSON.stringify(this.snapshot, null, 2);
    const task = this.chain
      .catch(() => {})
      .then(async () => {
        if (this.cloud) {
          await this.cloud.write('state/bait.json', Buffer.from(text));
          return;
        }
        const temp = join(this.dir, 'bait.json.tmp');
        await writeFile(temp, text, { mode: 0o600 });
        await rename(temp, join(this.dir, 'bait.json'));
      });
    this.chain = task;
    return task;
  }
  flush() {
    return this.chain;
  }
}
