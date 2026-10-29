// The small scenes inside the "How it plays" step cards, animated with GSAP:
//   1. Chat's screen: the BIRTHDAY card is dealt and flips face up.
//   2. Twitch chat: hints keep arriving and the chat scrolls up, a seamless endless loop.
//   3. Streamer's screen: the facecam talks over the fishing game and the round clock runs.
//   4. Round over: the speech check hears BIRTHDAY, boxes it and tags it "Detected".
// The round is the trailer's (media/hero-desktop.*): streamer bateoh, his chat and his slip.
//
// why-stack.js says when the cards move (mode), which card is at the front (front) and when a
// card has arrived (reveal). Loops run only for the front card while the section is on screen.
// With reduced motion, without GSAP or without the stack, every scene shows its final picture,
// which is also what the HTML contains.

export const CHAT_PACE = [1.25, 0.9, 1.6, 1.05, 0.75, 1.4, 1.15, 0.85, 1.7, 1.0, 1.3, 0.95] // seconds between messages
export const TALK_BEATS = [0.22, 0.12, 0.18, 0.1, 0.3, 0.14, 0.2, 0.55, 0.16, 0.1, 0.24, 0.12, 0.34, 0.8] // talk, rest, talk, rest...
export const ROUND_LENGTH = 120 // a round lasts two minutes
export const ROUND_SECONDS = 102 // time left when the scene starts: 01:42

// 01:42 style clock text for a number of seconds.
export function clockText(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function initWhyScenes(section, { gsap } = {}) {
  const scenes = [...section.querySelectorAll('.why-card')].map((card) => {
    if (!gsap) return {}
    if (card.querySelector('.why-deal')) return dealScene(card, gsap)
    if (card.querySelector('.why-chat')) return chatScene(card, gsap)
    if (card.querySelector('.why-stream')) return streamScene(card, gsap)
    if (card.querySelector('.why-catch')) return catchScene(card, gsap)
    return {}
  })
  let mode = 'still'
  let shown = -1
  let inView = false

  function sync() {
    const run = mode === 'motion' && inView && !document.hidden
    scenes.forEach((scene, index) => (run && index === shown ? scene.play?.() : scene.pause?.()))
  }
  new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting
    sync()
  }).observe(section)
  document.addEventListener('visibilitychange', sync)

  return {
    mode(next) {
      mode = next === 'motion' && gsap ? 'motion' : 'still'
      scenes.forEach((scene) => (mode === 'motion' ? scene.ready?.() : scene.finish?.()))
      sync()
    },
    front(index) {
      shown = index
      sync()
    },
    reveal(index) {
      if (mode === 'motion') scenes[index]?.reveal?.()
    },
  }
}

// 1. The card waits face down and flips over once its step card has arrived. It deals only once.
function dealScene(card, gsap) {
  const flip = card.querySelector('.why-deal__card')
  let state = 'face' // 'face' | 'waiting' | 'dealt'
  return {
    ready() {
      if (state !== 'face') return
      state = 'waiting'
      gsap.set(flip, { rotationY: 180, y: 14, transformPerspective: 1200 })
    },
    reveal() {
      if (state !== 'waiting') return
      state = 'dealt'
      gsap
        .timeline({
          onComplete: () => {
            gsap.set(flip, { clearProps: 'transform' }) // back to a flat, crisp card
            flip.classList.add('is-glinting') // and the foil catches the light once
          },
        })
        .to(flip, { y: -10, duration: 0.3, ease: 'power2.out' }, 0)
        .to(flip, { rotationY: 0, duration: 0.8, ease: 'power3.inOut' }, 0.08)
        .to(flip, { y: 0, duration: 0.45, ease: 'power2.inOut' }, 0.5)
    },
    finish() {
      if (state === 'waiting') state = 'face'
      gsap.killTweensOf(flip)
      gsap.set(flip, { clearProps: 'transform' })
      flip.classList.remove('is-glinting')
    },
  }
}

// 2. Messages arrive one by one at an uneven pace. The whole script repeats, so the chat never ends.
function chatScene(card, gsap) {
  const feed = card.querySelector('.why-chat__feed')
  const script = [...feed.children].map((line) => line.cloneNode(true))
  const SHOWN = 6 // messages already in chat when the scene starts
  const KEEP = 14 // lines kept in the feed; older ones have long scrolled out of sight
  let next = SHOWN % script.length
  let beat = 0
  let call = null
  let running = false
  let prepared = false

  function push() {
    const line = script[next].cloneNode(true)
    next = (next + 1) % script.length
    feed.append(line)
    while (feed.children.length > KEEP) feed.firstElementChild.remove()
    const rise = line.offsetHeight + (Number.parseFloat(getComputedStyle(feed).rowGap) || 0)
    gsap.fromTo(feed, { y: rise }, { y: 0, duration: 0.45, ease: 'power2.out', overwrite: true })
    gsap.fromTo(line, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power1.out' })
    call = gsap.delayedCall(CHAT_PACE[beat++ % CHAT_PACE.length], push)
  }
  return {
    ready() {
      if (prepared) return
      prepared = true
      feed.replaceChildren(...script.slice(0, SHOWN).map((line) => line.cloneNode(true)))
    },
    play() {
      if (running) return
      running = true
      if (call) call.resume()
      else call = gsap.delayedCall(0.6, push)
    },
    pause() {
      if (!running) return
      running = false
      call?.pause()
    },
    finish() {
      running = false
      prepared = false
      call?.kill()
      call = null
      next = SHOWN % script.length
      beat = 0
      gsap.killTweensOf(feed)
      gsap.set(feed, { clearProps: 'transform' })
      feed.replaceChildren(...script.map((line) => line.cloneNode(true)))
    },
  }
}

// 3. A facecam that talks (two frames of the trailer's, mouth shut and open) and a ticking round clock.
function streamScene(card, gsap) {
  const cam = card.querySelector('.why-stream__cam')
  const clock = card.querySelector('[data-why-clock]')
  const timer = card.querySelector('[data-why-timer]')
  let seconds = ROUND_SECONDS
  let beat = 0
  let talking = false
  let tick = null
  let mouth = null
  let running = false

  function countDown() {
    seconds = seconds > 0 ? seconds - 1 : ROUND_SECONDS
    clock.textContent = clockText(seconds)
    gsap.to(timer, { scaleX: seconds / ROUND_LENGTH, duration: 0.6, ease: 'power1.out' })
    tick = gsap.delayedCall(1, countDown)
  }
  function speak() {
    talking = !talking
    cam.classList.toggle('is-talking', talking)
    mouth = gsap.delayedCall(TALK_BEATS[beat++ % TALK_BEATS.length], speak)
  }
  return {
    ready() {},
    play() {
      if (running) return
      running = true
      if (tick) tick.resume()
      else tick = gsap.delayedCall(1, countDown)
      if (mouth) mouth.resume()
      else mouth = gsap.delayedCall(0.4, speak)
    },
    pause() {
      if (!running) return
      running = false
      tick?.pause()
      mouth?.pause()
    },
    finish() {
      running = false
      tick?.kill()
      mouth?.kill()
      tick = mouth = null
      talking = false
      cam.classList.remove('is-talking')
      seconds = ROUND_SECONDS
      clock.textContent = clockText(seconds)
      gsap.killTweensOf(timer)
      gsap.set(timer, { clearProps: 'transform' })
    },
  }
}

// 4. The new line of speech arrives as plain text; then BIRTHDAY lights up, the box draws and the tag pops.
function catchScene(card, gsap) {
  const scene = card.querySelector('.why-catch')
  const quote = card.querySelector('.why-catch__quote')
  const word = card.querySelector('.why-catch__word')
  const tag = card.querySelector('.why-catch__tag')
  const result = [...card.querySelectorAll('.why-catch__result > *')]
  let state = 'shown' // 'shown' | 'waiting' | 'done'
  let intro = null
  return {
    ready() {
      if (state !== 'shown') return
      state = 'waiting'
      gsap.set(quote, { opacity: 0, y: 8 })
      gsap.set(word, { '--draw': 0, color: '#e8dfee' })
      gsap.set(tag, { opacity: 0, scale: 0.6 })
      gsap.set(result, { opacity: 0, y: 6 })
    },
    reveal() {
      if (state !== 'waiting') return
      state = 'done'
      intro = gsap
        .timeline({ delay: 0.2 })
        .to(quote, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 0)
        .to(word, { color: '#f8a7d4', duration: 0.25 }, 0.45) // BIRTHDAY's own color
        .to(word, { '--draw': 1, duration: 0.5, ease: 'power2.inOut' }, 0.45)
        .to(tag, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2.2)' }, 0.85)
        .to(result, { opacity: 1, y: 0, duration: 0.3, stagger: 0.12, ease: 'power2.out' }, 1.1)
    },
    play() {
      scene.classList.add('is-live')
    },
    pause() {
      scene.classList.remove('is-live')
    },
    finish() {
      if (state === 'waiting') state = 'shown'
      intro?.kill()
      gsap.set([quote, word, tag, ...result], { clearProps: 'all' })
      scene.classList.remove('is-live')
    },
  }
}
