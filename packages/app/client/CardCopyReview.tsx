import React, { useState } from 'react';
import content from '../shared/card-localizations.json';
import { exactClues, reviewDeck, type ReviewEntry } from './card-lab-model';
import './card-copy-review.css';

// Extends the Card Lab's violet table and charcoal reading surface. One card at
// a time keeps the question, restrictions and preserved text easy to compare.
export type CopyLocale = 'en' | 'hr';
export const cardCopyLabels = content.labels;
type CardCopy = (typeof content.cards)['ghost'];
const cards: Record<string, CardCopy> = content.cards;

export function CardCopyReview({ word, onWord, renderCard }: {
  word: string;
  onWord: (word: string) => void;
  renderCard: (entry: ReviewEntry, displayWord: string, locale: CopyLocale) => React.ReactNode;
}) {
  const [locale, setLocale] = useState<CopyLocale>(() => new URLSearchParams(location.search).get('language') === 'hr' ? 'hr' : 'en');
  const [query, setQuery] = useState('');
  const [revisedOnly, setRevisedOnly] = useState(false);
  const filtered = reviewDeck.filter(entry => (!revisedOnly || cards[entry.word].audit.decision === 'revised')
    && `${entry.word} ${cards[entry.word].hr.target}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = filtered.find(entry => entry.word === word) ?? filtered[0] ?? reviewDeck[0];
  const copy = cards[selected.word];
  const translated = copy[locale];
  const alternatives = [...new Set([...translated.alternatives, ...(locale === 'en' ? [copy.en.originalQuestion] : [])])].filter(text => text !== translated.question);
  const position = filtered.findIndex(entry => entry.word === selected.word);
  const difficulty = selected.difficulty === 'hard' ? 'hard' : selected.difficulty === 'medium' ? 'medium' : 'easy';
  const preview = { ...selected, clues: translated.clues, example: translated.question };
  const changeLanguage = (next: CopyLocale) => {
    setLocale(next);
    const url = new URL(location.href);
    url.searchParams.set('language', next);
    history.replaceState(null, '', url);
  };
  return <section className="cl-copy" aria-labelledby="cl-copy-heading">
    <header className="cl-copy__heading"><div><h2 id="cl-copy-heading">The words behind the cards</h2><p>Review all {reviewDeck.length} cards, their questions and the originals we kept.</p></div>
      <fieldset className="cl-copy__languages"><legend>Card language</legend>{(['en', 'hr'] as const).map(language => <button key={language} type="button" aria-pressed={locale === language} onClick={() => changeLanguage(language)}>{language === 'en' ? 'English' : 'Hrvatski'}</button>)}</fieldset>
    </header>
    <p className="cl-copy__notice">{locale === 'hr' ? 'Croatian text preview. Live speech detection still uses English. These translations do not change a live game.' : 'These are proposed questions. Existing live questions stay unchanged until the copy is approved.'}</p>
    <div className="cl-copy__tools"><label>Find a card<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ghost / duh" /></label>
      <label>Card<select value={filtered.some(entry => entry.word === selected.word) ? selected.word : ''} onChange={event => onWord(event.target.value)}><option value="" disabled>{filtered.length ? 'Choose a card' : 'No matching cards'}</option>{filtered.map(entry => <option key={entry.word} value={entry.word}>{cards[entry.word][locale].target} · {entry.difficulty}</option>)}</select></label>
      <label className="cl-copy__filter"><input type="checkbox" checked={revisedOnly} onChange={event => setRevisedOnly(event.target.checked)} />Revised questions only</label>
      <span role="status">{filtered.length} cards found</span>
    </div>
    {!filtered.length ? <p className="cl-copy__notice">No cards match this search. Try another word or turn off the revised-only filter.</p> : <div className="cl-copy__body">
      <div className="cl-copy__visual"><div className="cl-copy__card" lang={locale} key={`${selected.word}-${locale}`}>{renderCard(preview, translated.target, locale)}</div>
        <div className="cl-copy__browse"><button type="button" disabled={filtered.length < 2} onClick={() => onWord(filtered[(position + filtered.length - 1) % filtered.length].word)}>Previous</button><span role="status" aria-label={`${translated.target}, ${position + 1} / ${filtered.length}`}>{position + 1} / {filtered.length}</span><button type="button" disabled={filtered.length < 2} onClick={() => onWord(filtered[(position + 1) % filtered.length].word)}>Next</button></div>
      </div>
      <div className="cl-copy__text" lang={locale}>
        <h3>{translated.target}</h3><p className="cl-copy__meta">{cardCopyLabels[locale][difficulty]} · {copy.audit.decision === 'revised' ? (locale === 'hr' ? 'Pitanje je promijenjeno' : 'Question revised') : (locale === 'hr' ? 'Zadržano izvorno pitanje' : 'Original question kept')}</p>
        <section><h4>{locale === 'hr' ? 'Predloženo pitanje' : 'Suggested question'}</h4><p className="cl-copy__question">{translated.question}</p></section>
        <section><h4>{locale === 'hr' ? 'Sačuvana pitanja' : 'Saved alternatives'}</h4>{alternatives.length ? <ul>{alternatives.map(question => <li key={question}>{question}</li>)}</ul> : <p>{locale === 'hr' ? 'Izvorno pitanje ostaje prvi izbor.' : 'The original remains the first choice.'}</p>}</section>
        <section><h4>{locale === 'hr' ? cardCopyLabels.hr.keepOutOfChat : 'Off-limits clues'}</h4><p>{exactClues(preview).length ? exactClues(preview).join(' · ') : cardCopyLabels[locale].onlyThisWord}</p><p className="cl-copy__note">{locale === 'hr' ? 'Sve četiri zabranjene riječi, ovisno o težini:' : 'All four clues for difficulty variants:'} {translated.clues.join(' · ')}</p></section>
        <details><summary>{locale === 'hr' ? 'Izvornik i bilješka pregleda' : 'Original and audit note'}</summary><p lang="en">{copy.en.originalQuestion}</p><p lang="en">{copy.audit.reason}</p>{locale === 'hr' && <p>Oblici za provjeru prepoznavanja: {copy.hr.acceptedSpellings.join(', ') || copy.hr.target}. Još nisu uključeni u prepoznavanje govora.</p>}</details>
      </div>
    </div>}
  </section>;
}
