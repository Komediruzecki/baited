// Your turn owns the cover. Its tiles fill the deck's reserved empty runway.
export function initSceneSeam({ reduced }) {
  const deck = document.getElementById('cards')
  const incoming = document.getElementById('your-turn')
  if (!deck || !incoming || incoming.querySelector('.scene-seam')) return

  const seam = document.createElement('div')
  seam.className = 'scene-seam'
  seam.setAttribute('aria-hidden', 'true')
  incoming.prepend(seam)
  deck.classList.add('has-scene-seam')
  incoming.classList.add('has-scene-seam')

  let columns = 0
  let width = 0
  let tiles = []
  let visible = false
  let frame = 0
  let listening = false
  let destroyed = false
  const clamp = (value) => Math.max(0, Math.min(1, value))
  const hash = (column, row) => {
    let value = Math.imul(column + 1, 374761393) + Math.imul(row + 1, 668265263)
    value = Math.imul(value ^ (value >>> 13), 1274126177)
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296
  }

  function paint(progress) {
    for (const tile of tiles) {
      const level = Math.round(clamp((progress - tile.threshold) / 0.09) * 3)
      if (level === tile.level) continue
      tile.level = level
      tile.element.style.opacity = String(level / 3)
    }
  }

  function update() {
    frame = 0
    if (destroyed || document.hidden) return
    if (reduced.matches) {
      paint(0.5)
      return
    }
    if (!visible) return
    // One layout read; alpha only changes at one of four discrete levels.
    const boundary = incoming.getBoundingClientRect().top
    const viewport = window.innerHeight
    paint(clamp((0.92 * viewport - boundary) / Math.max(1, 0.55 * viewport)))
  }

  function requestUpdate() {
    if (destroyed || frame || !visible || reduced.matches || document.hidden) return
    frame = requestAnimationFrame(update)
  }

  function measure() {
    if (destroyed) return
    const nextWidth = incoming.clientWidth
    if (nextWidth <= 0) return
    const nextColumns = nextWidth <= 700 ? 8 : Math.min(36, Math.max(18, Math.ceil(nextWidth / 96)))
    if (nextWidth !== width) {
      width = nextWidth
      // Width can change inside one column-count bucket. Always update the band.
      const band = `${(width / nextColumns) * 3}px`
      deck.style.setProperty('--scene-band', band)
      incoming.style.setProperty('--scene-band', band)
    }
    if (nextColumns !== columns) {
      columns = nextColumns
      seam.style.setProperty('--scene-columns', String(columns))
      const fragment = document.createDocumentFragment()
      tiles = []
      for (let visualRow = 0; visualRow < 3; visualRow++) {
        const row = 2 - visualRow // The row touching Your turn fills first.
        for (let column = 0; column < columns; column++) {
          const element = document.createElement('i')
          element.style.opacity = '0'
          tiles.push({ element, threshold: 0.06 + 0.27 * row + 0.3 * hash(column, row), level: 0 })
          fragment.append(element)
        }
      }
      seam.replaceChildren(fragment)
    }
    if (reduced.matches) paint(0.5)
    else requestUpdate()
  }

  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (!visible && frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
    requestUpdate()
  })

  function applyMotionPreference() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    intersection.disconnect()
    if (listening) window.removeEventListener('scroll', requestUpdate)
    listening = false
    visible = false
    if (reduced.matches) {
      paint(0.5)
      return
    }
    window.addEventListener('scroll', requestUpdate, { passive: true })
    listening = true
    intersection.observe(seam)
  }

  function onVisibilityChange() {
    if (document.hidden && frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
    requestUpdate()
  }

  const resize = new ResizeObserver(measure)
  measure()
  applyMotionPreference()
  resize.observe(incoming)
  window.addEventListener('resize', measure, { passive: true })
  document.addEventListener('visibilitychange', onVisibilityChange)
  reduced.addEventListener('change', applyMotionPreference)

  return function destroySceneSeam() {
    destroyed = true
    if (frame) cancelAnimationFrame(frame)
    intersection.disconnect()
    resize.disconnect()
    window.removeEventListener('scroll', requestUpdate)
    window.removeEventListener('resize', measure)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    reduced.removeEventListener('change', applyMotionPreference)
    deck.classList.remove('has-scene-seam')
    incoming.classList.remove('has-scene-seam')
    deck.style.removeProperty('--scene-band')
    incoming.style.removeProperty('--scene-band')
    seam.remove()
  }
}
