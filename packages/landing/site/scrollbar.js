// The page's scrollbar, after the owner's reference: a thin rounded thumb
// floating over the right edge of the page, with no track. The native bar is hidden (pixels.css),
// since it took a lane out of the page's width. Touch screens keep their own bars, which already
// float over the page.
import { scrollPageTo } from './smooth-scroll.js'

export const THUMB_MIN = 24 // px: the thumb never gets shorter than this

// The thumb's length and offset (px) for a page `content` tall seen through a `view` scrolled to `top`.
export function thumbFor({ top, view, content }) {
  const range = content - view
  if (!(range >= 1) || !(view > 0)) return null
  const size = Math.min(view, Math.max(THUMB_MIN, Math.round((view * view) / content)))
  const progress = Math.min(1, Math.max(0, top / range))
  return { size, offset: (view - size) * progress }
}

export function initPageScrollbar() {
  const fine = matchMedia('(hover: hover) and (pointer: fine)')
  let started = false
  const start = () => {
    if (started || !document.body) return
    started = true
    const root = document.documentElement
    const bar = document.createElement('div')
    bar.className = 'page-scrollbar'
    bar.setAttribute('aria-hidden', 'true')
    document.body.append(bar)
    let metrics = null
    let size = 0
    let frame = 0
    let drag = null

    function render() {
      frame = 0
      const thumb = metrics && thumbFor(metrics)
      bar.classList.toggle('is-active', !!thumb)
      if (!thumb) return
      if (thumb.size !== size) {
        size = thumb.size
        bar.style.height = `${size}px`
      }
      bar.style.transform = `translate3d(0, ${thumb.offset.toFixed(1)}px, 0)`
    }
    // Read while the frame's layout is still clean (scroll, resize and observers run before the
    // frame's animation work) and write on the frame itself.
    function update() {
      metrics = { top: window.scrollY, view: root.clientHeight, content: root.scrollHeight }
      if (!frame) frame = requestAnimationFrame(render)
    }

    const endDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      drag = null
      bar.classList.remove('is-dragging')
    }
    bar.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !metrics) return
      event.preventDefault()
      try {
        bar.setPointerCapture(event.pointerId)
      } catch {
        return
      }
      drag = { pointerId: event.pointerId, y: event.clientY, top: metrics.top }
      bar.classList.add('is-dragging')
    })
    bar.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId || !metrics) return
      const range = metrics.content - metrics.view
      const travel = metrics.view - size
      if (range < 1 || travel < 1) return
      // At once, and through Lenis where it runs: it would otherwise ease the page back to where
      // the wheel last sent it.
      scrollPageTo(Math.min(range, Math.max(0, drag.top + ((event.clientY - drag.y) * range) / travel)), { smooth: false })
    })
    bar.addEventListener('pointerup', endDrag)
    bar.addEventListener('pointercancel', endDrag)
    bar.addEventListener('lostpointercapture', endDrag)

    addEventListener('scroll', update, { passive: true })
    addEventListener('resize', update, { passive: true })
    new ResizeObserver(update).observe(document.body)
    update()
  }
  if (fine.matches) start()
  else fine.addEventListener('change', (event) => event.matches && start())
}

// Every page loads this module on its own (the unit tests import it without a page).
if (typeof matchMedia === 'function') initPageScrollbar()
