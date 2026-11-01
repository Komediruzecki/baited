// The landing's scrollbar (packages/landing/site/scrollbar.js): a thin
// rounded thumb with no track. The page gets the landing's own floating bar, and every element
// that scrolls on its own (dialogs, lists, the card maker) gets the same thumb inside it, so no
// native bar shows with a mouse or trackpad. Touch screens keep their own floating bars, and an
// OBS overlay never draws one: OBS captures the whole page.

export const THUMB_MIN = 24; // px: the thumb never gets shorter than this

/** Elements that scroll on their own. One missing here still gets a thumb on its first scroll;
 *  tests/scrollbars.test.ts checks every overflow rule in the stylesheets against this list. */
export const SCROLLERS = [
  '.modal',
  '.hint-list',
  '.transcript-lines',
  '.card-library__word-list',
  '.card-maker__card-tabs',
  '.card-artwork__grid',
  '.proof-selector-grid',
  '.cl-stage',
  '.cl-context--panel',
  '.cl-context--phone',
  '.cl-editions',
  '.cl-clue-preview',
  '.product-review__canvas',
  '.speech-lab pre',
];

type Axis = 'x' | 'y';
interface Metrics {
  top: number;
  view: number;
  content: number;
}
interface Fit {
  size: number;
  offset: number;
  range: number;
  track: number;
}
interface Rail {
  el: HTMLElement;
  thumbs: Partial<Record<Axis, HTMLElement>>;
  fits: Partial<Record<Axis, Fit>>;
  written: Partial<Record<Axis, string>>;
}
interface Read {
  rail: Rail;
  positioned: boolean;
  inset: number;
  left: number;
  top: number;
  x: Metrics | null;
  y: Metrics | null;
  rangeX: number;
  rangeY: number;
}

/** The thumb's length and offset (px) for `content` seen through a `view` scrolled to `top`, along a
 *  `track` (the whole view unless the thumb is inset). With no track this is the landing's math. */
export function thumbFor({ top, view, content, track = view }: Metrics & { track?: number }) {
  const range = content - view;
  if (!(range >= 1) || !(view > 0) || !(track > 0)) return null;
  const size = Math.min(track, Math.max(THUMB_MIN, Math.round((track * view) / content)));
  const progress = Math.min(1, Math.max(0, top / range));
  return { size, offset: (track - size) * progress };
}

const scrolls = (overflow: string) => overflow === 'auto' || overflow === 'scroll';
const ours = (node: Node) =>
  node instanceof Element && (node.localName === 'scroll-thumb' || node.classList.contains('page-scrollbar'));

// The landing's page bar, unchanged apart from types.
function startPageScrollbar() {
  const root = document.documentElement;
  const bar = document.createElement('div');
  bar.className = 'page-scrollbar';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  let metrics: Metrics | null = null;
  let size = 0;
  let frame = 0;
  let drag: { pointerId: number; y: number; top: number } | null = null;

  function render() {
    frame = 0;
    const thumb = metrics && thumbFor(metrics);
    bar.classList.toggle('is-active', !!thumb);
    if (!thumb) return;
    if (thumb.size !== size) {
      size = thumb.size;
      bar.style.height = `${size}px`;
    }
    bar.style.transform = `translate3d(0, ${thumb.offset.toFixed(1)}px, 0)`;
  }
  // Read while the frame's layout is still clean (scroll, resize and observers run before the
  // frame's animation work) and write on the frame itself.
  function update() {
    metrics = { top: window.scrollY, view: root.clientHeight, content: root.scrollHeight };
    if (!frame) frame = requestAnimationFrame(render);
  }

  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    bar.classList.remove('is-dragging');
  };
  bar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !metrics) return;
    event.preventDefault();
    try {
      bar.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    drag = { pointerId: event.pointerId, y: event.clientY, top: metrics.top };
    bar.classList.add('is-dragging');
  });
  bar.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId || !metrics) return;
    const range = metrics.content - metrics.view;
    const travel = metrics.view - size;
    if (range < 1 || travel < 1) return;
    window.scrollTo(0, Math.min(range, Math.max(0, drag.top + ((event.clientY - drag.y) * range) / travel)));
  });
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);
  bar.addEventListener('lostpointercapture', endDrag);

  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update, { passive: true });
  new ResizeObserver(update).observe(document.body);
  update();
}

// Inner scrollers. Each thumb is the scroller's last child (never first: lists style
// li:first-child), absolutely placed, so it moves with the page like the scroller does. Where
// scroll-driven animations exist, scrollbars.css lets the scroll position carry the thumb on the
// compositor; elsewhere the thumb is moved on every scroll event.
function startInnerScrollbars() {
  const timeline = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()');
  const rails = new Map<HTMLElement, Rail>();
  const resized = new ResizeObserver(() => schedule());
  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  function register(el: HTMLElement) {
    if (rails.has(el)) return;
    rails.set(el, { el, thumbs: {}, fits: {}, written: {} });
    resized.observe(el);
  }

  function makeThumb(rail: Rail, axis: Axis) {
    const thumb = document.createElement('scroll-thumb');
    thumb.dataset.axis = axis;
    thumb.setAttribute('aria-hidden', 'true');
    let drag: { pointerId: number; from: number; at: number } | null = null;
    const at = (event: PointerEvent) => (axis === 'y' ? event.clientY : event.clientX);
    const end = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      thumb.classList.remove('is-dragging');
    };
    thumb.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !rail.fits[axis]) return;
      // Keep the press from reaching a list item or a dialog's backdrop handler.
      event.preventDefault();
      event.stopPropagation();
      try {
        thumb.setPointerCapture(event.pointerId);
      } catch {
        return;
      }
      drag = { pointerId: event.pointerId, at: at(event), from: axis === 'y' ? rail.el.scrollTop : rail.el.scrollLeft };
      thumb.classList.add('is-dragging');
    });
    thumb.addEventListener('pointermove', (event) => {
      const fit = rail.fits[axis];
      if (!drag || event.pointerId !== drag.pointerId || !fit) return;
      const travel = fit.track - fit.size;
      if (fit.range < 1 || travel < 1) return;
      const to = Math.min(fit.range, Math.max(0, drag.from + ((at(event) - drag.at) * fit.range) / travel));
      if (axis === 'y') rail.el.scrollTop = to;
      else rail.el.scrollLeft = to;
    });
    thumb.addEventListener('click', (event) => event.stopPropagation());
    thumb.addEventListener('pointerup', end);
    thumb.addEventListener('pointercancel', end);
    thumb.addEventListener('lostpointercapture', end);
    return thumb;
  }

  function measure() {
    frame = 0;
    for (const el of document.querySelectorAll<HTMLElement>(SCROLLERS.join(','))) register(el);
    // Every read first, then every write, so one layout serves the whole pass.
    const reads: Read[] = [];
    for (const rail of rails.values()) {
      const { el } = rail;
      if (!el.isConnected) {
        for (const thumb of Object.values(rail.thumbs)) thumb?.remove();
        resized.unobserve(el);
        rails.delete(el);
        continue;
      }
      const style = getComputedStyle(el);
      reads.push({
        rail,
        positioned: style.position !== 'static',
        inset: parseFloat(style.getPropertyValue('--scroll-thumb-inset')) || 4,
        left: el.scrollLeft,
        top: el.scrollTop,
        y: scrolls(style.overflowY) ? { top: el.scrollTop, view: el.clientHeight, content: el.scrollHeight } : null,
        x: scrolls(style.overflowX) ? { top: el.scrollLeft, view: el.clientWidth, content: el.scrollWidth } : null,
        rangeX: el.scrollWidth - el.clientWidth,
        rangeY: el.scrollHeight - el.clientHeight,
      });
    }
    for (const read of reads) {
      const { rail } = read;
      for (const axis of ['y', 'x'] as const) {
        const metrics = read[axis];
        const track = metrics ? metrics.view - 2 * read.inset : 0;
        const thumb = metrics && thumbFor({ ...metrics, track });
        let node = rail.thumbs[axis];
        if (!metrics || !thumb) {
          delete rail.fits[axis];
          if (node?.classList.contains('is-active')) node.classList.remove('is-active');
          continue;
        }
        if (!read.positioned) rail.el.style.position = 'relative';
        node ??= rail.thumbs[axis] = makeThumb(rail, axis);
        // React drops foreign children when it replaces a list's contents with text.
        if (node.parentNode !== rail.el || node !== rail.el.lastElementChild) rail.el.append(node);
        const range = metrics.content - metrics.view;
        rail.fits[axis] = { ...thumb, range, track };
        const follow = axis === 'y' ? Math.max(0, read.rangeX) : Math.max(0, read.rangeY);
        const vars = `${thumb.size}|${range + track - thumb.size}|${follow}`;
        if (rail.written[axis] !== vars) {
          rail.written[axis] = vars;
          node.style.setProperty('--thumb-size', `${thumb.size}px`);
          node.style.setProperty('--thumb-travel', `${range + track - thumb.size}px`);
          node.style.setProperty('--thumb-follow', `${follow}px`);
        }
        if (!timeline) {
          const along = metrics.top + thumb.offset;
          node.style.transform =
            axis === 'y' ? `translate3d(${read.left}px, ${along.toFixed(1)}px, 0)` : `translate3d(${along.toFixed(1)}px, ${read.top}px, 0)`;
        }
        if (!node.classList.contains('is-active')) node.classList.add('is-active');
      }
    }
  }

  // Our own thumbs and bar change too; only the page's changes count.
  new MutationObserver((records) => {
    const page = records.some((record) =>
      record.type === 'childList'
        ? [...record.addedNodes, ...record.removedNodes].some((node) => !ours(node))
        : !ours(record.target),
    );
    if (page) schedule();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['open', 'class', 'hidden'],
  });
  document.addEventListener(
    'scroll',
    (event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement)) return; // the page: its own bar listens
      if (!rails.has(el)) {
        // A scroller the list doesn't know: it gets its thumb from its first scroll on.
        if (/^(textarea|input|select)$/.test(el.localName)) return;
        const style = getComputedStyle(el);
        if (!scrolls(style.overflowY) && !scrolls(style.overflowX)) return;
        register(el);
        schedule();
      } else if (!timeline) schedule();
    },
    { capture: true, passive: true },
  );
  document.addEventListener('load', schedule, true); // images that size a list's content
  addEventListener('resize', schedule, { passive: true });
  void document.fonts?.ready.then(schedule);
  schedule();
}

export function initScrollbars() {
  if (location.pathname.startsWith('/overlay/')) return;
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let started = false;
  const start = () => {
    if (started || !document.body) return;
    started = true;
    startPageScrollbar();
    startInnerScrollbars();
  };
  if (fine.matches) start();
  else fine.addEventListener('change', (event) => event.matches && start());
}

// Each entry point imports this module once (the unit tests import it without a page).
if (typeof matchMedia === 'function') initScrollbars();
