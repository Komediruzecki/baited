import React from 'react';
import type { VoiceGuessSnapshot } from './voice-guess';
import { Button } from './ui';
import './voice-guess.css';

export function VoiceGuessControl({ enabled, ready, pending, seconds, busy, message, announcement, onToggle,
  onLock, onCancel }: {
  enabled: boolean; ready: boolean; pending: VoiceGuessSnapshot; seconds: number; busy: boolean;
  message: string; announcement: string; onToggle: () => void; onLock: () => void; onCancel: () => void;
}) {
  return <section className="voice-guess" aria-label="Voice guesses">
    <button type="button" role="switch" aria-checked={enabled} className="voice-guess__toggle"
      disabled={busy} onClick={onToggle}>
      <span>Voice guesses</span>
      <span className="desk-pixel-switch" aria-hidden="true"><span /></span>
    </button>
    {!enabled && <p className="voice-guess__off">Voice guesses are off. Type your guess, or switch this on before saying it. Saying the word can still give chat a win.</p>}
    {enabled && <div className="voice-guess__body">
      <p>Say <q>I’m calling the bait, fish, lock in.</q> Use your guess in place of <q>fish.</q> No pauses needed. Leave off <q>lock in</q> to check the draft first.</p>
      <small>With Baity connected and announcements on, your draft can appear in chat. Voice guesses still work without the bot. Your stream hears your voice.</small>
      {!ready && !busy && <p className="voice-guess__status" role="status">Ready during a live round with your microphone on and Call the bait available.</p>}
      {pending.awaitingWord && <>
        <p className="voice-guess__status" role="status">{pending.acceptsBareGuess
          ? <>Listening for your guess · {seconds}s</>
          : <>Say <q>I’m calling the bait</q> before your word. · {seconds}s</>}</p>
        <div className="voice-guess__actions">
          <Button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel guess</Button>
        </div>
      </>}
      {pending.draft && <div className="voice-guess__draft">
        <div className="voice-guess__word" role="status"><span>Your guess</span><strong>{pending.draft.word}</strong></div>
        <small>Say <q>lock in</q> within {seconds}s. To change it, say <q>I’m calling the bait</q> again with the new word. Say <q>cancel</q> to drop this guess.</small>
        {announcement && <small role="status">{announcement}</small>}
        <div className="voice-guess__actions">
          <Button type="button" className="primary" disabled={!ready || busy} onClick={onLock}>Lock in</Button>
          <Button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel guess</Button>
        </div>
        <small>Cancel stops lock-in, not a chat post already requested.</small>
      </div>}
      {busy && <p className="voice-guess__status" role="status">Checking your guess…</p>}
    </div>}
    {message && <p className="voice-guess__status" role="status">{message}</p>}
  </section>;
}
