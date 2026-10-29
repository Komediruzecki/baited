import type { AuthIdentity } from './auth.js';

export const MAX_APPROVED_ART_BYTES = 1024 * 1024;

/** Server-approved records only. No client may submit one through this API. */
export interface ApprovedArt {
  artId: string;
  objectKey: string;
  channelId: string;
  ownerSubject: string;
  sha256: string;
  byteLength: number;
  policyVersion: string;
  approved: true;
}

export interface ApprovedArtObject {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

/** Deliberately get-only: production has no listing, upload or approval endpoint. */
export interface ApprovedArtBucket {
  get(key: string): Promise<ApprovedArtObject | null>;
}

export type AuthorizeArt = (identity: AuthIdentity, artId: string) => Promise<ApprovedArt | null>;

function hidden(): Response {
  return new Response('Not found.', {
    status: 404,
    headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  });
}

function validGrant(grant: ApprovedArt, identity: AuthIdentity, artId: string): boolean {
  return grant.approved === true && grant.artId === artId && grant.channelId === identity.channelId &&
    /^[a-f0-9]{64}$/.test(grant.sha256) && /^[A-Za-z0-9._-]{1,64}$/.test(grant.policyVersion) &&
    grant.objectKey === `approved/${grant.channelId}/${grant.sha256}.png` &&
    Number.isSafeInteger(grant.byteLength) && grant.byteLength >= 33 && grant.byteLength <= MAX_APPROVED_ART_BYTES &&
    typeof grant.ownerSubject === 'string' && /^[A-Za-z0-9:_-]{1,128}$/.test(grant.ownerSubject) &&
    (identity.role === 'viewer' || (identity.role === 'studio' && identity.subject === grant.ownerSubject));
}

function sameGrant(before: ApprovedArt, after: ApprovedArt): boolean {
  return before.artId === after.artId && before.objectKey === after.objectKey && before.sha256 === after.sha256 &&
    before.channelId === after.channelId && before.ownerSubject === after.ownerSubject &&
    before.policyVersion === after.policyVersion && before.byteLength === after.byteLength && after.approved === true;
}

function pngHeader(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((byte, i) => bytes[i] === byte)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // This checks normalized PNG framing, not image safety. Approval comes from the
  // separately trusted scanner; this read path cannot create that approval.
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return false;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 16_777_216;
}

async function boundedBytes(body: ReadableStream<Uint8Array>, expected: number): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const bytes = new Uint8Array(expected);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return length === expected ? bytes : null;
      if (length + value.byteLength > expected || length + value.byteLength > MAX_APPROVED_ART_BYTES) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * The room callback must check generation/revocation and either current-round
 * viewer access or explicit owner access. It runs again after the object read to
 * close the expiry/round-change window. It must not grant Studio the active card.
 */
export async function serveApprovedArt(
  request: Request,
  identity: AuthIdentity,
  artId: string,
  bucket: ApprovedArtBucket | undefined,
  authorize: AuthorizeArt,
  options: { nowMs?: number } = {},
): Promise<Response> {
  const now = () => options.nowMs ?? Date.now();
  if (!bucket || !['GET', 'HEAD'].includes(request.method) || !/^[A-Za-z0-9_-]{1,96}$/.test(artId) ||
      !identity.stableIdentity || identity.role === 'overlay' || !Number.isFinite(now()) || now() < 0 || !Number.isFinite(identity.expiresAt) ||
      identity.expiresAt <= now()) return hidden();
  try {
    const authorized = await authorize(identity, artId);
    if (!authorized || !validGrant(authorized, identity, artId)) return hidden();
    const grant = { ...authorized };
    const object = await bucket.get(grant.objectKey);
    const metadata = object?.customMetadata;
    if (!object || object.size !== grant.byteLength || object.httpMetadata?.contentType !== 'image/png' ||
        metadata?.approval !== 'approved' || metadata.sha256 !== grant.sha256 ||
        metadata.policyVersion !== grant.policyVersion || metadata.channelId !== grant.channelId ||
        metadata.ownerSubject !== grant.ownerSubject) return hidden();
    const bytes = await boundedBytes(object.body, grant.byteLength);
    if (!bytes || !pngHeader(bytes)) return hidden();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hex = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
    if (hex !== grant.sha256 || identity.expiresAt <= now()) return hidden();
    const stillAuthorized = await authorize(identity, artId);
    if (!stillAuthorized || !validGrant(stillAuthorized, identity, artId) || !sameGrant(grant, stillAuthorized) ||
        identity.expiresAt <= now()) return hidden();
    return new Response(request.method === 'HEAD' ? null : bytes, {
      headers: {
        'content-type': 'image/png',
        'content-length': String(bytes.byteLength),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin',
        'vary': 'Origin, Authorization',
      },
    });
  } catch {
    // Failures are indistinguishable from missing/unapproved art. Do not reveal
    // object keys, hashes, owners, approval decisions or storage error messages.
    return hidden();
  }
}
