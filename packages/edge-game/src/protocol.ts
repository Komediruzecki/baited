import { z } from 'zod';
import { settingsSchema } from '@baited/game-core';

export const PROTOCOL_VERSION = 1;
export const LIMITS = { commandBytes: 8192, pendingOperations: 32, sockets: 64, socketsPerSubject: 4, receipts: 4096,
  receiptMs: 600_000, stateBytes: 1_048_576, stateRows: 30_000, maxTransitions: 128 } as const;
const round = { roundId: z.string().uuid(), epoch: z.number().int().positive() };
const id = z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/);
const input = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('restart-take'), takeId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('reset-chaos-session'), sessionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('connect') }).strict(),
  z.object({ type: z.literal('disconnect') }).strict(),
  z.object({ type: z.literal('microphone'), armed: z.boolean(), leaseId: z.string().uuid(), socketId: z.string().uuid().optional(), renew: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal('skip'), ...round }).strict(),
  z.object({ type: z.literal('pause'), ...round }).strict(),
  z.object({ type: z.literal('resume'), ...round }).strict(),
  z.object({ type: z.literal('end'), ...round }).strict(),
  z.object({ type: z.literal('catch'), roundId: z.string().uuid(), decision: z.enum(['confirm', 'reject']) }).strict(),
  z.object({ type: z.literal('reverse'), roundId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('award'), roundId: z.string().uuid(), hintId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('guess'), ...round, text: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal('voice-guess-draft'), ...round, text: z.string().min(1).max(80), draftId: z.string().uuid(), expiresAt:z.number().int().positive() }).strict(),
  z.object({ type: z.literal('settings'), settings: settingsSchema }).strict(),
  // Only signed synthetic POC capabilities can inject these events. This is not the live speech adapter.
  z.object({ type: z.literal('fixture-transcript'), ...round, text: z.string().min(1).max(500) }).strict(),
  z.object({ type: z.literal('fixture-chat'), ...round, text: z.string().min(1).max(500) }).strict(),
  z.object({ type: z.literal('revoke-connections') }).strict(),
]);
export const commandSchema = z.object({ id, generation: z.number().int().positive(),
  expectedRevision: z.number().int().nonnegative(), action: input }).strict();
export type Command = z.infer<typeof commandSchema>;
export interface Receipt { ok: boolean; revision: number; generation: number; code?: string }
export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
}
export async function readBounded(request: Request, max: number = LIMITS.commandBytes): Promise<string> {
  if (Number(request.headers.get('content-length')) > max) throw new Error('body_size');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new Error('body_size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
}
export async function fingerprint(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
