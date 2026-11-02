import { CARD_ART_MODEL, CARD_ART_POLICY } from '../../app/shared/card-art-policy.js';
import { EDGE_CARD_ART_LIMITS as LIMITS, cardArtIdPattern, type ArtUploadOptions, type CardArtErrorCode,
  type CardArtLibraryView, type CardArtPurpose, type CardArtSource, type CardArtView } from '../../app/shared/card-art.js';
import { sameText } from './control-auth.js';
import { base64url, hmacSha256 } from './sync-hmac.js';

export class EdgeArtError extends Error {
  constructor(public status: number, public code: CardArtErrorCode, message: string) { super(message); }
}
const unreadable = () => new EdgeArtError(422, 'invalid_image', 'This image could not be read. Choose it again so Studio can fit it before upload.');
const missing = () => new EdgeArtError(404, 'art_missing', 'This artwork is no longer available.');

const COLOR_DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
/** Animation, text and EXIF chunks. Studio's canvas export never writes them, and an EXIF block can carry a location. */
const REFUSED_CHUNKS = new Set(['acTL', 'fcTL', 'fdAT', 'tEXt', 'zTXt', 'iTXt', 'eXIf']);
const CRITICAL_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);

/** Checks a fitted PNG's framing, size and dimensions. It does not decode pixels or judge what they show. */
export function pngInfo(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 57 || bytes.length > LIMITS.outputBytes || !signature.every((byte, i) => bytes[i] === byte)) throw unreadable();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8, width = 0, height = 0, data = false, ended = false;
  while (at < bytes.length) {
    if (ended || at + 12 > bytes.length) throw unreadable();
    const length = view.getUint32(at), end = at + 12 + length;
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (end > bytes.length || !/^[A-Za-z]{4}$/.test(type)) throw unreadable();
    if (at === 8) {
      if (type !== 'IHDR' || length !== 13) throw unreadable();
      width = view.getUint32(at + 8); height = view.getUint32(at + 12);
      // Bit depth, colour type, compression, filter and interlace as the PNG spec allows them.
      if (!COLOR_DEPTHS[bytes[at + 17]!]?.includes(bytes[at + 16]!) || bytes[at + 18] !== 0 || bytes[at + 19] !== 0 || bytes[at + 20]! > 1) throw unreadable();
    } else if (type === 'IHDR') throw unreadable();
    // An unknown critical chunk (upper-case first letter) cannot be decoded safely.
    if (REFUSED_CHUNKS.has(type) || ((bytes[at + 4]! & 0x20) === 0 && !CRITICAL_CHUNKS.has(type))) throw unreadable();
    if (type === 'IDAT') data = true;
    if (type === 'IEND') ended = true;
    at = end;
  }
  if (!ended || !data || !width || !height) throw unreadable();
  if (width > LIMITS.outputEdge || height > LIMITS.outputEdge)
    throw new EdgeArtError(422, 'image_dimensions', `Images are saved at up to ${LIMITS.outputEdge} px per side. Choose it again so Studio can fit it.`);
  return { width, height };
}

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
type Row = {
  id: string; owner: string; width: number; height: number; bytes: number; sha256: string; purpose: CardArtPurpose;
  source: CardArtSource; source_id: string | null; created_at: number; policy: string; model: string;
};
const COLUMNS = 'id,owner,width,height,bytes,sha256,purpose,source,source_id,created_at,policy,model';
export type ArtUploads = 'allowed' | 'refused';

/**
 * One channel's images, kept with its room. Studio checks each image on the streamer's device
 * before upload; this store enforces the size caps and the operator's purge, which a modified
 * client cannot skip.
 */
export class RoomArt {
  private key: Uint8Array;
  constructor(private sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS card_art (id TEXT PRIMARY KEY, owner TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
        bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, purpose TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT, source_sha256 TEXT,
        created_at INTEGER NOT NULL, policy TEXT NOT NULL, model TEXT NOT NULL, screen TEXT NOT NULL, body BLOB NOT NULL);
      CREATE INDEX IF NOT EXISTS card_art_owner ON card_art(owner);
      CREATE TABLE IF NOT EXISTS card_art_state (id INTEGER PRIMARY KEY CHECK(id=1), key BLOB NOT NULL, uploads TEXT NOT NULL,
        reason TEXT, updated_at INTEGER NOT NULL);`);
    const saved = sql.exec<{ key: ArrayBuffer }>('SELECT key FROM card_art_state WHERE id=1').toArray()[0];
    this.key = saved ? new Uint8Array(saved.key) : this.rotate('allowed', null, Date.now());
  }
  /** A new key retires every round art URL signed with the old one. */
  private rotate(uploads: ArtUploads, reason: string | null, now: number): Uint8Array {
    const key = crypto.getRandomValues(new Uint8Array(32));
    this.sql.exec(`INSERT INTO card_art_state(id,key,uploads,reason,updated_at) VALUES(1,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET key=excluded.key,uploads=excluded.uploads,reason=excluded.reason,updated_at=excluded.updated_at`,
    key.buffer, uploads, reason, now);
    this.key = key;
    return key;
  }
  private row(id: string): Row | undefined {
    return cardArtIdPattern.test(id) ? this.sql.exec<Row>(`SELECT ${COLUMNS} FROM card_art WHERE id=?`, id).toArray()[0] : undefined;
  }
  private current(row: Row) { return row.policy === CARD_ART_POLICY && row.model === CARD_ART_MODEL; }
  private view(row: Row): CardArtView {
    return { id: row.id, width: row.width, height: row.height, bytes: row.bytes, purpose: row.purpose, source: row.source,
      ...(row.source_id ? { sourceId: row.source_id } : {}), createdAt: row.created_at, url: `/api/studio/card-art/${row.id}.png` };
  }
  private usage(owner?: string) {
    return owner === undefined
      ? this.sql.exec<{ n: number; total: number }>('SELECT count(*) AS n, coalesce(sum(bytes),0) AS total FROM card_art').one()
      : this.sql.exec<{ n: number; total: number }>('SELECT count(*) AS n, coalesce(sum(bytes),0) AS total FROM card_art WHERE owner=?', owner).one();
  }
  uploads(): ArtUploads {
    return this.sql.exec<{ uploads: string }>('SELECT uploads FROM card_art_state WHERE id=1').one().uploads === 'refused' ? 'refused' : 'allowed';
  }
  status() { const { n, total } = this.usage(); return { images: n, bytes: total, uploads: this.uploads() }; }
  canAttach(owner: string, id: string): boolean {
    const row = this.row(id);
    return !!row && row.owner === owner && row.purpose === 'card' && this.current(row);
  }
  list(owner: string): CardArtLibraryView {
    const rows = this.sql.exec<Row>(`SELECT ${COLUMNS} FROM card_art WHERE owner=? ORDER BY created_at,id`, owner).toArray();
    return { art: rows.map((row) => this.view(row)), bytes: rows.reduce((sum, row) => sum + row.bytes, 0), limits: LIMITS };
  }
  async add(owner: string, bytes: Uint8Array, options: ArtUploadOptions, now: number): Promise<CardArtView> {
    const { width, height } = pngInfo(bytes);
    const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
    // Everything below runs without another await, so a purge cannot land between these checks and the insert.
    if (this.uploads() === 'refused')
      throw new EdgeArtError(403, 'art_refused', 'Image uploads are off for this channel. Write to hello@irchiinnuss.com to ask about it.');
    const source = options.sourceId ? this.row(options.sourceId) : undefined;
    if (options.sourceId && (!source || source.owner !== owner || source.purpose !== 'source' || !this.current(source)))
      throw new EdgeArtError(409, 'art_missing', 'Check the original image before saving this version.');
    const usage = this.usage(owner);
    if (usage.n >= LIMITS.assets || usage.total + bytes.length > LIMITS.storedBytes)
      throw new EdgeArtError(507, 'art_quota', 'Your image library is full. Delete images you no longer use, then add this one.');
    const row: Row = { id: crypto.randomUUID(), owner, width, height, bytes: bytes.length, sha256, purpose: options.purpose,
      source: options.source, source_id: source?.id ?? null, created_at: now, policy: CARD_ART_POLICY, model: CARD_ART_MODEL };
    this.sql.exec(`INSERT INTO card_art(${COLUMNS},source_sha256,screen,body) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      row.id, owner, width, height, row.bytes, sha256, row.purpose, row.source, row.source_id, now, row.policy, row.model,
      source?.sha256 ?? null, 'browser', bytes.slice().buffer);
    return this.view(row);
  }
  read(owner: string, id: string): Uint8Array {
    const row = this.row(id);
    if (!row || row.owner !== owner || !this.current(row)) throw missing();
    const body = this.sql.exec<{ body: ArrayBuffer }>('SELECT body FROM card_art WHERE id=?', id).one().body;
    if (body.byteLength !== row.bytes) throw missing();
    return new Uint8Array(body);
  }
  remove(owner: string, id: string, references: ReadonlySet<string>) {
    const row = this.row(id);
    if (!row || row.owner !== owner) throw missing();
    if (references.has(id) || this.sql.exec('SELECT id FROM card_art WHERE source_id=? LIMIT 1', id).toArray().length)
      throw new EdgeArtError(409, 'art_referenced', 'This image is still used by a card, a source edit or a saved round.');
    this.sql.exec('DELETE FROM card_art WHERE id=?', id);
  }
  private signature(room: string, round: string, art: string) {
    return base64url(hmacSha256(this.key, new TextEncoder().encode(`baited-card-art-v1\n${room}\n${round}\n${art}`)));
  }
  /** The URL the Extension accepts: it binds one room, one round and one image, so it cannot be built for another round. */
  path(room: string, round: string, art: string) {
    return `/api/card-art/round/${room}/${round}/${art}/${this.signature(room, round, art)}.png`;
  }
  verify(room: string, round: string, art: string, token: string) {
    return /^[A-Za-z0-9_-]{1,128}$/.test(room) && cardArtIdPattern.test(round) && cardArtIdPattern.test(art) &&
      /^[A-Za-z0-9_-]{43}$/.test(token) && sameText(this.signature(room, round, art), token);
  }
  /** Operator moderation: deletes every image, retires the signed URLs and refuses new uploads. Caller wraps it in a transaction. */
  purge(reason: string, now: number) {
    const { n, total } = this.usage();
    this.sql.exec('DELETE FROM card_art');
    this.rotate('refused', reason, now);
    return { images: n, bytes: total };
  }
  allow(reason: string, now: number) {
    this.sql.exec('UPDATE card_art_state SET uploads=?,reason=?,updated_at=? WHERE id=1', 'allowed', reason, now);
  }
}
