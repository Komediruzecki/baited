// Text is uncovered as if a highlighter lifted off it, after a highlight-marker text reveal: each
// line of a heading or paragraph starts under a bar of colour, and once the text comes into view
// the bars draw back one line after another. Words are wrapped in plain inline spans while the bars
// are measured, so kerning, line breaks and screen readers see the same text; the spans come out
// again once it is shown. A control inside the text (the deck help's button) is covered whole and
// keeps its own label untouched. Reduced motion or no GSAP: the text is simply there.

// Splits on ordinary spaces only, so a non-breaking space keeps its words together.
export const splitWords = (text) => text.split(/([ \t\n\r\f]+)/).filter(Boolean)

// Wraps the element's letters or words in spans and returns them, with a way to undo it. Text inside
// an element matching `keep` stays whole: taking a button's label apart can drop a click on it (the
// span pressed is gone by the time the button is released), and a flex button loses its spaces.
export function splitText(element, unit = 'chars', keep) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const texts = []
  while (walker.nextNode()) {
    const kept = keep && walker.currentNode.parentElement?.closest(keep)
    if (!kept || !element.contains(kept)) texts.push(walker.currentNode)
  }
  const units = []
  for (const text of texts) {
    const fragment = document.createDocumentFragment()
    for (const part of splitWords(text.textContent)) {
      if (/^[ \t\n\r\f]+$/.test(part)) {
        fragment.append(part)
        continue
      }
      for (const piece of unit === 'chars' ? [...part] : [part]) {
        const span = document.createElement('span')
        span.className = 'split-unit'
        span.textContent = piece
        fragment.append(span)
        units.push(span)
      }
    }
    text.replaceWith(fragment)
  }
  const restore = () => {
    for (const span of units) span.replaceWith(span.textContent)
    element.normalize()
  }
  return { units, restore }
}

export const MARKER_SECONDS = 0.6 // a bar draws back in this long…
export const MARKER_STAGGER = 0.1 // …starting this long after the line above it
export const MARKER_OVERHANG = 0.12 // ems a bar reaches past the words at each end
export const MARKER_FONT_WAIT = 1000 // ms the bars wait at most for the page's fonts

// The lines of a run of words, from the words' boxes in reading order ({ left, top, right, bottom }):
// a word that starts more than half a line lower opens a new line.
export function lineBoxes(words) {
  const lines = []
  for (const word of words) {
    const line = lines.at(-1)
    if (line && word.top - line.top < Math.max(2, (line.bottom - line.top) / 2)) {
      line.left = Math.min(line.left, word.left)
      line.top = Math.min(line.top, word.top)
      line.right = Math.max(line.right, word.right)
      line.bottom = Math.max(line.bottom, word.bottom)
    } else lines.push({ ...word })
  }
  return lines
}

// Where an element sits inside `container`, through any positioned element in between (the hidden
// word in the hero's headline is one). Layout offsets, so a sheet still leaning in or a line sliding
// off measures as it is laid out.
export function offsetWithin(element, container) {
  let left = 0
  let top = 0
  for (let node = element; node && node !== container; node = node.offsetParent) {
    left += node.offsetLeft
    top += node.offsetTop
    const parent = node.offsetParent
    if (parent && parent !== container) {
      left += parent.clientLeft
      top += parent.clientTop
    }
  }
  return { left, top }
}

// Each line of the paragraphs sits under a bar (styles.css .marker-bar), laid over it again whenever
// the lines break differently, until the trigger is reached or the delay has passed; then the bars
// draw back toward the end of their lines, one line after another through all the paragraphs.
// `also` names elements that are covered whole, like words, such as a button in a line; their own
// text is left as it is.
export function markerReveal(paragraphs, { gsap, ScrollTrigger }, { scrollTrigger, delay = 0, also } = {}) {
  const parts = paragraphs.filter(Boolean).map((paragraph) => {
    const { restore } = splitText(paragraph, 'words', also)
    return { paragraph, restore, boxes: [...paragraph.querySelectorAll(also ? `.split-unit, ${also}` : '.split-unit')] }
  })
  if (!parts.some(({ boxes }) => boxes.length)) {
    for (const { restore } of parts) restore()
    return
  }
  let bars = []
  let shown = false
  const cover = () => {
    if (shown) return
    for (const bar of bars) bar.remove()
    bars = parts.flatMap(({ paragraph, boxes }) => {
      paragraph.classList.add('is-marked')
      const overhang = MARKER_OVERHANG * parseFloat(getComputedStyle(paragraph).fontSize)
      // Words that are not shown (the deck help's prefix on a narrow phone) have no box to cover.
      const words = boxes
        .filter((box) => box.getClientRects().length)
        .map((box) => {
          const { left, top } = offsetWithin(box, paragraph)
          const edges = { left, top, right: left + box.offsetWidth, bottom: top + box.offsetHeight }
          if (box.classList.contains('split-unit')) return edges
          // A whole element is covered over its content, not its padding: the deck help's button
          // pads its one line of text out to a 44px target.
          const style = getComputedStyle(box)
          const side = (name) => parseFloat(style[name]) || 0
          return {
            left: edges.left + side('borderLeftWidth') + side('paddingLeft'),
            top: edges.top + side('borderTopWidth') + side('paddingTop'),
            right: edges.right - side('borderRightWidth') - side('paddingRight'),
            bottom: edges.bottom - side('borderBottomWidth') - side('paddingBottom'),
          }
        })
      return lineBoxes(words).map((line) => {
        const bar = document.createElement('span')
        bar.className = 'marker-bar'
        bar.setAttribute('aria-hidden', 'true')
        bar.style.cssText = `left:${line.left - overhang}px;top:${line.top}px;width:${line.right - line.left + 2 * overhang}px;height:${line.bottom - line.top}px`
        paragraph.append(bar)
        return bar
      })
    })
  }
  cover()
  const lines = new ResizeObserver(cover)
  for (const { paragraph } of parts) lines.observe(paragraph)
  const fonts = Promise.race([document.fonts?.ready, new Promise((resolve) => setTimeout(resolve, MARKER_FONT_WAIT))])
  fonts.then(cover)
  let due = false
  const show = () => {
    if (due) return
    due = true
    // Measured once more with the page's own fonts, so each bar fits the line it uncovers.
    fonts.then(() => {
      cover()
      shown = true
      lines.disconnect()
      gsap.to(bars, {
        scaleX: 0,
        duration: MARKER_SECONDS,
        ease: 'power3.inOut',
        stagger: MARKER_STAGGER,
        onComplete: () => {
          for (const bar of bars) bar.remove()
          for (const { paragraph, restore } of parts) {
            restore()
            paragraph.classList.remove('is-marked')
          }
        },
      })
    })
  }
  // A page opened or reloaded below the text passes the trigger without entering it; that shows it too.
  if (scrollTrigger) ScrollTrigger.create({ ...scrollTrigger, once: true, onEnter: show, onLeave: show })
  else gsap.delayedCall(delay, show)
}
