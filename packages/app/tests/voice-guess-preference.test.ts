import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVoiceGuessPreference, saveVoiceGuessPreference } from '../client/voice-guess-preference';

test('voice opt-in survives reloads, keeps owners separate and remembers turning off', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(readVoiceGuessPreference('twitch:lakeeko', storage), false);
  assert.equal(saveVoiceGuessPreference('twitch:lakeeko', true, storage), true);
  assert.equal(readVoiceGuessPreference('twitch:lakeeko', storage), true);
  assert.equal(readVoiceGuessPreference('twitch:komediruzecki7', storage), false);
  assert.equal(readVoiceGuessPreference('demo:lakeeko', storage), false);
  assert.equal(saveVoiceGuessPreference('twitch:lakeeko', false, storage), true);
  assert.equal(readVoiceGuessPreference('twitch:lakeeko', storage), false);
  assert.deepEqual([...values.values()], ['off']);
});

test('blocked browser storage and an absent owner never enable voice commands', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(readVoiceGuessPreference('twitch:lakeeko', blocked), false);
  assert.equal(saveVoiceGuessPreference('twitch:lakeeko', true, blocked), false);
  assert.equal(readVoiceGuessPreference('', blocked), false);
  assert.equal(saveVoiceGuessPreference('', true, blocked), false);
});
