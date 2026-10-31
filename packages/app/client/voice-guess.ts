import type { MoonshineLine } from './moonshine';

export const VOICE_GUESS_TTL_MS = 15_000;
export type VoiceGuessContext = { roundId: string; epoch: number; leaseId: string; takeId: string };
export type VoiceGuessDraft = { word: string; context: VoiceGuessContext; expiresAt: number };
export type VoiceGuessSnapshot = { draft: VoiceGuessDraft | null; awaitingWord: boolean; expiresAt: number };
export type VoiceGuessResult = { consumed: boolean; submit?: VoiceGuessDraft; prepared?: VoiceGuessDraft; uncertain?: boolean; confirmSeparately?: boolean };

const key = (context: VoiceGuessContext) => JSON.stringify(context);
const words = (text: string) => text.normalize('NFKC').toLocaleLowerCase('en-US')
  .match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [];
const phrase = (text: string) => words(text).join(' ').replace(/i['’]m/g, 'i am');
const wake = /^(?:(?:okay|ok|hey|alright)\s+)?(?:baity bot|bait bot|baitybot|baity)\b\s*/;
const call = /^(?:i am calling the bait|i call the bait|call the bait)(?:\s+|$)/;
const guess = /^the bait is ([\p{L}\p{N}]+(?:['’][\p{L}]+)?)$/u;
const unfinishedGuess = /^(?:the|the bait|the bait is)$/;
const guessIntent = /^the bait is(?:\s|$)/;
const oneWord = /^([\p{L}\p{N}]+(?:['’][\p{L}]+)?)$/u;
const lock = /^(?:lock in|locked in|locking|locking in|i am locking in|i am locked in)$/;
const cancel = /^(?:cancel|cancel guess|cancel the bait|never mind)$/;

/** A bounded, local command recognizer. It never sees the secret word. */
export class VoiceGuessSession {
  private context: VoiceGuessContext | null = null;
  private draft: VoiceGuessDraft | null = null;
  private awaitingWord = false;
  private pendingGuessPrefix = '';
  private expiresAt = 0;
  private consumedIds = new Set<string>();

  snapshot(now = Date.now()): VoiceGuessSnapshot {
    this.expire(now);
    return { draft: this.draft, awaitingWord: this.awaitingWord, expiresAt: this.expiresAt };
  }

  setContext(context: VoiceGuessContext | null) {
    if ((context && key(context)) === (this.context && key(this.context))) return;
    this.context = context;
    this.clear();
    this.consumedIds.clear();
  }

  clear() { this.draft = null; this.awaitingWord = false; this.pendingGuessPrefix = ''; this.expiresAt = 0; }

  expire(now: number) {
    if (this.expiresAt && now >= this.expiresAt) this.clear();
  }

  take(now = Date.now()): VoiceGuessDraft | null {
    this.expire(now);
    const draft = this.draft;
    this.clear();
    return draft;
  }

  receive(line: Pick<MoonshineLine, 'id' | 'text' | 'isComplete' | 'words'>, now = Date.now()): VoiceGuessResult {
    this.expire(now);
    if (!this.context || !line.isComplete || !line.text.trim()) return { consumed: false };
    if (this.consumedIds.has(line.id)) return { consumed: true };
    const text = phrase(line.text);
    let rest = text;
    const addressed = wake.exec(rest);
    if (addressed) rest = rest.slice(addressed[0].length);
    let handled = false;
    let submit: VoiceGuessDraft | undefined;
    let prepared: VoiceGuessDraft | undefined;
    let confirmSeparately = false;
    let uncertain = false;

    if ((this.draft || this.awaitingWord) && cancel.test(rest)) {
      this.clear(); handled = true;
    } else if (this.draft && lock.test(rest)) {
      submit = this.take(now) ?? undefined; handled = true;
    } else if (addressed || this.awaitingWord || this.draft) {
      let afterCall = rest.replace(call, '');
      if (!addressed && (
        this.pendingGuessPrefix === 'the' && /^bait(?:\s|$)/.test(rest) ||
        this.pendingGuessPrefix === 'the bait' && /^is(?:\s|$)/.test(rest)
      )) afterCall = `${this.pendingGuessPrefix} ${rest}`;
      const spokenGuess = afterCall.replace(/ i think$/, '');
      const combined = /^(.*?) (?:i am locking in|i am locked in|locked in|locking in|lock in|locking)$/.exec(spokenGuess);
      const stated = guess.exec(spokenGuess) ?? (combined ? guess.exec(combined[1]) : null)
        ?? (this.pendingGuessPrefix === 'the bait is' ? oneWord.exec(rest) : null);
      if (stated && stated[1].length <= 40) {
        this.draft = { word: stated[1], context: { ...this.context }, expiresAt: now + VOICE_GUESS_TTL_MS };
        prepared = this.draft;
        this.awaitingWord = false; this.pendingGuessPrefix = ''; this.expiresAt = this.draft.expiresAt; handled = true;
        confirmSeparately = !!combined;
      } else if (unfinishedGuess.test(afterCall)) {
        // Moonshine can finalize between any words of "the bait is". Continue
        // only these exact prefixes; intermediate pieces do not extend the TTL.
        this.draft = null; this.awaitingWord = true; this.pendingGuessPrefix = afterCall;
        if (addressed || !this.expiresAt) this.expiresAt = now + VOICE_GUESS_TTL_MS;
        handled = true;
      } else if (addressed && (!rest || call.test(rest) && !afterCall)) {
        this.draft = null; this.awaitingWord = true; this.pendingGuessPrefix = '';
        this.expiresAt = now + VOICE_GUESS_TTL_MS; handled = true;
      } else if (this.awaitingWord && call.test(rest) && !afterCall) {
        handled = true;
      } else if (call.test(rest) || guessIntent.test(afterCall)) {
        // An addressed command with extra/missing wording is still a command,
        // never catch evidence. Ask for a clean repeat without submitting it.
        this.clear(); handled = true; uncertain = true;
      }
    }

    if (!handled) {
      // Ordinary conversation ends a narrow prefix continuation. An addressed
      // but unrecognized new request must not leave an older guess to lock in.
      // Neither case suppresses ordinary scoring.
      if (this.pendingGuessPrefix || addressed) this.clear();
      return { consumed: false };
    }
    this.consumedIds.add(line.id);
    if (this.consumedIds.size > 128) this.consumedIds.delete(this.consumedIds.values().next().value!);
    if (uncertain || !line.words.length || line.words.some(word => !Number.isFinite(word.confidence) || word.confidence < .8)) {
      this.clear();
      return { consumed: true, uncertain: true };
    }
    return { consumed: true, ...(submit ? { submit } : {}), ...(prepared ? { prepared } : {}),
      ...(confirmSeparately ? { confirmSeparately: true } : {}) };
  }
}
