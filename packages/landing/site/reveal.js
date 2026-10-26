// Text that arrives like chat, after monochrome-studio.com. A heading types in letter by letter
// as it comes into view; the How it plays lead lights up word by word with the scroll, the newest
// words in light violet, like a karaoke line. Letters and words are wrapped in plain inline spans,
// so kerning, line breaks and screen readers see the same text; a typed heading gets its original
// text back once it has finished. Reduced motion or no GSAP: the text is simply there.

export const TYPE_STEP = 0.045 // seconds between letters
export const TYPE_MAX = 1.4 // a whole heading types in at most this long
export const typeStagger = (count) => (count ? Math.min(count * TYPE_STEP, TYPE_MAX) / count : 0)

// Splits on ordinary spaces only, so a non-breaking space keeps its words together.
export const splitWords = (text) => text.split(/([ \t\n\r\f]+)/).filter(Boolean)

// Wraps the element's letters or words in spans and returns them, with a way to undo it.
export function splitText(element, unit = 'chars') {
  const original = [...element.childNodes].map((node) => node.cloneNode(true))
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const texts = []
  while (walker.nextNode()) texts.push(walker.currentNode)
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
  return { units, restore: () => element.replaceChildren(...original) }
}

// The heading types in once, when it comes into view (or after a delay, for the hero).
export function typeIn(element, gsap, { delay = 0, scrollTrigger } = {}) {
  if (!element) return
  const { units, restore } = splitText(element, 'chars')
  gsap.fromTo(
    units,
    { opacity: 0 },
    { opacity: 1, duration: 0.12, ease: 'none', stagger: typeStagger(units.length), delay, scrollTrigger, onComplete: restore }
  )
}

// Words go from dim to light violet to their own color as the scroll passes through the range.
export function karaoke(paragraphs, gsap, scrollTrigger) {
  const words = paragraphs.flatMap((paragraph) => splitText(paragraph, 'words').units)
  if (!words.length) return
  const finals = words.map((word) => getComputedStyle(word).color)
  gsap.set(words, { color: 'rgb(255 255 255 / 30%)' })
  gsap
    .timeline({ scrollTrigger: { scrub: 0.4, ...scrollTrigger } })
    .to(words, { color: '#d5baff', duration: 1, stagger: 0.4, ease: 'none' }, 0)
    .to(words, { color: (index) => finals[index], duration: 1, stagger: 0.4, ease: 'none' }, 1)
}
