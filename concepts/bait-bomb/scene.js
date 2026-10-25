/* One local, silent demonstration. No network, media capture or game state. */
(() => {
  'use strict';
  const examples = {
    banana: {
      word: 'BANANA', prompt: 'What goes in your smoothie?', spoken: 'Banana.', tail: 'Wait.',
      captions: ["Chat's card is BANANA. The streamer can't see it.", 'Chat asks about a smoothie. An innocent question.', 'The streamer says “Banana.” Then the penny drops.', 'BANANA is caught. The secret opens up.', 'Chat wins this round. You took the bait.'],
    },
    penguin: {
      word: 'PENGUIN', prompt: 'Which animal always looks overdressed?', spoken: 'A penguin?', tail: 'Oh, come on.',
      captions: ["Chat's card is PENGUIN. The streamer can't see it.", 'Chat asks about an overdressed animal.', '“A penguin?” A perfectly reasonable answer.', 'PENGUIN is caught. The secret opens up.', 'Chat wins this round. You took the bait.'],
    },
    microwave: {
      word: 'MICROWAVE', prompt: 'How do you reheat leftover pizza?', spoken: 'The microwave.', tail: 'You got me.',
      captions: ["Chat's card is MICROWAVE. The streamer can't see it.", 'Chat brings up yesterday’s pizza.', 'The streamer gives away the answer: “The microwave.”', 'MICROWAVE is caught. The secret opens up.', 'Chat wins this round. You took the bait.'],
    },
  };
  const duration = 11500;
  const beatStarts = [0, 2200, 5000, 7300, 9200];
  const beatStops = [1500, 3700, 6500, 8600, duration];
  const $ = (selector) => document.querySelector(selector);
  const all = (selector) => [...document.querySelectorAll(selector)];
  const playButton = $('#play-example');
  const playLabel = $('#play-label');
  const caption = $('#beat-caption');
  const progress = $('#timeline-fill');
  const beatButtons = all('[data-beat]');
  const cards = all('[data-card]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let word = 'banana';
  let elapsed = 0;
  let playing = false;
  let previousTime = 0;
  let frame = 0;
  let displayedBeat = -1;
  let animations = [];

  function animate(selector, keyframes) {
    const element = $(selector);
    if (!element.animate) return;
    const animation = element.animate(keyframes, { duration, fill: 'both', easing: 'linear' });
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
  }

  function buildMotion() {
    animations.forEach((animation) => animation.cancel());
    animations = [];
    $('#motion-note').hidden = !reducedMotion.matches;
    if (reducedMotion.matches) return;
    const settle = 'cubic-bezier(.16,1,.3,1)';
    animate('#dealt-card', [
      { offset: 0, transform: 'translate(0, 12px) rotate(-11deg)', easing: settle },
      { offset: .13, transform: 'translate(0, 0) rotate(-8deg)' },
      { offset: 1, transform: 'translate(0, 0) rotate(-8deg)' },
    ]);
    animate('#chat-slip', [
      { offset: 0, opacity: 0, transform: 'translateY(16px)', clipPath: 'inset(0 0 100% 0)' },
      { offset: .19, opacity: 0, transform: 'translateY(16px)', clipPath: 'inset(0 0 100% 0)', easing: settle },
      { offset: .28, opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0 0 -15% 0)' },
      { offset: 1, opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0 0 -15% 0)' },
    ]);
    animate('#answer-slip', [
      { offset: 0, opacity: 0, transform: 'translate(10px, 15px) rotate(-2deg)' },
      { offset: .43, opacity: 0, transform: 'translate(10px, 15px) rotate(-2deg)', easing: settle },
      { offset: .52, opacity: 1, transform: 'translate(0, 0) rotate(-2deg)' },
      { offset: 1, opacity: 1, transform: 'translate(0, 0) rotate(-2deg)' },
    ]);
    for (const [selector, distance] of [['#cover-left', '-105%'], ['#cover-right', '105%']]) {
      animate(selector, [
        { offset: 0, transform: 'translateX(0)' },
        { offset: .635, transform: 'translateX(0)', easing: settle },
        { offset: .74, transform: `translateX(${distance})` },
        { offset: 1, transform: `translateX(${distance})` },
      ]);
    }
    animate('#bomb', [
      { offset: 0, transform: 'rotate(6deg) translate(0, 0)' },
      { offset: .635, transform: 'rotate(6deg) translate(0, 0)', easing: settle },
      { offset: .70, transform: 'rotate(-7deg) translate(-12px, -15px)', easing: settle },
      { offset: .80, transform: 'rotate(2deg) translate(0, 0)' },
      { offset: 1, transform: 'rotate(2deg) translate(0, 0)' },
    ]);
    animate('#caught-stamp', [
      { offset: 0, opacity: 0, transform: 'rotate(5deg) scale(1.14)', clipPath: 'inset(0 100% 0 0)' },
      { offset: .80, opacity: 0, transform: 'rotate(5deg) scale(1.14)', clipPath: 'inset(0 100% 0 0)', easing: settle },
      { offset: .89, opacity: 1, transform: 'rotate(5deg) scale(1)', clipPath: 'inset(-10% -10% -10% -10%)' },
      { offset: 1, opacity: 1, transform: 'rotate(5deg) scale(1)', clipPath: 'inset(-10% -10% -10% -10%)' },
    ]);
  }

  function beatAt(time) {
    let beat = 0;
    beatStarts.forEach((start, index) => { if (time >= start) beat = index; });
    return beat;
  }

  function render(force = false) {
    const beat = beatAt(elapsed);
    animations.forEach((animation) => { animation.currentTime = elapsed; });
    progress.style.transform = `scaleX(${reducedMotion.matches ? (beat + 1) / 5 : elapsed / duration})`;
    if (force || displayedBeat !== beat) {
      displayedBeat = beat;
      document.body.dataset.step = String(beat);
      caption.textContent = examples[word].captions[beat];
      beatButtons.forEach((button, index) => {
        if (index === beat) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    }
  }

  function updatePlayback() {
    document.body.dataset.playing = String(playing);
    playLabel.textContent = playing ? 'Pause example' : elapsed >= duration ? 'Play again' : elapsed > 0 ? 'Resume example' : 'Play an example';
  }

  function tick(time) {
    if (!playing) return;
    elapsed = Math.min(duration, elapsed + time - previousTime);
    previousTime = time;
    render();
    if (elapsed >= duration) {
      playing = false;
      updatePlayback();
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function pause() {
    if (playing) {
      elapsed = Math.min(duration, elapsed + performance.now() - previousTime);
      playing = false;
      cancelAnimationFrame(frame);
      render();
    }
    updatePlayback();
  }

  function play(fromStart = false) {
    cancelAnimationFrame(frame);
    if (fromStart || elapsed >= duration) elapsed = 0;
    playing = true;
    previousTime = performance.now();
    render(true);
    updatePlayback();
    frame = requestAnimationFrame(tick);
  }

  function seek(beat) {
    pause();
    elapsed = beatStops[beat];
    render(true);
    updatePlayback();
  }

  function choose(nextWord) {
    pause();
    word = nextWord;
    elapsed = 0;
    const example = examples[word];
    all('[data-word]').forEach((node) => {
      node.textContent = example.word;
      node.classList.toggle('long-word', word === 'microwave');
    });
    all('[data-prompt]').forEach((node) => { node.textContent = example.prompt; });
    all('[data-spoken]').forEach((node) => { node.textContent = example.spoken; });
    all('[data-tail]').forEach((node) => { node.textContent = example.tail; });
    $('[data-art]').setAttribute('src', `/cards/proofs/${word}.png`);
    $('.word-window').classList.toggle('long-word', word === 'microwave');
    cards.forEach((card) => {
      const selected = card.dataset.card === word;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
    $('#selection-note').textContent = `${example.word} is on the table. Ready to play.`;
    render(true);
    updatePlayback();
    playButton.focus({ preventScroll: true });
    $('.invitation').scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }

  playButton.addEventListener('click', () => playing ? pause() : play());
  $('#replay-example').addEventListener('click', () => {
    if (matchMedia('(max-width: 700px)').matches) {
      $('#example').scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
    play(true);
  });
  beatButtons.forEach((button, index) => {
    button.addEventListener('click', () => seek(index));
    button.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = Math.min(4, index + 1);
      else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = 4;
      else return;
      event.preventDefault();
      beatButtons[next].focus();
      seek(next);
    });
  });
  cards.forEach((card) => {
    card.disabled = false;
    card.addEventListener('click', () => choose(card.dataset.card));
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', pause);
  reducedMotion.addEventListener('change', () => {
    pause();
    buildMotion();
    render(true);
  });
  const bomb = $('#bomb');
  const imageFailed = () => bomb.parentElement.classList.add('bomb-missing');
  bomb.addEventListener('error', imageFailed);
  if (bomb.complete && !bomb.naturalWidth) imageFailed();
  buildMotion();
  document.body.dataset.enhanced = 'true';
  $('#playback').hidden = false;
  playButton.hidden = false;
  $('#card-instruction').textContent = 'Choose a word, then play the example.';
  render(true);
  updatePlayback();
})();
