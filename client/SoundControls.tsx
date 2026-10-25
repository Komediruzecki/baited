import React, { useEffect, useRef, useState } from 'react';
import type { GameView } from '../shared/types';
import { createBaitSound, SOUND_CUES, SOUND_LABELS, type BaitSound, type SoundState } from './sound-lab';
import './sound-controls.css';

export function SoundControls({ roomId, game, offline = false, lab = false }: {
  roomId: string; game?: GameView; offline?: boolean; lab?: boolean;
}) {
  const control = useRef<BaitSound | null>(null);
  const current = useRef(game); current.current = game;
  const [state, setState] = useState<SoundState>({ enabled: false, volume: .35, error: '' });
  const [played, setPlayed] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const audio = createBaitSound({ roomId, onState: setState });
    control.current = audio;
    if (current.current) audio.receive(current.current);
    const hidden = () => { if (document.visibilityState === 'hidden') audio.disable(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); audio.dispose(); control.current = null; };
  }, [roomId]);
  useEffect(() => { if (game) control.current?.receive(game); }, [game]);
  useEffect(() => { if (offline) control.current?.disable(); }, [offline]);
  useEffect(() => {
    if (!game || game.phase !== 'active' || !game.round?.endsAt || offline) return;
    const offset = game.serverTime - Date.now();
    const tick = () => control.current?.tick(Math.max(0, Math.ceil((game.round!.endsAt! - Date.now() - offset) / 1000)));
    tick(); const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [game?.phase, game?.round?.id, game?.round?.endsAt, offline]);
  const toggle = async () => {
    if (state.enabled) { control.current?.disable(); setPlayed(''); return; }
    setBusy(true);
    try { await control.current?.enable(); } finally { setBusy(false); }
  };
  return <div className={`bait-sound-controls ${lab ? 'is-lab' : ''}`}>
    <div className="sound-main-row">
      <button type="button" aria-pressed={state.enabled} onClick={() => void toggle()} disabled={busy || offline}>
        {busy ? 'Enabling sound…' : state.enabled ? 'Mute sound' : 'Enable sound'}
      </button>
      <label>Volume <input aria-label="Effect volume" type="range" min="0" max="100" step="5"
        value={Math.round(state.volume * 100)} onChange={(e) => control.current?.setVolume(Number(e.target.value) / 100)} />
        <output>{Math.round(state.volume * 100)}%</output></label>
    </div>
    {lab && <div className="sound-cue-list">{SOUND_CUES.map((cue) =>
      <button type="button" key={cue} disabled={!state.enabled} onClick={() => {
        if (control.current?.preview(cue)) setPlayed(SOUND_LABELS[cue]);
      }}>{SOUND_LABELS[cue]}</button>)}<button type="button" disabled={!state.enabled}
        onClick={() => { control.current?.stop(); setPlayed('Stopped'); }}>Stop effects</button></div>}
    <p className="sound-controls-note">{lab ? 'Audition only. These buttons do not score a round.' : 'Studio audio only. Capture this browser’s audio in OBS. The overlay stays silent.'} Sound starts off each visit.</p>
    <p className="sound-controls-status" aria-live="polite">{state.error || (state.enabled ? played || 'Sound enabled' : 'Sound off')}</p>
  </div>;
}
