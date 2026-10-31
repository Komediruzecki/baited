import React, { useState } from 'react';
import type { GameView } from '../shared/types';
import { Button } from './ui';

export const CHAOS_RULE = 'At 3+ chat wins in a row, a correct guess has a 1 in 4 chance to give chat the win. At most once per session.';

export function BaityChaosRule({ game, compact = false }: { game: GameView; compact?: boolean }) {
  if (!game.round?.baityChaos || !game.round.guessEnabled || !['active', 'paused', 'settling'].includes(game.phase)) return null;
  return <p className={`baity-chaos-rule${compact ? ' baity-chaos-rule--compact' : ''}`}>
    <strong>Baity chaos is on.</strong>{' '}
    {game.chaosSession?.used
      ? 'Baity already used this session’s intervention. A correct guess wins.'
      : compact ? '1 in 4 on a correct guess at 3+ chat streak. Once per session.' : CHAOS_RULE}
  </p>;
}

export function BaityChaosSettings({ enabled, callBait, session, locked, busy, onChange, onReset }: {
  enabled: boolean;
  callBait: boolean;
  session?: GameView['chaosSession'];
  locked: boolean;
  busy: boolean;
  onChange: (enabled: boolean) => void;
  onReset: () => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const reset = async () => {
    if (locked || busy || resetting || !session?.used) return;
    setResetting(true); setMessage(''); setError('');
    try { await onReset(); setMessage('Baity can intervene once again. Scores are unchanged.'); }
    catch (error) { setError((error as Error).message || 'Could not reset the allowance. Try again.'); }
    finally { setResetting(false); }
  };
  return <section className="baity-chaos-settings" aria-label="Baity chaos settings">
    <label className="toggle-row">
      <span><strong>Baity chaos</strong><small>{CHAOS_RULE} Off by default. Applies from the next word.</small></span>
      <input type="checkbox" role="switch" checked={enabled} disabled={busy || resetting} onChange={event => onChange(event.target.checked)} />
    </label>
    {enabled && !callBait && <p className="muted baity-chaos-settings__hint">Turn on Call the bait for this rule to take effect.</p>}
    {enabled && session && <div className="baity-chaos-session">
      <div><strong>{session.used ? 'Intervention used' : 'One intervention available'}</strong>
        <p>{locked ? 'Finish the round and any catch review before resetting.' : 'Reset between rounds to let Baity intervene again. Scores stay as they are.'}</p></div>
      <Button type="button" className="secondary" disabled={locked || busy || resetting || !session.used} onClick={() => void reset()}>
        {resetting ? 'Resetting…' : 'Reset chaos allowance'}
      </Button>
    </div>}
    {message && <p className="baity-chaos-feedback" role="status">{message}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </section>;
}
