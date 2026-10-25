import { cards, checkHint } from './data.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const phone = matchMedia('(max-width: 700px)');
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function icon(name, className = 'icon') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#${name}`);
  svg.append(use);
  return svg;
}
function cardFace(card, interactive = false) {
  const face = node(interactive ? 'button' : 'article', 'bait-card');
  if (interactive) {
    face.type = 'button';
    face.setAttribute(
      'aria-label',
      `${card.word.toUpperCase()}, ${card.difficulty}. Inspect this card.`,
    );
  } else face.setAttribute('aria-label', `${card.word.toUpperCase()} practice card`);
  const top = node('span', 'card-top');
  const number = node('span', '', String(card.index + 1).padStart(2, '0'));
  number.append(node('small', '', '/ 18'));
  const pips = node('span', 'card-pips');
  pips.setAttribute('aria-label', card.difficulty);
  const level = { easy: 1, medium: 2, hard: 3 }[card.difficulty];
  for (let n = 0; n < 3; n++) pips.append(node('i', n < level ? 'is-filled' : ''));
  top.append(number, pips, icon('bait-hook', 'card-hook'));
  const art = node('span', 'card-art');
  const image = document.createElement('img');
  image.width = image.height = 1254;
  image.alt = '';
  image.draggable = false;
  image.decoding = 'async';
  image.loading = 'lazy';
  image.dataset.src = card.art;
  if (!interactive) image.src = card.art;
  art.append(image);
  const word = node('span', 'card-word', card.word.toUpperCase());
  const clues = node('span', 'card-clues');
  clues.setAttribute('aria-label', card.clues.length ? 'Off-limits clues' : 'No off-limits clues');
  for (const clue of card.clues) {
    const chip = node('span', '', clue.toUpperCase());
    chip.dataset.clue = clue;
    clues.append(chip);
  }
  if (!card.clues.length)
    clues.append(node('span', 'no-clues', 'Easy: only the word itself is off limits.'));
  const footer = node('span', 'card-footer', 'Bait them.');
  footer.append(node('b', '', 'bait!'));
  face.append(top, art, word, clues, node('span', 'card-question', card.question), footer);
  return face;
}

const hand = $('deck-hand');
const list = $('deck-cards');
const deckItems = cards.map((card) => {
  const item = node('li', 'deck-card-item');
  const button = cardFace(card, true);
  button.tabIndex = -1;
  item.append(button);
  list.append(item);
  return item;
});
let current = 0;
let inspected = false;
let auto = !reduced.matches;
let inView = false;
let hovered = false;
let deckHasFocus = false;
let windowActive = true;
let drag = null;
let suppressClickUntil = 0;
let advanceTimer;
let deckApproached = false;
const artPromises = new WeakMap();
const wrap = (number) => ((number % cards.length) + cards.length) % cards.length;

function relativeIndex(index) {
  let diff = wrap(index - current);
  if (diff > cards.length / 2) diff -= cards.length;
  return diff;
}
function updateFanVisibility(item, index) {
  const distance = Math.abs(relativeIndex(index));
  const pending = !item.querySelector('img').dataset.ready;
  item.classList.toggle('is-hidden', distance > 3);
  item.classList.toggle('is-pending', distance <= 3 && pending);
  item.setAttribute('aria-hidden', String(distance > 3 || pending));
  item.firstElementChild.tabIndex = distance === 0 && !pending ? 0 : -1;
}
function ensureArt(item, index) {
  const image = item.querySelector('img');
  if (artPromises.has(image)) return artPromises.get(image);
  image.loading = 'eager';
  image.src = image.dataset.src;
  const ready = image
    .decode()
    .catch(() => {
      if (image.complete && image.naturalWidth > 0) return;
      const art = image.parentElement;
      art.classList.add('is-unavailable');
      art.append(node('span', 'art-unavailable', 'Artwork unavailable'));
    })
    .then(() => {
      image.dataset.ready = 'true';
      updateFanVisibility(item, index);
      scheduleAdvance();
    });
  artPromises.set(image, ready);
  return ready;
}
function warmFan() {
  deckItems.forEach((item, index) => {
    if (Math.abs(relativeIndex(index)) <= 3) ensureArt(item, index);
  });
}
function setAuto(active) {
  auto = active;
  $('deck-auto').setAttribute('aria-pressed', String(auto));
  $('deck-auto').querySelector('span').textContent = auto ? 'Pause gallery' : 'Play gallery';
  $('deck-auto-icon').setAttribute('href', auto ? '#i-pause' : '#i-play');
  scheduleAdvance();
}
function scheduleAdvance() {
  clearTimeout(advanceTimer);
  // Reduced motion starts paused. Pressing Play gallery is an explicit opt-in;
  // CSS still removes all animated transitions for that visitor.
  if (
    !auto ||
    !inView ||
    hovered ||
    deckHasFocus ||
    inspected ||
    document.hidden ||
    !windowActive ||
    !deckItems[current].querySelector('img').dataset.ready ||
    drag
  )
    return;
  advanceTimer = setTimeout(() => {
    selectCard(current + 1);
    scheduleAdvance();
  }, 6500);
}
function selectCard(index, manual = false) {
  current = wrap(index);
  inspected = false;
  if (manual) {
    deckApproached = true;
    setAuto(false);
  }
  const spacing = phone.matches ? (innerWidth < 350 ? 158 : 175) : Math.min(220, innerWidth * 0.14);
  deckItems.forEach((item, i) => {
    const diff = relativeIndex(i);
    const distance = Math.abs(diff);
    item.style.setProperty('--offset', `${diff * spacing}px`);
    item.style.setProperty(
      '--angle',
      `${Math.sign(diff) * (distance === 1 ? 8 : 15 + Math.max(0, distance - 2) * 4)}deg`,
    );
    item.style.setProperty(
      '--down',
      `${distance === 0 ? 0 : distance === 1 ? 24 : 64 + (distance - 2) * 15}px`,
    );
    item.style.setProperty('--scale', String(distance === 0 ? 1 : distance === 1 ? 0.86 : 0.74));
    item.style.setProperty('--z', String(20 - distance));
    item.style.setProperty('--opacity', distance > 3 ? '0' : distance === 3 ? '.55' : '1');
    item.classList.remove('is-inspected');
    const button = item.firstElementChild;
    button.setAttribute(
      'aria-label',
      `${cards[i].word.toUpperCase()}, ${cards[i].difficulty}. Inspect this card.`,
    );
    button.setAttribute('aria-pressed', String(distance === 0));
    // All seven visible positions need art. Hide each card until its art decodes,
    // rather than exposing an empty +/-3 card while only five images are loaded.
    updateFanVisibility(item, i);
  });
  if (deckApproached) warmFan();
  const card = cards[current];
  $('deck-count').textContent = `${String(current + 1).padStart(2, '0')} / 18`;
  $('deck-word').textContent = card.word.toUpperCase();
  $('deck-difficulty').textContent = card.clues.length
    ? `${card.difficulty.toUpperCase()} · OFF LIMITS: ${card.clues.join(', ').toUpperCase()}`
    : 'EASY · ONLY THE WORD ITSELF IS OFF LIMITS';
  $('deck-question').textContent = `Try: “${card.question}”`;
  scheduleAdvance();
}
function inspectCard(active = !inspected) {
  inspected = active;
  if (inspected) setAuto(false);
  deckItems[current].classList.toggle('is-inspected', inspected);
  deckItems[current].firstElementChild.setAttribute(
    'aria-label',
    `${cards[current].word.toUpperCase()}, ${cards[current].difficulty}. ${inspected ? 'Put this card back.' : 'Inspect this card.'}`,
  );
  scheduleAdvance();
}
deckItems.forEach((item, index) =>
  item.firstElementChild.addEventListener('click', () => {
    if (performance.now() < suppressClickUntil) return;
    if (index === current) inspectCard();
    else selectCard(index, true);
  }),
);
$('deck-prev').addEventListener('click', () => selectCard(current - 1, true));
$('deck-next').addEventListener('click', () => selectCard(current + 1, true));
$('deck-auto').addEventListener('click', () => {
  if (!auto && inspected) inspectCard(false);
  setAuto(!auto);
});
hand.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    selectCard(current + (event.key === 'ArrowLeft' ? -1 : 1), true);
    hand.focus({ preventScroll: true });
  } else if ((event.key === 'Enter' || event.key === ' ') && event.target === hand) {
    event.preventDefault();
    inspectCard();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    inspectCard(false);
    hand.focus({ preventScroll: true });
  }
});
hand.addEventListener('pointerenter', (event) => {
  if (event.pointerType !== 'touch') {
    hovered = true;
    scheduleAdvance();
  }
});
hand.addEventListener('pointerleave', () => {
  hovered = false;
  deckItems[current].style.removeProperty('--tilt-x');
  deckItems[current].style.removeProperty('--tilt-y');
  scheduleAdvance();
});
hand.addEventListener('focusin', () => {
  deckHasFocus = true;
  scheduleAdvance();
});
hand.addEventListener('focusout', (event) => {
  if (!hand.contains(event.relatedTarget)) {
    deckHasFocus = false;
    scheduleAdvance();
  }
});
hand.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary || drag) return;
  drag = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    time: performance.now(),
    velocity: 0,
    active: false,
  };
  scheduleAdvance();
});
hand.addEventListener('pointermove', (event) => {
  if (drag && drag.id === event.pointerId) {
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      finishDrag(event.pointerId, { cancelled: true, suppressClick: true });
      return;
    }
    if (!drag.active && Math.abs(dx) > 10) {
      drag.active = true;
      try {
        hand.setPointerCapture(event.pointerId);
      } catch {
        finishDrag(event.pointerId, { cancelled: true });
        return;
      }
      setAuto(false);
      inspectCard(false);
    }
    if (!drag || drag.id !== event.pointerId) return;
    const now = performance.now();
    drag.velocity = (event.clientX - drag.x) / Math.max(1, now - drag.time);
    drag.x = event.clientX;
    drag.time = now;
    if (drag.active) {
      event.preventDefault();
      // The hand follows the drag; release predicts a finite deceleration distance.
      deckItems.forEach((item, i) => {
        const base =
          relativeIndex(i) *
          (phone.matches ? (innerWidth < 350 ? 158 : 175) : Math.min(220, innerWidth * 0.14));
        item.style.setProperty('--offset', `${base + dx * 0.45}px`);
      });
    }
  } else if (inspected && event.pointerType === 'mouse' && !reduced.matches) {
    const item = deckItems[current];
    const bounds = item.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1));
    item.style.setProperty('--tilt-x', `${-y * 8}deg`);
    item.style.setProperty('--tilt-y', `${x * 8}deg`);
    item.style.setProperty('--shine-x', `${(x + 1) * 50}%`);
    item.style.setProperty('--shine-y', `${(y + 1) * 50}%`);
  }
});
function finishDrag(pointerId, { cancelled = false, clientX, suppressClick = false } = {}) {
  if (!drag || drag.id !== pointerId) return;
  const previous = drag;
  // Clear first: releasing our capture can dispatch lostpointercapture.
  drag = null;
  if (hand.hasPointerCapture(pointerId)) hand.releasePointerCapture(pointerId);
  if (previous.active || suppressClick) suppressClickUntil = performance.now() + 250;
  if (previous.active) {
    const dx = (Number.isFinite(clientX) ? clientX : previous.x) - previous.startX;
    const freshVelocity = performance.now() - previous.time < 80 ? previous.velocity : 0;
    const coast = Math.sign(freshVelocity) * Math.min(360, (freshVelocity * freshVelocity) / 0.008);
    const moved = cancelled
      ? 0
      : Math.max(-3, Math.min(3, Math.round((dx + coast) / (phone.matches ? 150 : 200))));
    selectCard(current - moved, true);
  }
  scheduleAdvance();
}
function cancelActiveDrag() {
  if (drag) finishDrag(drag.id, { cancelled: true });
  else scheduleAdvance();
}
// Listen at window capture phase so an uncaptured press released outside the
// hand still ends its gesture, even if another control stops event bubbling.
window.addEventListener(
  'pointerup',
  (event) => finishDrag(event.pointerId, { clientX: event.clientX }),
  true,
);
window.addEventListener(
  'pointercancel',
  (event) => finishDrag(event.pointerId, { cancelled: true }),
  true,
);
hand.addEventListener('lostpointercapture', (event) => {
  // A touch may transfer its implicit capture from the card button to the hand.
  // That child's bubbling loss must not cancel the hand's new capture.
  if (event.target === hand && !hand.hasPointerCapture(event.pointerId)) {
    finishDrag(event.pointerId, { cancelled: true });
  }
});
window.addEventListener('blur', () => {
  windowActive = false;
  cancelActiveDrag();
});
window.addEventListener('focus', () => {
  windowActive = true;
  scheduleAdvance();
});
window.addEventListener('pagehide', cancelActiveDrag);
new IntersectionObserver(
  (entries) => {
    inView = entries[0].isIntersecting && entries[0].intersectionRatio > 0.35;
    scheduleAdvance();
  },
  { threshold: [0, 0.35, 1] },
).observe(hand);
// Prepare the hand shortly before it is reached. Eager decoding is scoped to
// these seven cards so their large original PNGs do not compete with the hero.
const deckApproachObserver = new IntersectionObserver(
  (entries) => {
    if (!entries[0].isIntersecting) return;
    deckApproached = true;
    warmFan();
    deckApproachObserver.disconnect();
  },
  { rootMargin: '800px 0px' },
);
deckApproachObserver.observe(hand);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelActiveDrag();
  else scheduleAdvance();
});
phone.addEventListener('change', () => selectCard(current));
let deckWidth = innerWidth;
window.addEventListener('resize', () => {
  // Mobile browser bars change height while scrolling; that must not put an inspected card back.
  if (innerWidth !== deckWidth) {
    deckWidth = innerWidth;
    selectCard(current);
  }
});
reduced.addEventListener('change', () => {
  if (reduced.matches) setAuto(false);
  selectCard(current);
});
setAuto(auto);
selectCard(0);

let toyCard = cards[0];
let dealTimer;
function showCard(card, move = false) {
  toyCard = card;
  const slot = $('toy-card');
  slot.replaceChildren(cardFace(card));
  slot.classList.remove('is-dealt');
  if (!reduced.matches) requestAnimationFrame(() => slot.classList.add('is-dealt'));
  $('toy-for').textContent = `${card.word.toUpperCase()} · ${card.difficulty.toUpperCase()}`;
  $('hint-input').value = '';
  $('hint-counter').textContent = '0 / 200';
  $('hint-feedback').textContent =
    card.difficulty === 'easy' ? 'Easy: only the word itself is off limits.' : '';
  $('hint-feedback').removeAttribute('data-kind');
  $('hint-log').replaceChildren();
  const empty = node('p', 'log-empty', 'Waiting for your first hint…');
  empty.id = 'log-empty';
  const dots = node('span', 'waiting-dots');
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) dots.append(node('i'));
  empty.prepend(dots);
  $('hint-log').append(empty);
  if (move) {
    $('your-turn').scrollIntoView({
      behavior: reduced.matches ? 'instant' : 'smooth',
      block: 'start',
    });
    clearTimeout(dealTimer);
    dealTimer = setTimeout(
      () => $('hint-input').focus({ preventScroll: true }),
      reduced.matches ? 0 : 550,
    );
  }
}
function randomCard() {
  const pool = cards.filter((card) => card.difficulty !== 'easy' && card !== toyCard);
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return pool[random[0] % pool.length];
}
function feedback() {
  const input = $('hint-input');
  const result = checkHint(input.value, toyCard);
  $('hint-counter').textContent = `${input.value.length} / 200`;
  $('hint-feedback').textContent =
    input.value.trim() && result.kind !== 'clean' ? result.message : '';
  $('hint-feedback').dataset.kind = result.kind;
  document
    .querySelectorAll('#toy-card [data-clue]')
    .forEach((chip) => chip.classList.toggle('is-violation', result.clue === chip.dataset.clue));
  return result;
}
$('hint-input').addEventListener('input', feedback);
$('hint-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('hint-input').value.trim();
  if (!text) {
    $('hint-input').focus();
    return;
  }
  const result = checkHint($('hint-input').value, toyCard);
  $('hint-feedback').textContent = result.message;
  $('hint-feedback').dataset.kind = result.kind;
  if (result.kind === 'long') return;
  $('log-empty')?.remove();
  const line = node('p', `hint-entry${result.kind === 'clean' ? ' is-clean' : ''}`);
  line.append(node('strong', '', 'you'), node('span', 'hint-text', text));
  if (result.kind === 'clean') line.append(icon('bait-hook', 'hint-mark'));
  else line.append(node('small', '', "Not eligible for the streamer's pick."));
  $('hint-log').append(line);
  while ($('hint-log').children.length > 12) $('hint-log').firstElementChild.remove();
  $('hint-log').scrollTop = $('hint-log').scrollHeight;
  $('hint-input').value = '';
  $('hint-counter').textContent = '0 / 200';
  $('hint-input').focus();
});
$('borrow-question').addEventListener('click', () => {
  $('hint-input').value = toyCard.question;
  feedback();
  $('hint-input').focus();
});
$('deal-another').addEventListener('click', () => {
  showCard(randomCard());
  $('hint-input').focus({ preventScroll: true });
});
$('bait-with-card').addEventListener('click', () => showCard(cards[current], true));
$('deal-first').addEventListener('click', (event) => {
  event.preventDefault();
  const card = randomCard();
  document.querySelector('.peek-word').textContent = card.word.toUpperCase();
  document.querySelector('.hero').classList.add('is-dealing');
  clearTimeout(dealTimer);
  dealTimer = setTimeout(
    () => {
      document.querySelector('.hero').classList.remove('is-dealing');
      showCard(card, true);
    },
    reduced.matches ? 0 : 300,
  );
});
showCard(cards[0]);

const how = $('how');
const roleSteps = [...document.querySelectorAll('.role-step')];
let scrollPending = false;
function updateScreens() {
  scrollPending = false;
  const bounds = how.getBoundingClientRect();
  const pinned = innerWidth > 1050 && !reduced.matches;
  const progress = pinned
    ? Math.max(0, Math.min(1, -bounds.top / Math.max(1, bounds.height - innerHeight)))
    : 1;
  const active = pinned ? Math.min(2, Math.floor(progress * 3)) : -1;
  roleSteps.forEach((step, i) => step.classList.toggle('is-active', active < 0 || i === active));
  $('role-screens').style.setProperty(
    '--line-offset',
    String(1040 * (1 - (pinned ? progress : 1))),
  );
}
window.addEventListener(
  'scroll',
  () => {
    if (!scrollPending) {
      scrollPending = true;
      requestAnimationFrame(updateScreens);
    }
  },
  { passive: true },
);
window.addEventListener('resize', updateScreens);
reduced.addEventListener('change', updateScreens);
updateScreens();
