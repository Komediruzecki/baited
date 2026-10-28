import { CARD_ART_LIMITS, type CardArtUploadResult, type CardArtLibraryView, type CardArtPurpose, type CardArtSource } from '../shared/card-art';

async function request(url: string, options: RequestInit): Promise<Response> {
  try { return await fetch(url, options); }
  catch (cause) {
    if (cause instanceof Error && ['TimeoutError', 'AbortError'].includes(cause.name))
      throw new Error('The image service took too long. Try again; your card edit has not changed.');
    throw new Error('Could not reach the image service. Check your connection and try again.');
  }
}
async function checked<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({ error: 'The image service did not respond. Your card has not changed.' }));
  if (!response.ok) throw new Error(data.error || 'The image could not be saved. Try again.');
  return data;
}
export async function uploadCardArt(blob: Blob, csrf: string, purpose: CardArtPurpose = 'card', source: CardArtSource = 'upload', sourceId?: string): Promise<CardArtUploadResult> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (!blob.size || blob.size > CARD_ART_LIMITS.uploadBytes) throw new Error('Choose an image smaller than 5 MB.');
  return checked(await request('/api/studio/card-art', {
    method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(90_000),
    headers: { 'Content-Type': blob.type, 'x-csrf-token': csrf, 'x-art-purpose': purpose, 'x-art-source': source, ...(sourceId ? { 'x-art-source-id': sourceId } : {}) },
    body: blob,
  }));
}
export async function listCardArt(): Promise<CardArtLibraryView> {
  return checked(await request('/api/studio/card-art', { credentials: 'same-origin', signal: AbortSignal.timeout(15_000) }));
}
export async function deleteCardArt(id: string, csrf: string): Promise<CardArtLibraryView> {
  return checked(await request(`/api/studio/card-art/${encodeURIComponent(id)}`, {
    method: 'DELETE', credentials: 'same-origin', headers: { 'x-csrf-token': csrf }, signal: AbortSignal.timeout(15_000),
  }));
}
