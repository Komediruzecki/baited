// Smooth scrolling for the mouse wheel and trackpad, in the owner's chosen feel (Lenis 1.3.23 with
// lerp 0.165 and the wheel × 1.25; touch scrolling stays the phone's own). On the home page it runs
// on GSAP's ticker and hands every scroll to ScrollTrigger, so the scrubbed and pinned scenes move
// in the very frame the page does, and GSAP keeps its usual lag smoothing (500 ms, 33 ms). Pages
// without GSAP run it on its own frames. With reduced motion, or without site/vendor/lenis, the
// browser scrolls the page.

export const LENIS_OPTIONS = Object.freeze({ lerp: 0.165, wheelMultiplier: 1.25 })

// The running Lenis, or null where the browser scrolls the page itself.
export let smoothScroll = null

export function initSmoothScroll({ Lenis = globalThis.Lenis, gsap = globalThis.gsap, ScrollTrigger = globalThis.ScrollTrigger } = {}) {
  if (smoothScroll || typeof Lenis !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return smoothScroll
  smoothScroll = new Lenis({ ...LENIS_OPTIONS, autoRaf: !gsap })
  if (gsap) {
    if (ScrollTrigger) smoothScroll.on('scroll', ScrollTrigger.update)
    gsap.ticker.add((time) => smoothScroll.raf(time * 1000))
    gsap.ticker.lagSmoothing(500, 33)
  }
  addEventListener('scroll', () => yieldToOtherScrolls(smoothScroll), { passive: true })
  return smoothScroll
}

// Lenis learns of a scroll it did not make only from that scroll's event, so until then it still
// counts the page as where it last left it. Brought to where the page `y` really is, if it is not.
export function catchUp(lenis, y = scrollY) {
  if (Math.abs(y - lenis.animatedScroll) > 2) lenis.scrollTo(y, { immediate: true })
}

// While Lenis eases it takes no notice of those events at all, and on its next frame it puts the
// page back on its way: a scroll from the keyboard, focus, find-in-page or a script in that last
// second would be undone. Any scroll that is not where Lenis left the page takes over at once.
export function yieldToOtherScrolls(lenis, y = scrollY) {
  if (lenis.isScrolling === 'smooth') catchUp(lenis, y)
}

// Takes the page to `target`: a scroll position in px, or an element, which comes to rest under the
// page's scroll padding as with scrollIntoView. Lenis eases the trip as it eases the wheel, setting
// off from where the page really is (a click that came before the event of a scroll just made
// sent it from its old place, 1340px off at 1920px wide), and calls `onComplete` on arrival.
// Without it the browser scrolls, smoothly unless `smooth` is false, and calls nothing.
export function scrollPageTo(target, { smooth = true, onComplete } = {}) {
  if (smoothScroll) {
    catchUp(smoothScroll)
    return smoothScroll.scrollTo(target, { immediate: !smooth, onComplete })
  }
  const behavior = smooth ? 'smooth' : 'instant'
  if (typeof target === 'number') scrollTo({ top: target, behavior })
  else target.scrollIntoView({ block: 'start', behavior })
}

// The home page starts it from app.js, once GSAP is there. Other pages load this module on their
// own, and it starts once they have been parsed, when their deferred scripts, Lenis's among them,
// have run.
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => initSmoothScroll(), { once: true })
