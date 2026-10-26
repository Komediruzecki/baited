const REVIEW_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'dev.baited.maff.app'])
const MARKS = new Set(['a', 'b', 'c'])

export function reviewMark(hostname, search) {
  if (!REVIEW_HOSTS.has(hostname)) return null
  const mark = new URLSearchParams(search).get('mark')
  return MARKS.has(mark) ? mark : null
}

export function initBrand(root = document) {
  const mark = reviewMark(location.hostname, location.search)
  if (mark) document.documentElement.dataset.mark = mark

  const source = new Image()
  source.onerror = () => document.documentElement.classList.add('brand-fallback')
  source.src = mark ? `/lab/brand/baited-${mark}.png` : '/assets/brand/baited-original-mask.svg'

  // The header logo is an image; if it cannot load, the brand shows its name as text.
  for (const logo of root.querySelectorAll('.brand-logo')) {
    const missing = () => logo.closest('.brand')?.classList.add('is-logo-missing')
    if (logo.complete && !logo.naturalWidth) missing()
    else logo.addEventListener('error', missing, { once: true })
  }

  for (const brand of root.querySelectorAll('.brand')) {
    let timer = 0
    const rest = () => {
      clearTimeout(timer)
      brand.classList.remove('is-open')
    }
    brand.addEventListener('pointerup', (event) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      brand.classList.add('is-open')
      clearTimeout(timer)
      timer = setTimeout(rest, 1400)
    })
    brand.addEventListener('pointercancel', rest)
    brand.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') rest()
    })
    addEventListener('pagehide', rest)
    document.addEventListener('visibilitychange', () => document.hidden && rest())
  }
}
