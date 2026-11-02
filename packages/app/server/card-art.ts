import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { CARD_ART_LIMITS, cardArtIdPattern, type ArtUploadOptions, type CardArtErrorCode, type CardArtLibraryView, type CardArtView } from '../shared/card-art.js';
import { CARD_ART_MODEL, CARD_ART_POLICY, screenArt } from './card-art-policy.js';
import { ArtProcessingError, LocalArtProcessor, type CardArtProcessor } from './card-art-scanner.js';
import { equal } from './security.js';

export class CardArtError extends Error {
  constructor(public status: number, public code: CardArtErrorCode, message: string) { super(message); }
}
const recordSchema = z.object({
  id: z.string().regex(cardArtIdPattern), owner: z.string().min(1).max(128),
  width: z.number().int().min(1).max(CARD_ART_LIMITS.outputEdge),
  height: z.number().int().min(1).max(CARD_ART_LIMITS.outputEdge),
  bytes: z.number().int().min(1).max(CARD_ART_LIMITS.outputBytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  purpose: z.enum(['source', 'card']), source: z.enum(['upload', 'pixel', 'ascii', 'draw']),
  sourceId: z.string().regex(cardArtIdPattern).optional(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  createdAt: z.number().int().positive(), model: z.string(), policy: z.string(),
}).strict();
type ArtRecord = z.infer<typeof recordSchema>;
export { artUploadOptionsSchema, type ArtUploadOptions } from '../shared/card-art.js';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const missing = () => new CardArtError(404, 'art_missing', 'This artwork is no longer available.');

/** Only approved, normalized PNGs reach disk. Original uploads and failed scans stay in memory. */
export class CardArtStore {
  private records = new Map<string, ArtRecord>();
  private ephemeral = new Set<string>();
  private ephemeralBytes = new Map<string, Uint8Array>();
  private chain: Promise<unknown> = Promise.resolve();
  private deleted = new Set<string>();
  private generations = new Map<string, number>();
  private unavailable = new Set<string>();
  private dir: string;
  constructor(dataDir: string, private processor: CardArtProcessor = new LocalArtProcessor()) {
    this.dir = join(dataDir, 'card-art');
  }
  async load() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    try {
      const saved = z.object({ version: z.literal(1), records: z.array(recordSchema) }).strict()
        .parse(JSON.parse(await readFile(join(this.dir, 'index.json'), 'utf8')));
      if (new Set(saved.records.map((entry) => entry.id)).size !== saved.records.length) throw new Error('Duplicate artwork ID.');
      const next = new Map(saved.records.map((entry) => [entry.id, entry]));
      for (const record of next.values()) {
        if (record.sourceId) {
          const source = next.get(record.sourceId);
          if (!source || source.owner !== record.owner || source.purpose !== 'source' || source.sha256 !== record.sourceSha256)
            throw new Error('Invalid artwork source reference.');
        }
      }
      this.records = next;
      for (const record of next.values()) {
        try {
          const info = await lstat(join(this.dir, `${record.id}.png`));
          if (!info.isFile() || info.size !== record.bytes) this.unavailable.add(record.id);
        } catch { this.unavailable.add(record.id); }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  markEphemeral(owner: string) { this.ephemeral.add(owner); }
  activateOwner(owner: string) { this.deleted.delete(owner); }
  canAttach(owner: string, id: string) {
    const record = this.records.get(id);
    return !!record && record.owner === owner && record.purpose === 'card' &&
      record.policy === CARD_ART_POLICY && record.model === CARD_ART_MODEL && !this.deleted.has(owner) && !this.unavailable.has(id);
  }
  private view(record: ArtRecord): CardArtView {
    const { id, width, height, bytes, purpose, source, sourceId, createdAt } = record;
    return { id, width, height, bytes, purpose, source, ...(sourceId ? { sourceId } : {}), createdAt, url: `/api/studio/card-art/${id}.png` };
  }
  list(owner: string): CardArtLibraryView {
    const records = [...this.records.values()].filter((entry) => entry.owner === owner);
    return { art: records.map((entry) => this.view(entry)), bytes: records.reduce((sum, entry) => sum + entry.bytes, 0), limits: CARD_ART_LIMITS };
  }
  private transaction<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.chain.catch(() => {}).then(operation);
    this.chain = task;
    return task;
  }
  async withReferences<T>(owner: string, ids: string[], operation: () => Promise<T>) {
    const generation = this.generations.get(owner) ?? 0;
    return this.transaction(async () => {
      if (this.deleted.has(owner) || generation !== (this.generations.get(owner) ?? 0)) throw missing();
      if (ids.some((id) => !this.canAttach(owner, id)))
        throw new CardArtError(409, 'art_missing', 'Choose artwork that has finished its safety check in your library.');
      return operation();
    });
  }
  private sourceFor(owner: string, sourceId?: string) {
    if (!sourceId) return undefined;
    const source = this.records.get(sourceId);
    if (!source || source.owner !== owner || source.purpose !== 'source' || source.policy !== CARD_ART_POLICY || source.model !== CARD_ART_MODEL || this.unavailable.has(sourceId))
      throw new CardArtError(409, 'art_missing', 'Check the original image before saving this version.');
    return source;
  }
  async upload(owner: string, bytes: Uint8Array, mime: string, options: ArtUploadOptions): Promise<CardArtView> {
    if (this.deleted.has(owner)) throw missing();
    const generation = this.generations.get(owner) ?? 0;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime) || !bytes.byteLength || bytes.byteLength > CARD_ART_LIMITS.uploadBytes)
      throw new CardArtError(422, 'invalid_image', 'Choose a still PNG, JPEG or WebP up to 5 MB.');
    this.sourceFor(owner, options.sourceId);
    let result;
    try { result = await this.processor.process(bytes, mime); }
    catch (error) {
      if (error instanceof ArtProcessingError && error.code === 'image_dimensions')
        throw new CardArtError(422, 'image_dimensions', 'This image has too many pixels. Resize it to 32 megapixels or fewer, with neither side above 8192 pixels, then try again.');
      if (error instanceof ArtProcessingError && error.code === 'invalid_image')
        throw new CardArtError(422, 'invalid_image', 'This image could not be read. Try exporting a still PNG, JPEG or WebP, then choose the new file.');
      if (error instanceof ArtProcessingError && error.code === 'art_busy')
        throw new CardArtError(429, 'art_busy', 'Another image is being checked. Try again in a moment.');
      throw new CardArtError(503, 'scan_unavailable', 'The image check is unavailable. Your artwork is still here; try saving again.');
    }
    const decision = result.model === CARD_ART_MODEL ? screenArt(result.predictions) : 'unavailable';
    if (decision === 'blocked') throw new CardArtError(422, 'blocked_image', 'This image did not pass the sexual-content check. Choose a different image.');
    if (decision === 'uncertain') throw new CardArtError(422, 'uncertain_image', 'The image check could not clear this artwork. Try a different image or use a text card.');
    if (decision !== 'accepted') throw new CardArtError(503, 'scan_unavailable', 'The image check is unavailable. Keep your artwork open and try again.');
    const png = Buffer.from(result.png);
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.length > CARD_ART_LIMITS.outputBytes)
      throw new CardArtError(503, 'scan_unavailable', 'This image could not be prepared. Try again.');
    return this.transaction(async () => {
      if (this.deleted.has(owner) || generation !== (this.generations.get(owner) ?? 0)) throw missing();
      const source = this.sourceFor(owner, options.sourceId), library = this.list(owner);
      if (library.art.length >= CARD_ART_LIMITS.assets || library.bytes + png.length > CARD_ART_LIMITS.storedBytes)
        throw new CardArtError(507, 'art_quota', 'Your artwork library is full. Remove unused images before adding another.');
      const record = recordSchema.parse({
        id: randomUUID(), owner, width: result.width, height: result.height, bytes: png.length,
        sha256: hash(png), purpose: options.purpose, source: options.source,
        ...(source ? { sourceId: source.id, sourceSha256: source.sha256 } : {}),
        createdAt: Date.now(), model: result.model, policy: CARD_ART_POLICY,
      });
      const next = new Map(this.records).set(record.id, record);
      const path = join(this.dir, `${record.id}.png`);
      try {
        if (!this.ephemeral.has(owner)) {
          await writeFile(`${path}.tmp`, png, { mode: 0o600, flag: 'wx' });
          await rename(`${path}.tmp`, path);
        }
        await this.persist(next);
      } catch {
        await Promise.all([rm(path, { force: true }), rm(`${path}.tmp`, { force: true })]).catch(() => {});
        throw new CardArtError(503, 'art_storage', 'The artwork could not be saved. Keep your editor open and try again.');
      }
      if (this.ephemeral.has(owner)) this.ephemeralBytes.set(record.id, png);
      this.records = next;
      return this.view(record);
    });
  }
  async read(owner: string, id: string): Promise<Uint8Array> {
    const record = this.records.get(id);
    if (!record || record.owner !== owner || record.policy !== CARD_ART_POLICY || record.model !== CARD_ART_MODEL || this.deleted.has(owner) || this.unavailable.has(id)) throw missing();
    try {
      const bytes = this.ephemeralBytes.get(id) ?? await readFile(join(this.dir, `${record.id}.png`));
      if (bytes.length !== record.bytes || hash(bytes) !== record.sha256) throw missing();
      return bytes;
    } catch { throw missing(); }
  }
  async remove(owner: string, id: string, references: () => ReadonlySet<string>) {
    await this.transaction(async () => {
      const record = this.records.get(id);
      if (!record || record.owner !== owner) throw missing();
      if (references().has(id) || [...this.records.values()].some((entry) => entry.sourceId === id))
        throw new CardArtError(409, 'art_referenced', 'This image is still used by a card, source edit or saved round.');
      const next = new Map(this.records); next.delete(id);
      // Remove bytes first. If disk deletion fails, the record stays available for
      // a retry; an index-first deletion would strand private bytes forever.
      try {
        await rm(join(this.dir, `${id}.png`), { force: true });
        this.unavailable.add(id);
        await this.persist(next);
      } catch { throw new CardArtError(503, 'art_storage', 'This image could not be removed. Try again.'); }
      this.records = next;
      this.ephemeralBytes.delete(id);
      this.unavailable.delete(id);
    });
  }
  async deleteOwner(owner: string) {
    // Reject a scan already in flight before it can persist after account deletion.
    this.deleted.add(owner);
    this.generations.set(owner, (this.generations.get(owner) ?? 0) + 1);
    await this.transaction(async () => {
      const entries = [...this.records.values()].filter((entry) => entry.owner === owner);
      const next = new Map([...this.records].filter(([, entry]) => entry.owner !== owner));
      try {
        for (const entry of entries) {
          await rm(join(this.dir, `${entry.id}.png`), { force: true });
          this.unavailable.add(entry.id);
        }
        await this.persist(next);
      } catch { throw new CardArtError(503, 'art_storage', 'Your images could not be removed. Sign in again and retry account deletion.'); }
      this.records = next;
      for (const entry of entries) { this.ephemeralBytes.delete(entry.id); this.unavailable.delete(entry.id); }
      this.ephemeral.delete(owner);
    });
  }
  private async persist(records: Map<string, ArtRecord>) {
    const path = join(this.dir, 'index.json');
    const snapshot = { version: 1, records: [...records.values()].filter((entry) => !this.ephemeral.has(entry.owner)) };
    await writeFile(`${path}.tmp`, JSON.stringify(snapshot), { mode: 0o600 });
    await rename(`${path}.tmp`, path);
  }
  async close() { await this.processor.close?.(); await this.chain.catch(() => {}); }
}

/** A capability remains stable across polling and binds one room, one round and exact bytes ID. */
export class CardArtCapabilities {
  private key: Uint8Array;
  constructor(key: string) { this.key = key ? Buffer.from(key, 'hex') : randomBytes(32); }
  private signature(room: string, round: string, art: string) {
    return createHmac('sha256', this.key).update(`baited-card-art-v1\n${room}\n${round}\n${art}`).digest('base64url');
  }
  path(room: string, round: string, art: string) {
    return `/api/card-art/round/${room}/${round}/${art}/${this.signature(room, round, art)}.png`;
  }
  verify(room: string, round: string, art: string, signature: string) {
    return /^[A-Za-z0-9_-]{1,128}$/.test(room) && cardArtIdPattern.test(round) && cardArtIdPattern.test(art) &&
      /^[A-Za-z0-9_-]{43}$/.test(signature) && equal(this.signature(room, round, art), signature);
  }
}
