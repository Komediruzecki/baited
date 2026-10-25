import React, { useEffect, useId, useState } from 'react';
import type { GameView } from '../shared/types';
import { request } from './api';
import { Eye } from './icons';
import { Button } from './ui';

export function canRevealSoloTarget(_hostname: string, mode: GameView['mode']) {
  // A live Twitch studio can also run on localhost. Only demo rounds may reveal.
  return mode === 'demo';
}

export function currentSoloTarget(view: GameView, roomId: string, roundId: string) {
  if (view.id !== roomId || view.round?.id !== roundId ||
      !['active', 'paused', 'settling'].includes(view.phase)) return null;
  return view.round.target || null;
}

// The studio mounts a fresh control for each round and removes it on disconnect.
// Fetch the existing public viewer view only after an explicit reveal.
export function SoloTarget({ roomId, roundId, phase }: {
  roomId: string; roundId: string; phase: GameView['phase'];
}) {
  const [revealed, setRevealed] = useState(false);
  const [word, setWord] = useState<string | null>(null);
  const [error, setError] = useState('');
  const targetId = useId();

  useEffect(() => {
    if (!revealed) return;
    let cancelled = false;
    void request<GameView>(`/api/rooms/${encodeURIComponent(roomId)}/viewer`)
      .then((view) => {
        if (cancelled) return;
        const target = currentSoloTarget(view, roomId, roundId);
        if (target) setWord(target);
        else setError('That round has ended. Reveal the next word when it starts.');
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the word. Hide it, then try again.');
      });
    return () => { cancelled = true; };
  }, [revealed, roomId, roundId]);

  return (
    <div className="solo-target">
      <span className="small-label">SOLO TEST</span>
      <p>{!revealed ? 'Reveal the word to check your microphone.'
        : phase === 'paused' ? 'Resume the round to test this word.'
        : phase === 'settling' ? 'Checking speech from before the buzzer.'
        : 'Say this word to check your microphone.'}</p>
      {revealed && (
        <div id={targetId} className="solo-target-result" role="status">
          {word ? <><span>Current target</span><strong>{word}</strong></> : <span>{error || 'Loading target…'}</span>}
        </div>
      )}
      <Button type="button" className="secondary" aria-expanded={revealed}
        aria-controls={revealed ? targetId : undefined}
        onClick={() => { setWord(null); setError(''); setRevealed(!revealed); }}>
        <Eye size={16} /> {revealed ? 'Hide target' : 'Reveal target'}
      </Button>
      <small>Hidden again next round. Keep this out of your stream capture.</small>
    </div>
  );
}
