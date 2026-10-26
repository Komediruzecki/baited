import React, { useState } from 'react';
import { CardArt, proofWords, type ProofWord } from './CardArt';
import { SoundControls } from './SoundControls';
import './card-proofs.css';

/* Extend Hook Line's physical card stock and bomb-derived pixel art. The selected
   card leads; named selectors let the owner inspect the actual game illustrations.
   This is a fixed example deck. It never reads a running room's hidden target. */
const prompts: Record<ProofWord, string> = {
  banana: 'What goes in your smoothie?',
  penguin: 'Which bird would win a belly-slide race?',
  microwave: 'How do you rescue cold leftovers?',
  dragon: 'What would you put in charge of a castle?',
  volcano: 'Where would you definitely not build a house?',
  monocle: 'What is the smallest possible pair of glasses?',
  pizza: 'What would you order for the whole chat?',
  robot: 'Who should do the chores while you stream?',
  rocket: 'What would you take to the moon?',
  pirate: 'Who keeps burying all this treasure?',
  cactus: 'Which plant absolutely refuses a hug?',
  jellyfish: 'What looks like a swimming lava lamp?',
  telescope: 'How would you get a closer look at Saturn?',
  saxophone: 'What instrument belongs in a smoky jazz club?',
  octopus: 'Who could hold eight controllers at once?',
  boomerang: 'What is the worst thing to throw away?',
  narwhal: 'Which sea creature borrowed a unicorn’s horn?',
  parachute: 'What would you double-check before jumping?',
};

export default function CardProofs() {
  const [word, setWord] = useState<ProofWord>('banana');
  const [revealed, setRevealed] = useState(false);
  const choose = (next: ProofWord) => { setWord(next); setRevealed(false); };
  return <main className="proof-page">
    <header className="proof-header">
      <a href="http://127.0.0.1:3319/" className="proof-wordmark" aria-label="BAIT landing preview">bait!</a>
      <nav aria-label="Preview navigation"><a href="/">Studio</a><a href="/speech-lab">Speech test</a></nav>
      <span>Local proofs</span>
    </header>
    <section className="proof-stage" aria-labelledby="proof-title">
      <div className="proof-copy">
        <p className="proof-caption">Eighteen ways to get caught.</p>
        <h1 id="proof-title">Pick your<br />{' '}bait.</h1>
        <p className="proof-description">From a smoothie to a space launch, every conversation has a trap. Choose a card, then try the reveal.</p>
        <label className="proof-mobile-picker">Pick a card
          <select aria-label="Pick a card" value={word} onChange={(event) => choose(event.target.value as ProofWord)}>
            {proofWords.map((item, index) => <option key={item} value={item}>{String(index + 1).padStart(2, '0')} · {item}</option>)}
          </select>
        </label>
        <fieldset className="proof-selector">
          <legend>Card proofs</legend>
          {proofWords.map((item, index) => <button key={item} type="button" aria-pressed={word === item}
            onClick={() => choose(item)}><span>{String(index + 1).padStart(2, '0')}</span>{item}</button>)}
        </fieldset>
        <p className="proof-note">These illustrations also appear in the viewer room when their word is dealt. The prompts here are staged examples.</p>
      </div>
      <div className={`proof-card-stage ${revealed ? 'is-revealed' : ''}`}>
        <article className="proof-card" aria-label={`${word} card proof`}>
          <header><span>{revealed ? 'THE REVEAL' : 'CHAT’S SECRET'}</span><b>bait!</b></header>
          <CardArt word={word} />
          <h2>{word}<span>{revealed ? '!' : '.'}</span></h2>
          <div className="proof-card-rule" />
          <p>{prompts[word]}</p>
          <footer><span>{revealed ? 'THEY SAID IT.' : 'MAKE THEM SAY IT.'}</span><span>● ● ●</span></footer>
        </article>
        <button className="proof-reveal" type="button" onClick={() => setRevealed(!revealed)}>
          {revealed ? 'Reset the card' : 'Try the reveal'}<span aria-hidden="true">↗</span>
        </button>
        <p className="proof-reveal-status" aria-live="polite">{revealed ? `“${word}.” Chat wins this staged example.` : 'Example only. No microphone is listening.'}</p>
      </div>
    </section>
    <section className="proof-sound-section" aria-labelledby="sound-proof-title">
      <div><h2 id="sound-proof-title">Hear the catch.</h2><p>Sound Lab effects from Keys, connected to BAIT’s round events. Enable sound to audition them.</p></div>
      <SoundControls roomId="card-proof-lab" lab />
    </section>
    <footer className="proof-footer"><span>BAIT / CARD PROOFS</span><a href="/speech-lab">Test Moonshine in this browser ↗</a><span>Review before deployment</span></footer>
  </main>;
}
