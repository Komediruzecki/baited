type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const key = (owner: string) => `baited.voice-guesses.v1.${encodeURIComponent(owner)}`;

// Remember only the owner's opt-in, never transcripts, guesses or microphone permission.
export function readVoiceGuessPreference(owner: string, storage?: PreferenceStorage): boolean {
  if (!owner) return false;
  try { return (storage ?? globalThis.localStorage).getItem(key(owner)) === 'on'; }
  catch { return false; }
}

export function saveVoiceGuessPreference(owner: string, enabled: boolean, storage?: PreferenceStorage): boolean {
  if (!owner) return false;
  try {
    (storage ?? globalThis.localStorage).setItem(key(owner), enabled ? 'on' : 'off');
    return true;
  } catch { return false; }
}
