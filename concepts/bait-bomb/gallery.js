/* A native scrolling deck, with a reversible, silent left-to-right drift.
   Manual input always takes ownership. Copies are visual only and inert. */
(() => {
  'use strict';
  const viewport = document.querySelector('#card-gallery');
  const original = viewport.querySelector('.gallery-deck');
  const toggle = document.querySelector('#gallery-toggle');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const controls = document.querySelector('.gallery-controls');
  const section = document.querySelector('#cards');
  let paused = reduced.matches;
  let visible = false;
  let hovered = false;
  let focused = false;
  let dragging = null;
  let width = 0;
  let position = 0;
  let frame = 0;
  let previousTime = 0;
  let settleTimer = 0;

  for (const before of [true, false]) {
    const copy = original.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    copy.classList.add('gallery-copy');
    if (before) viewport.prepend(copy);
    else viewport.append(copy);
  }

  function normalize() {
    if (!width) return;
    let next = viewport.scrollLeft;
    if (next < width * .5) next += width;
    else if (next > width * 1.5) next -= width;
    if (next !== viewport.scrollLeft) viewport.scrollLeft = next;
    position = viewport.scrollLeft;
  }

  function tick(time) {
    frame = 0;
    if (!previousTime) previousTime = time;
    // Keep a fractional position, since browsers may round scrollLeft writes.
    position -= Math.min(time - previousTime, 50) * .025;
    if (position < width * .5) position += width;
    viewport.scrollLeft = position;
    previousTime = time;
    frame = requestAnimationFrame(tick);
  }

  function update() {
    const running = !paused && !reduced.matches && visible && !document.hidden && !hovered && !focused && !dragging;
    section.dataset.galleryPaused = String(paused || reduced.matches);
    section.dataset.galleryRunning = String(running);
    toggle.querySelector('span').textContent = reduced.matches ? 'Motion off' : paused ? 'Play gallery' : 'Pause gallery';
    toggle.disabled = reduced.matches;
    if (running && !frame) {
      position = viewport.scrollLeft;
      previousTime = 0;
      frame = requestAnimationFrame(tick);
    } else if (!running) {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
    }
  }

  function takeControl() {
    paused = true;
    update();
  }

  function step(direction) {
    takeControl();
    const card = original.firstElementChild;
    const stride = card.offsetWidth + parseFloat(getComputedStyle(original).columnGap);
    viewport.scrollLeft += direction * stride;
    normalize();
  }

  new ResizeObserver(() => {
    const nextWidth = original.getBoundingClientRect().width;
    if (!nextWidth) return;
    const fraction = width ? (((viewport.scrollLeft - width) % width + width) % width) / width : 0;
    width = nextWidth;
    viewport.scrollLeft = width + fraction * width;
    normalize();
    update();
  }).observe(original);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  }, { threshold: .05 }).observe(viewport);

  viewport.addEventListener('scroll', () => {
    clearTimeout(settleTimer);
    if (!frame && !dragging) settleTimer = setTimeout(normalize, 160);
  }, { passive: true });
  viewport.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovered = true; update(); } });
  viewport.addEventListener('pointerleave', () => { hovered = false; update(); });
  viewport.addEventListener('focusin', () => { focused = true; update(); });
  viewport.addEventListener('focusout', () => { focused = false; update(); });
  viewport.addEventListener('wheel', event => { if (Math.abs(event.deltaX) > 0 || event.shiftKey) takeControl(); }, { passive: true });
  viewport.addEventListener('pointerdown', event => {
    takeControl();
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    dragging = { id: event.pointerId, x: event.clientX, scroll: viewport.scrollLeft };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-dragging');
    event.preventDefault();
  });
  viewport.addEventListener('pointermove', event => {
    if (!dragging || dragging.id !== event.pointerId) return;
    viewport.scrollLeft = dragging.scroll + dragging.x - event.clientX;
  });
  const release = () => {
    const wasMouseDrag = dragging !== null;
    dragging = null;
    viewport.classList.remove('is-dragging');
    if (wasMouseDrag) normalize();
    update();
  };
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  viewport.addEventListener('lostpointercapture', release);
  viewport.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      step(event.key === 'ArrowLeft' ? -1 : 1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      takeControl();
      viewport.scrollLeft = width + (event.key === 'End' ? width - viewport.clientWidth : 0);
      normalize();
    }
  });
  document.querySelector('#gallery-previous').addEventListener('click', () => step(-1));
  document.querySelector('#gallery-next').addEventListener('click', () => step(1));
  toggle.addEventListener('click', () => { paused = !paused; update(); });
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; });
  window.addEventListener('pageshow', update);
  reduced.addEventListener('change', () => { paused = reduced.matches || paused; update(); });
  controls.hidden = false;
  update();
})();
