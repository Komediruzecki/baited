/** Private container egress only. This handler is never routed from the public Worker. */
const JSON_KEYS = new Set(['state/bait.json', 'state/card-library.json', 'state/card-art/index.json', 'state/card-art/pending.json']);
const ART_KEY = /^art\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i;
const JSON_LIMIT = 16 * 1024 * 1024;
const PNG_LIMIT = 2 * 1024 * 1024;

function reply(status: number, etag?: string) {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...(etag ? { ETag: etag } : {}) } });
}
async function readBounded(request: Request, limit: number): Promise<Uint8Array | null> {
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      count += part.value.byteLength;
      if (count > limit) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function storageBridge(request: Request, bucket: R2Bucket, authorized: boolean): Promise<Response> {
  if (!authorized) return reply(403);
  const url = new URL(request.url);
  if (url.origin !== 'http://baited.storage' || url.search || url.hash) return reply(400);
  const key = url.pathname.slice(1);
  const json = JSON_KEYS.has(key);
  if (!json && !ART_KEY.test(key)) return reply(404);
  const objectKey = `v1/${key}`;
  try {
    if (request.method === 'GET') {
      const object = await bucket.get(objectKey);
      if (!object) return reply(404);
      if (object.customMetadata?.deleted === '1') return reply(404, object.httpEtag);
      return new Response(object.body, { headers: {
        ETag: object.httpEtag, 'Content-Length': String(object.size),
        'Content-Type': json ? 'application/json' : 'image/png', 'Cache-Control': 'no-store',
      } });
    }
    if (request.method !== 'PUT' && request.method !== 'DELETE') return reply(405);
    const match = request.headers.get('If-Match');
    const create = request.headers.get('If-None-Match');
    if ((match && create) || (!match && create !== '*') || (match && !/^"[^"\r\n]+"$/.test(match))) return reply(428);
    // Metadata documents are replaced, never deleted. Artwork uses a CAS tombstone:
    // R2 delete() has no conditional-write option. A head()+delete() would race.
    // A create-only tombstone also fences an earlier timed-out PNG PUT that is
    // still running when recovery observes a missing object.
    if (request.method === 'DELETE' && json) return reply(405);
    const body = request.method === 'DELETE' ? new Uint8Array() : await readBounded(request, json ? JSON_LIMIT : PNG_LIMIT);
    if (!body) return reply(413);
    const object = await bucket.put(objectKey, body, {
      onlyIf: match ? { etagMatches: match.slice(1, -1) } : { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: json ? 'application/json' : 'image/png', cacheControl: 'private, no-store' },
      customMetadata: request.method === 'DELETE' ? { deleted: '1' } : {},
    });
    return object ? reply(200, object.httpEtag) : reply(412);
  } catch {
    // Never return object bodies, OAuth state, SDK errors or credentials in diagnostics.
    return reply(503);
  }
}
