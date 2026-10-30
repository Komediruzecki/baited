import type { MoonshineLine } from './moonshine';
import type { GameView } from '../shared/types';

export function canPreviewTranscript(hostname: string, mode: GameView['mode']) {
  // The invited cloud pilot keeps the same opt-in display as local testing.
  // This does not grant access to the hidden card or change speech transport.
  return mode === 'demo' || ['localhost', '127.0.0.1', '[::1]', '::1', 'pilot-baited.maff.app'].includes(hostname);
}

export const TRANSCRIPT_PREVIEW_LIMIT = 12;
export const TRANSCRIPT_PREVIEW_TEXT_LIMIT = 2000;
export interface TranscriptPreviewLine {
  id: string;
  text: string;
  receivedAt: number;
  truncated: boolean;
}

/** An opt-in, per-tab display buffer. It never writes or sends transcript text. */
export class TranscriptPreviewBuffer {
  private enabled = false;
  private lines: TranscriptPreviewLine[] = [];

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    return this.clear();
  }

  clear(): TranscriptPreviewLine[] {
    this.lines = [];
    return this.lines;
  }

  receive(line: MoonshineLine, segment: string, receivedAt = Date.now()) {
    if (!this.enabled || !line.isComplete || !line.text.trim()) return null;
    const entry: TranscriptPreviewLine = {
      id: `${segment}:${line.id}`,
      text: line.text.slice(0, TRANSCRIPT_PREVIEW_TEXT_LIMIT),
      receivedAt,
      truncated: line.text.length > TRANSCRIPT_PREVIEW_TEXT_LIMIT,
    };
    const existing = this.lines.findIndex((item) => item.id === entry.id);
    this.lines = existing < 0
      ? [...this.lines, entry].slice(-TRANSCRIPT_PREVIEW_LIMIT)
      : this.lines.map((item, index) => index === existing ? entry : item);
    return this.lines;
  }
}
