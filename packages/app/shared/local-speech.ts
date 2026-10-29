import { z } from 'zod';
import type { Transcript } from './types.js';

export const finalSchema = z.object({
  type: z.literal('final'), sequence: z.number().int().positive(),
  line: z.object({
    id: z.string().min(1).max(80), text: z.string().min(1).max(2000),
    isComplete: z.literal(true), startTime: z.number().finite().nonnegative(),
    duration: z.number().finite().positive().max(120),
    words: z.array(z.object({ text: z.string().min(1).max(100),
      start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative(),
      confidence: z.number().finite().min(0).max(1),
    })).min(1).max(250),
  }),
}).strict();
export const progressSchema = z.object({ type: z.literal('audio'), samples: z.number().int().positive().max(16000 * 1800) }).strict();

export function localTranscript(data: unknown, binding: { roundId: string; epoch: number; firstAudioAt: number; audioSeconds: number; lastSequence: number }, now = Date.now()): Transcript | null {
  const result = finalSchema.safeParse(data);
  if (!result.success) return null;
  const { line, sequence } = result.data;
  if (sequence !== binding.lastSequence + 1 || !binding.firstAudioAt) return null;
  const end = line.startTime + line.duration;
  if (end > binding.audioSeconds + 0.15 || end < Math.max(0, binding.audioSeconds - 5)) return null;
  if (line.words.some((w) => w.end < w.start || w.start < line.startTime - 0.1 || w.end > end + 0.15 ||
    binding.firstAudioAt + w.end * 1000 > now + 500)) return null;
  return {
    roundId: binding.roundId, epoch: binding.epoch, final: true, id: `moonshine:${line.id}`,
    text: line.text, confidence: Math.min(...line.words.map((w) => w.confidence)),
    capturedAt: binding.firstAudioAt + line.startTime * 1000,
    endedAt: binding.firstAudioAt + end * 1000,
    words: line.words.map((w) => ({ text: w.text, confidence: w.confidence,
      capturedAt: binding.firstAudioAt + w.start * 1000, endedAt: binding.firstAudioAt + w.end * 1000 })),
  };
}
