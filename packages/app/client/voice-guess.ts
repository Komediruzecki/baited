import type { MoonshineLine } from './moonshine';

export const VOICE_GUESS_TTL_MS = 15_000;
export type VoiceGuessContext = { roundId: string; epoch: number; leaseId: string; takeId: string };
export type VoiceGuessDraft = { word: string; context: VoiceGuessContext; expiresAt: number };
export type VoiceGuessSnapshot = { draft: VoiceGuessDraft | null; awaitingWord: boolean; acceptsBareGuess: boolean; expiresAt: number };
export type VoiceGuessResult = { consumed: boolean; submit?: VoiceGuessDraft; prepared?: VoiceGuessDraft; uncertain?: boolean };

// Request the optional public draft without waiting for the bot before scoring.
// Both callbacks must contain their own error handling; scoring is never retried.
export function dispatchVoiceGuess(result: VoiceGuessResult, actions: {
  busy: boolean; share: (draft: VoiceGuessDraft) => Promise<void>; submit: (draft: VoiceGuessDraft) => Promise<void>;
}): boolean {
  if (actions.busy) return false;
  if (result.prepared) void actions.share(result.prepared);
  if (result.submit) void actions.submit(result.submit);
  return true;
}

const key = (context: VoiceGuessContext) => JSON.stringify(context);
const words = (text: string) => text.normalize('NFKC').toLocaleLowerCase('en-US')
  .match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [];
const phrase = (text: string) => words(text).join(' ')
  .replace(/\b(?:i['’]m|im)\b/g, 'i am').replace(/\bi['’]ll\b/g, 'i will');
// Moonshine has transcribed "Baity bot" as "Baity bought" in live play.
// Keep aliases anchored and finite: this is not a general bot/bought replacement.
const wake = /^(?:(?:okay|ok|hey|alright)\s+)?(?:baity\s?(?:bot|bought)|bait bot|baity)\b\s*/;
// The observed baby/Betty aliases only count when immediately followed by
// explicit calling intent. A casual greeting must not shield ordinary speech.
const callSource = '(?:i am calling|i will call|i call|call|calling) the (?:bait|bake)(?:\\s+|$)';
const observedWake = new RegExp(`^(?:hey baby(?: bro)?|hail betty but|ah bait but)\\s+(?=${callSource})`);
const call = new RegExp(`^${callSource}`);
const callPhrases = ['i am calling', 'i will call', 'i call', 'call', 'calling']
  .flatMap(prefix => [`${prefix} the bait`, `${prefix} the bake`]);
const callPrefix = (text: string) => !!text && callPhrases.some(command => command.startsWith(`${text} `));
const guess = /^the bait is ([\p{L}\p{N}]+(?:['’][\p{L}]+)?)$/u;
const unfinishedGuess = /^(?:the|the bait|the bait is)$/;
const guessIntent = /^the bait is(?:\s|$)/;
const oneWord = /^([\p{L}\p{N}]+(?:['’][\p{L}]+)?)$/u;
const simpleGuess = /^(?:it['’]s|it is) ([\p{L}\p{N}]+(?:['’][\p{L}]+)?)$/u;
const hesitationWord = '(?:um|uh|ah|er|hmm|okay|ok|so|well)';
const hesitation = new RegExp(`^${hesitationWord}(?: ${hesitationWord}){0,2}$`);
const hesitationPrefix = new RegExp(`^(?:${hesitationWord} ){1,2}(.+)$`);
const callLead = /^(?:(?:um|uh|ah|er|hmm|okay|ok|so|well|hey|alright) ){1,2}(.+)$/;
const lock = /^(?:lock in|locked in|locking|locking in|i am locking in|i am locked in)$/;
const lockPrefix = /^(?:lock|locked|i|i am|i am locking|i am locked)$/;
const cancel = /^(?:cancel|cancel guess|cancel the bait|never mind)$/;

/** A bounded, local command recognizer. It never sees the secret word. */
export class VoiceGuessSession {
  private context: VoiceGuessContext | null = null;
  private draft: VoiceGuessDraft | null = null;
  private awaitingWord = false;
  private acceptsBareGuess = false;
  private pendingGuessPrefix = '';
  private pendingCallPrefix = '';
  private pendingLockPrefix = '';
  private expiresAt = 0;
  private consumedIds = new Set<string>();

  snapshot(now = Date.now()): VoiceGuessSnapshot {
    this.expire(now);
    return { draft: this.draft, awaitingWord: this.awaitingWord, acceptsBareGuess: this.acceptsBareGuess, expiresAt: this.expiresAt };
  }

  setContext(context: VoiceGuessContext | null) {
    if ((context && key(context)) === (this.context && key(this.context))) return;
    this.context = context;
    this.clear();
    this.consumedIds.clear();
  }

  clear() {
    this.draft = null; this.awaitingWord = false; this.acceptsBareGuess = false;
    this.pendingGuessPrefix = ''; this.pendingCallPrefix = ''; this.pendingLockPrefix = ''; this.expiresAt = 0;
  }

  expire(now: number) {
    if (this.expiresAt && now >= this.expiresAt) this.clear();
  }

  // Timers can fire just before their deadline. Expire the captured deadline,
  // but never let an older callback discard a newer guess. Wake-only expiry
  // has no guess to announce to the streamer.
  expireScheduled(deadline: number, now = Date.now()): boolean {
    if (!deadline || deadline !== this.expiresAt) return false;
    const expiredGuess = !!this.draft || this.acceptsBareGuess;
    this.expire(Math.max(now, deadline));
    return expiredGuess;
  }

  take(now = Date.now()): VoiceGuessDraft | null {
    this.expire(now);
    const draft = this.draft;
    this.clear();
    return draft;
  }

  private remember(id: string) {
    this.consumedIds.add(id);
    if (this.consumedIds.size > 128) this.consumedIds.delete(this.consumedIds.values().next().value!);
  }

  receive(line: Pick<MoonshineLine, 'id' | 'text' | 'isComplete' | 'words'>, now = Date.now()): VoiceGuessResult {
    this.expire(now);
    if (!this.context || !line.isComplete || !line.text.trim()) return { consumed: false };
    if (this.consumedIds.has(line.id)) return { consumed: true };
    const text = phrase(line.text);
    // VAD can finalize punctuation between phrases. It is not a new request
    // and must not cancel or renew an armed continuation.
    if (!text) return { consumed: false };
    // A hesitation is still scoring speech, but is not a guess or a new
    // conversation. It must not draft a filler or extend the command window.
    if (this.acceptsBareGuess && hesitation.test(text)) return { consumed: false };
    const priorDeadline = this.expiresAt;
    let rest = text;
    // Only finite lead-ins immediately followed by this command grammar qualify.
    // Reported, negated and hypothetical speech never become calling intent.
    const lead = callLead.exec(rest);
    if (lead && (call.test(lead[1]) || callPrefix(lead[1]) || wake.test(lead[1]))) rest = lead[1];
    const addressed = wake.exec(rest) ?? observedWake.exec(rest);
    if (addressed) rest = rest.slice(addressed[0].length);
    let continuedCall = false;
    if (this.pendingCallPrefix && !addressed && !call.test(rest) && !cancel.test(rest)) {
      const joined = `${this.pendingCallPrefix} ${rest}`;
      if (call.test(joined) || callPrefix(joined)) { rest = joined; continuedCall = true; }
    }
    if (this.pendingLockPrefix && this.draft && !addressed && !cancel.test(rest)) {
      const joined = `${this.pendingLockPrefix} ${rest}`;
      if (lock.test(joined) || lockPrefix.test(joined)) rest = joined;
    }
    // The streamer can explicitly call the bait without naming Baity first.
    // This still requires an enabled, eligible voice session and a final line.
    const calling = call.test(rest);
    if (addressed && !rest) {
      // Repeating the bot's name does not erase an intent or a prepared guess.
      // A wake alone never gives permission to say a bare target.
      if (!this.awaitingWord && !this.draft) {
        this.awaitingWord = true; this.expiresAt = now + VOICE_GUESS_TTL_MS;
      }
      this.remember(line.id);
      return { consumed: true };
    }
    let handled = false;
    let submit: VoiceGuessDraft | undefined;
    let prepared: VoiceGuessDraft | undefined;
    let uncertain = false;

    if ((this.draft || this.awaitingWord) && cancel.test(rest)) {
      this.clear(); handled = true;
    } else if (this.draft && lockPrefix.test(rest)) {
      this.pendingLockPrefix = rest; handled = true;
    } else if (callPrefix(rest)) {
      this.draft = null; this.awaitingWord = true; this.acceptsBareGuess = false;
      this.pendingCallPrefix = rest; this.pendingGuessPrefix = ''; this.pendingLockPrefix = '';
      if (!continuedCall || !this.expiresAt) this.expiresAt = now + VOICE_GUESS_TTL_MS;
      handled = true;
    } else if (this.awaitingWord && lock.test(rest)) {
      // No draft is ready. Consume the confirmation without losing
      // the retry window or guessing that the command itself was the word.
      this.remember(line.id);
      return { consumed: true, uncertain: true };
    } else if (this.draft && lock.test(rest)) {
      submit = this.take(now) ?? undefined; handled = true;
    } else if (addressed || calling || this.awaitingWord || this.draft) {
      let afterCall = rest.replace(call, '');
      if (calling) this.pendingCallPrefix = '';
      if (calling && (/^(?:now|right now)$/.test(afterCall) || hesitation.test(afterCall))) afterCall = '';
      if (!addressed && (
        this.pendingGuessPrefix === 'the' && /^bait(?:\s|$)/.test(rest) ||
        this.pendingGuessPrefix === 'the bait' && /^is(?:\s|$)/.test(rest)
      )) afterCall = `${this.pendingGuessPrefix} ${rest}`;
      let spokenGuess = afterCall.replace(/ i think$/, '');
      if (this.acceptsBareGuess || calling) {
        const hesitant = hesitationPrefix.exec(spokenGuess);
        if (hesitant && oneWord.test(hesitant[1]) && !hesitation.test(hesitant[1])) spokenGuess = hesitant[1];
      }
      const combined = /^(.*?) (i am locking in|i am locked in|locked in|locking in|lock in|locking)$/.exec(spokenGuess);
      const splitLock = combined ? null : /^(.*?) (i am locking|i am locked|i am|lock|locked|i)$/.exec(spokenGuess);
      const suffix = combined ?? splitLock;
      const stated = guess.exec(spokenGuess) ?? (suffix ? guess.exec(suffix[1]) : null)
        ?? ((this.acceptsBareGuess || calling) && !unfinishedGuess.test(spokenGuess)
          ? oneWord.exec(suffix ? suffix[1] : spokenGuess)
            ?? simpleGuess.exec(suffix ? suffix[1] : spokenGuess) : null);
      if (stated && stated[1].length <= 40) {
        this.draft = { word: stated[1], context: { ...this.context }, expiresAt: now + VOICE_GUESS_TTL_MS };
        prepared = this.draft;
        this.awaitingWord = false; this.acceptsBareGuess = false; this.pendingGuessPrefix = '';
        this.pendingCallPrefix = ''; this.pendingLockPrefix = splitLock?.[2] ?? '';
        this.expiresAt = this.draft.expiresAt; handled = true;
        if (combined) submit = this.take(now) ?? undefined;
      } else if (unfinishedGuess.test(afterCall)) {
        // Moonshine can finalize between any words of "the bait is". Continue
        // only these exact prefixes; intermediate pieces do not extend the TTL.
        this.draft = null; this.awaitingWord = true; this.pendingGuessPrefix = afterCall;
        this.acceptsBareGuess = this.acceptsBareGuess || calling || afterCall === 'the bait is';
        if (addressed || calling || !this.expiresAt) this.expiresAt = now + VOICE_GUESS_TTL_MS;
        handled = true;
      } else if (calling && !afterCall) {
        this.draft = null; this.awaitingWord = true;
        // Calling intent already means the next word is a guess. Requiring
        // another "the bait is" made the recorded bare Banana a normal catch.
        this.pendingGuessPrefix = ''; this.acceptsBareGuess = true;
        if (!continuedCall || !this.expiresAt) this.expiresAt = now + VOICE_GUESS_TTL_MS;
        handled = true;
      } else if (calling || guessIntent.test(afterCall)) {
        // An explicit command with extra/missing wording is still a command,
        // never catch evidence. Ask for a clean repeat without submitting it.
        this.clear(); handled = true; uncertain = true;
      }
    }

    if (!handled) {
      // Ordinary conversation ends a narrow prefix continuation. An addressed
      // but unrecognized new request must not leave an older guess to lock in.
      // Neither case suppresses ordinary scoring.
      if (this.pendingGuessPrefix || this.pendingCallPrefix || this.pendingLockPrefix || this.acceptsBareGuess || addressed) this.clear();
      return { consumed: false };
    }
    this.remember(line.id);
    if (uncertain) {
      this.clear();
      return { consumed: true, uncertain: true };
    }
    if (!line.words.length || line.words.some(word => !Number.isFinite(word.confidence) || word.confidence < .8)) {
      // Defensive for missing/low confidence from a provider. Moonshine 0.1.5
      // reports constant 1, so this gate cannot establish recognition accuracy.
      // Draft review remains available; a combined lock explicitly opts to submit.
      // Retain a bounded retry window without posting/submitting or extending it.
      const retryPrefix = prepared || submit ? '' : this.pendingGuessPrefix;
      const retryBareGuess = !!prepared || !!submit || this.acceptsBareGuess;
      const canRetry = !!prepared || !!submit || this.awaitingWord;
      const deadline = priorDeadline || prepared?.expiresAt || submit?.expiresAt || this.expiresAt;
      this.clear();
      if (canRetry) {
        this.awaitingWord = true; this.acceptsBareGuess = retryBareGuess;
        this.pendingGuessPrefix = retryPrefix; this.expiresAt = deadline;
      }
      return { consumed: true, uncertain: true };
    }
    return { consumed: true, ...(submit ? { submit } : {}), ...(prepared ? { prepared } : {}) };
  }
}
