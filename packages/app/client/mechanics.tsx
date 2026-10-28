import { useState, type CSSProperties } from 'react';
import type { AwardBoard, GameView, Leader, Studio } from '../shared/types';
import { request } from './api';
import { Button } from './ui';
import { Check, Eye, ShieldCheck, Target, Timer, Trophy } from './icons';

function timer(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function MissionStatus({
  game,
  now,
  offset,
  compact = false,
}: {
  game: GameView;
  now: number;
  offset: number;
  compact?: boolean;
}) {
  const mission = game.mission;
  if (!mission) return null;
  const remaining =
    mission.endsAt !== null ? Math.max(0, mission.endsAt - now - offset) : mission.remaining;
  const label = {
    active:
      game.phase === 'settling'
        ? 'CHECKING FINAL WORDS'
        : game.phase === 'paused'
          ? 'MISSION PAUSED'
          : 'THREE-WORD MISSION',
    complete: 'MISSION COMPLETE',
    failed: 'MISSION TIME UP',
    escaped: 'BAIT CALLED',
    ended: 'MISSION ENDED',
  }[mission.status];
  return (
    <section
      className={`mission-strip ${compact ? 'mission-compact' : ''} ${mission.status === 'complete' ? 'mission-complete' : ''}`}
      aria-label={`${label}: ${mission.completed} of 3 words landed`}
    >
      <div className="mission-strip-label">
        <Target size={20} />
        <div>
          <span>{label}</span>
          <strong>{mission.completed} / 3 words landed</strong>
        </div>
      </div>
      <div className="mission-pips" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={i < mission.completed ? 'landed' : ''}>
            {i < mission.completed ? <Check size={17} /> : i + 1}
          </span>
        ))}
      </div>
      <div className="mission-clock">
        <Timer size={17} />
        <strong>{timer(remaining)}</strong>
        <span>SESSION</span>
      </div>
    </section>
  );
}

export function GuessForm({
  game,
  csrf,
  offline,
  onReceive,
  onClose,
}: {
  game: GameView;
  csrf: string;
  offline: boolean;
  onReceive: (studio: Studio) => void;
  onClose: () => void;
}) {
  const [word, setWord] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const round = game.round,
    available = game.phase === 'active' && round?.guessEnabled && !round.guessUsed;
  return (
    <form
      className="guess-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!round || !available || busy || offline) return;
        setBusy(true);
        setError('');
        try {
          const reply = await request<{ correct: boolean; bonus: number; studio: Studio }>(
            '/api/studio/guess',
            { roundId: round.id, epoch: round.epoch, word },
            csrf,
          );
          onReceive(reply.studio);
          setWord('');
          onClose();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Guess the secret word without saying it aloud. Get it right and you escape
        {game.mission ? ' the mission' : ''}. Get it wrong and chat gets 15 extra seconds.
      </p>
      <label>
        Your one-word guess
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          required
          maxLength={80}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          disabled={!available || busy || offline}
        />
      </label>
      <div className="notice">
        <ShieldCheck size={20} />
        <p>
          One guess per word. Only the outcome is shared. An incorrect guess is never saved or shown
          to chat.
        </p>
      </div>
      {!available && (
        <p role="status">
          {round?.guessUsed
            ? 'Your guess for this word has been used.'
            : 'A round must be live to submit a guess.'}
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <Button type="button" className="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="primary"
          disabled={!available || busy || offline || !word.trim()}
        >
          {busy ? 'Checking…' : 'Submit private guess'}
        </Button>
      </div>
    </form>
  );
}

export function AwardReview({
  board,
  csrf,
  offline,
  onReceive,
  onError,
}: {
  board: AwardBoard;
  csrf: string;
  offline: boolean;
  onReceive: (studio: Studio) => void;
  onError: (message: string) => void;
}) {
  const [flagged, setFlagged] = useState(false),
    [busy, setBusy] = useState('');
  const eligible = board.candidates.filter((hint) => hint.eligible),
    blocked = board.candidates.filter((hint) => !hint.eligible),
    list = flagged ? blocked : eligible;
  const selected = board.candidates.find((hint) => hint.id === board.selectedHintId);
  return (
    <section className="panel award-review" id="award-review">
      <div className="section-heading">
        <div>
          <span className="small-label">STREAMER’S PICK · {board.word.toUpperCase()}</span>
          <h3>You baited me.</h3>
        </div>
        <Trophy size={24} />
      </div>
      <p>Pick the hint that got you. The community win stays shared.</p>
      <div className="hint-filter" role="group" aria-label="Hint eligibility">
        <button aria-pressed={!flagged} onClick={() => setFlagged(false)}>
          Eligible ({eligible.length})
        </button>
        <button aria-pressed={flagged} onClick={() => setFlagged(true)}>
          Flagged ({blocked.length})
        </button>
      </div>
      <ul className="hint-list">
        {list.map((hint) => (
          <li key={hint.id} className={hint.id === board.selectedHintId ? 'hint-picked' : ''}>
            <div>
              <strong>@{hint.name}</strong>
              <p>{hint.text}</p>
              {hint.reason && <span className="hint-rule-flag">{hint.reason}</span>}
            </div>
            {hint.eligible ? (
              <Button
                className={hint.id === board.selectedHintId ? 'primary' : 'secondary'}
                disabled={!!busy || offline}
                onClick={async () => {
                  setBusy(hint.id);
                  try {
                    onReceive(
                      await request<Studio>(
                        '/api/studio/award',
                        { roundId: board.roundId, hintId: hint.id },
                        csrf,
                      ),
                    );
                  } catch (error) {
                    onError((error as Error).message);
                  } finally {
                    setBusy('');
                  }
                }}
              >
                {hint.id === board.selectedHintId ? (
                  <>
                    <Check size={17} />
                    Picked
                  </>
                ) : busy === hint.id ? (
                  'Saving…'
                ) : (
                  'Pick hint'
                )}
              </Button>
            ) : (
              <span className="hint-ineligible">Ineligible</span>
            )}
          </li>
        ))}
      </ul>
      {!list.length && (
        <p className="hint-empty">
          {flagged
            ? 'No flagged hints in the retained set.'
            : 'No eligible hints were received. Chat still keeps the win.'}
        </p>
      )}
      {flagged && (
        <p className="hint-note">
          Only the violating hint is ineligible. That chatter’s later clean hints can still receive
          the award.
        </p>
      )}
      <p className="hint-selection" role="status">
        {selected
          ? `Streamer’s pick: @${selected.name}. Choose another hint to move the award.`
          : 'No award selected. You can leave it unassigned.'}
      </p>
      <p className="hint-note">
        Your pick plays “Baited by @name” on the OBS overlay for six seconds and counts toward
        the Bait MVPs board. Only the name is shown, never the hint.
      </p>
      <p className="hint-note">
        Review keeps up to 40 clean hints and 20 flagged hints, with limits per chatter. Text clears
        ten minutes after the round. baited does not delete Twitch messages.
      </p>
    </section>
  );
}

/** `rulesOnly` explains the rules under a card that already prints its clues. */
export function ForbiddenClueCard({ game, rulesOnly = false }: { game: GameView; rulesOnly?: boolean }) {
  if (!['active', 'paused'].includes(game.phase) || !game.round) return null;
  const clues = game.round.forbiddenClues ?? [];
  return (
    <section className={rulesOnly ? 'clue-card clue-card--rules' : 'clue-card'} aria-label="Clue rules">
      {!rulesOnly && <div>
        <Eye size={19} />
        <h3>{clues.length ? 'Keep out of chat' : 'Only the word is off limits.'}</h3>
        <span>{game.round.difficulty}</span>
      </div>}
      {!rulesOnly && clues.length > 0 && (
        <ul className="clue-chips">
          {clues.map((clue) => (
            <li key={clue}>{clue}</li>
          ))}
        </ul>
      )}
      <p>
        {clues.length
          ? 'A hint with one of these, plurals and disguised spellings included, can’t win the streamer’s pick.'
          : 'Use any clue, but keep the secret word out of chat.'}{' '}
        The round carries on for everyone.
      </p>
      {game.violations > 0 && (
        <p className="clue-flags" role="status">
          {game.violations} hint{game.violations === 1 ? '' : 's'} flagged this word.
        </p>
      )}
    </section>
  );
}

export function PublicAward({ award }: { award?: { name: string } }) {
  if (!award) return null;
  return (
    <div className="public-award">
      <Trophy size={22} />
      <div>
        <span>YOU BAITED ME</span>
        <strong>@{award.name}</strong>
        <small>Streamer’s pick</small>
      </div>
    </div>
  );
}

/** How long the OBS sting plays after the streamer picks a hint. */
export const STING_MS = 6000;
// Pixel confetti in the landing's celebration colours, thrown out and up from the name
// and falling back on a step clock.
const confetti = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * Math.PI * 2 + (i % 2 ? 0.16 : -0.12);
  const reach = 170 + ((i * 47) % 130);
  return {
    '--x': `${Math.round(Math.cos(angle) * reach)}px`,
    '--y': `${Math.round(Math.sin(angle) * reach * 0.6) - 48}px`,
    '--r': `${(i % 3) * 90}deg`,
    '--d': `${(i % 5) * 50}ms`,
    '--c': ['#fffdf7', '#c9a8ff', '#fffdf7', '#9146ff'][i % 4],
  } as CSSProperties;
});

/** OBS: the streamer's pick lands as a sting. The name only, never the hint. */
export function BaitedSting({ name, age }: { name: string; age: number }) {
  const size = name.length > 18 ? 'is-longest' : name.length > 12 ? 'is-long' : '';
  return (
    <div className="baited-sting" style={{ '--sting-age': `${-Math.max(0, age)}ms` } as CSSProperties}>
      <span className="baited-sting__confetti" aria-hidden="true">
        {confetti.map((style, i) => (
          <i key={i} style={style} />
        ))}
      </span>
      <span className="baited-sting__kicker">BAITED BY</span>
      <strong className={`baited-sting__name ${size}`.trim()}>@{name}</strong>
      <span className="baited-sting__note">STREAMER’S PICK · BAIT MVP</span>
    </div>
  );
}

/** The streamer's picks, most first: a podium for the top three, then the runners-up. */
export function MvpBoard({ mvps }: { mvps: Leader[] }) {
  const picks = (n: number) => `${n} ${n === 1 ? 'pick' : 'picks'}`;
  return (
    <section className="panel mvp-board">
      <div className="section-heading">
        <h3>Bait MVPs</h3>
        <Trophy size={19} />
      </div>
      <p className="muted">
        Chatters whose hints you picked under “You baited me”, most picks first. Chat sees the
        top three with <code>!bait top</code>.
      </p>
      {mvps.length ? (
        <>
          <ol className="mvp-podium">
            {mvps.slice(0, 3).map((mvp, i) => (
              <li key={mvp.name} className={`mvp-step mvp-step--${i + 1}`}>
                <strong>@{mvp.name}</strong>
                <span>{picks(mvp.baits)}</span>
                <b aria-hidden="true">{i + 1}</b>
              </li>
            ))}
          </ol>
          {mvps.slice(3).map((mvp, i) => (
            <div className="leader-row" key={mvp.name}>
              <span>{String(i + 4).padStart(2, '0')}</span>
              <strong>@{mvp.name}</strong>
              <span className="leader-credit">{picks(mvp.baits)}</span>
            </div>
          ))}
        </>
      ) : (
        <div className="empty-history">
          <Trophy />
          <p>No bait MVPs yet. After a win, pick the hint that got you under “You baited me”.</p>
        </div>
      )}
    </section>
  );
}
