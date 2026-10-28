import { chapters } from './data.js'
import { CLEARED_EVENT } from './pixels.js'

const video = document.getElementById('hero-film')
const frame = document.getElementById('film-frame')
const toggle = document.getElementById('film-toggle')
const sound = document.getElementById('film-sound')
const state = document.getElementById('film-state')
const bigPlay = document.getElementById('film-big-play')
const stills = document.getElementById('film-stills')
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
let ratio = 0
let inView = false
let pageActive = true
let userPaused = false
let explicitPlay = false
let blocked = false
let failed = false
let switching = false
let pendingSeek = null
let expectedSource = ''
let requestId = 0
let pendingPlay = null
let entryTimer
let soundOn = false
let triedMp4 = false
let stillsBuilt = false
let hudTimer
// The film waits while the arrival curtain is up (pixels.js), so it starts from its first frame
// once the page can be seen. If the curtain never announces it has gone, the plain cover fades by
// itself after 2.5 s (pixels.css), and the film starts then.
let curtainUp = !!document.querySelector('.pixel-curtain:not(.is-covering)') || document.documentElement.classList.contains('pixel-boot')
// Under the sheet that slides over the showreel the film rests (showreel.js), and goes quiet as it
// does when it leaves the screen; so does a round started with its sound when the page scrolls away.
let covered = !!document.getElementById('showreel')?.classList.contains('is-covered')
document.addEventListener('showreel:covered', (event) => {
  covered = !!event.detail
  if (covered && soundOn) mute()
  reconcile()
})
document.addEventListener('showreel:unwatch', () => {
  if (soundOn) mute()
})

function make(tag, text, className) {
  const element = document.createElement(tag)
  if (text !== undefined) element.textContent = text
  if (className) element.className = className
  return element
}
function renderStills() {
  if (!stillsBuilt) {
    chapters.forEach((chapter, index) => {
      const figure = make('figure')
      const image = make('img')
      image.alt = chapter.label
      image.loading = 'lazy'
      image.decoding = 'async'
      image.dataset.chapter = String(index + 1).padStart(2, '0')
      figure.append(image, make('figcaption', chapter.text))
      stills.append(figure)
    })
    stillsBuilt = true
  }
  stills.querySelectorAll('img').forEach((image) => {
    const path = `/media/chapter-${image.dataset.chapter}.avif`
    if (image.getAttribute('src') !== path) image.src = path
    image.width = 1280
    image.height = 720
  })
}
function shouldPlay() {
  return (
    inView && pageActive && !curtainUp && !covered && !document.hidden && !userPaused && !blocked && !failed && !switching && (!reduced.matches || explicitPlay)
  )
}
function updateControls() {
  const active = !video.paused || pendingPlay !== null
  const label = active ? 'Pause' : 'Play'
  frame.classList.toggle('is-paused', !active)
  toggle.setAttribute('aria-label', `${label} the example`)
  toggle.setAttribute('aria-busy', String(pendingPlay !== null))
  document.getElementById('film-toggle-icon').setAttribute('href', active ? '#i-pause' : '#i-play')
  sound.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on')
  sound.setAttribute('aria-pressed', String(soundOn))
  document.getElementById('film-sound-icon').setAttribute('href', soundOn ? '#i-sound' : '#i-muted')
  bigPlay.hidden = !video.paused || failed || switching || (!blocked && !(reduced.matches && !explicitPlay) && !userPaused)
  const message = failed
    ? "The film didn't load. Here's the round in seven frames."
    : blocked
      ? 'Press play to watch.'
      : switching || pendingPlay !== null
        ? 'Loading the film…'
        : !video.paused
          ? soundOn
            ? 'Sound on.'
            : 'Sound off.'
          : reduced.matches && !explicitPlay
            ? 'Play the film.'
            : 'Paused.'
  if (state.textContent !== message) state.textContent = message
  const showStills = failed || (reduced.matches && !explicitPlay)
  stills.hidden = !showStills
  if (showStills) renderStills()
}
function mute() {
  soundOn = false
  video.muted = true
  updateControls()
}
function pauseForPolicy() {
  requestId++
  pendingPlay = null
  video.pause()
  updateControls()
}
function reconcile() {
  if (!shouldPlay()) {
    pauseForPolicy()
    return
  }
  if (!video.paused || pendingPlay !== null) {
    updateControls()
    return
  }
  const id = ++requestId
  pendingPlay = id
  video.muted = !soundOn
  updateControls()
  Promise.resolve(video.play())
    .then(() => {
      if (id !== requestId) {
        if (!shouldPlay()) video.pause()
        return
      }
      pendingPlay = null
      if (!shouldPlay()) video.pause()
      updateControls()
    })
    .catch(() => {
      if (id !== requestId) return
      pendingPlay = null
      blocked = true
      video.pause()
      updateControls()
    })
}
function restorePosition() {
  if (pendingSeek === null || !Number.isFinite(video.duration)) return
  try {
    if (pendingSeek > 0 || video.currentTime !== 0) video.currentTime = Math.max(0, Math.min(pendingSeek, video.duration - 0.05))
    pendingSeek = null
  } catch {
    /* Retry once media is seekable. */
  }
}
// Phones play the same 16:9 film as desktops, with the chat on the right, as the owner asked.
function sourcePath(mp4 = false) {
  const webmType = video.dataset.webmType
  return !mp4 && webmType && video.canPlayType(webmType) ? video.dataset.webm : video.dataset.src
}
function selectSource(force = false, mp4 = false) {
  const source = sourcePath(mp4) || sourcePath(true)
  if (stillsBuilt) renderStills()
  if (!source) return
  const absolute = new URL(source, document.baseURI).href
  if (!force && absolute === expectedSource) return
  if (pendingSeek === null) pendingSeek = Number.isFinite(video.currentTime) ? video.currentTime : 0
  switching = true
  failed = false
  if (!mp4) triedMp4 = false
  expectedSource = absolute
  pauseForPolicy()
  video.src = source
  video.load()
  updateControls()
}
function requestPlay(fromStart = false) {
  userPaused = false
  explicitPlay = true
  blocked = false
  if (ratio > 0) inView = true
  if (fromStart) {
    pendingSeek = 0
    restorePosition()
  }
  if (failed) {
    selectSource(true, true)
    return
  }
  reconcile()
}
function togglePlay() {
  if (!video.paused || pendingPlay !== null) {
    userPaused = true
    pauseForPolicy()
  } else requestPlay()
}
function jumpChapter(index) {
  pendingSeek = chapters[Math.max(0, Math.min(chapters.length - 1, index))].time
  restorePosition()
  if (!userPaused && !reduced.matches) requestPlay()
}
toggle.addEventListener('click', togglePlay)
// The footer's "Watch the round": the round from the start, with its sound on (showreel.js).
document.addEventListener('showreel:watch', () => {
  soundOn = true
  video.muted = false
  requestPlay(true)
})
bigPlay.addEventListener('click', () => requestPlay())
sound.addEventListener('click', () => {
  soundOn = !soundOn
  video.muted = !soundOn
  updateControls()
})
// The pause and sound buttons sit in the corner of the film. A mouse click on the picture
// plays or pauses it; a tap shows the buttons for a moment, like a phone video player.
function showHud() {
  frame.classList.add('is-hud')
  clearTimeout(hudTimer)
  hudTimer = setTimeout(() => frame.classList.remove('is-hud'), 2600)
}
video.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'mouse') {
    if (event.button === 0) togglePlay()
  } else if (video.paused && pendingPlay === null) requestPlay()
  else showHud()
})
frame.addEventListener('focusin', () => clearTimeout(hudTimer))
frame.addEventListener('keydown', (event) => {
  if (event.target !== frame && event.target !== video) return
  if (event.code === 'Space' || event.key.toLowerCase() === 'k') {
    event.preventDefault()
    togglePlay()
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const index = chapters.findLastIndex((chapter) => chapter.time <= video.currentTime + 0.1)
    jumpChapter(index + (event.key === 'ArrowLeft' ? -1 : 1))
  }
})
video.addEventListener('loadedmetadata', () => {
  if (expectedSource && video.currentSrc !== expectedSource) return
  restorePosition()
  switching = false
  reconcile()
})
video.addEventListener('canplay', () => {
  restorePosition()
  switching = false
  reconcile()
})
video.addEventListener('playing', () => {
  if (!shouldPlay()) pauseForPolicy()
  else updateControls()
})
video.addEventListener('pause', updateControls)
video.addEventListener('error', () => {
  if (!triedMp4 && !expectedSource.endsWith('.mp4')) {
    triedMp4 = true
    selectSource(true, true)
    return
  }
  failed = true
  switching = false
  pauseForPolicy()
})
function setVisibility(nextRatio) {
  ratio = nextRatio
  clearTimeout(entryTimer)
  if (ratio < 0.25) {
    inView = false
    if (soundOn) mute()
    reconcile()
  } else if (ratio >= 0.6)
    entryTimer = setTimeout(() => {
      inView = true
      reconcile()
    }, 300)
}
// On its own the film is in view while most of the video is. In the showreel (showreel.js) it is
// first the hero's card, then the player in the middle of the screen, and one of the two is always
// on screen while the hero or the showreel is; the sheet that covers it later pauses it instead
// (covered, above).
const flight = document.documentElement.classList.contains('has-showreel')
const watched = flight ? [document.querySelector('.hero'), document.getElementById('showreel')].filter(Boolean) : [video]
const ratios = new Map()
const visibility = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0)
    const ratio = Math.max(...ratios.values())
    setVisibility(flight ? (ratio > 0 ? 1 : 0) : ratio)
  },
  { threshold: [0, 0.25, 0.6, 1] }
)
for (const element of watched) visibility.observe(element)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) mute()
  reconcile()
})
window.addEventListener('pagehide', () => {
  pageActive = false
  mute()
  pauseForPolicy()
  clearTimeout(entryTimer)
})
window.addEventListener('pageshow', () => {
  pageActive = true
  mute()
  reconcile()
})
reduced.addEventListener('change', () => {
  if (reduced.matches) explicitPlay = false
  reconcile()
})
video.autoplay = false
video.loop = true
video.muted = true
video.defaultMuted = true
video.playsInline = true
video.controls = false
video.pause()
const curtainGone = () => {
  if (!curtainUp) return
  curtainUp = false
  reconcile()
}
document.addEventListener(CLEARED_EVENT, curtainGone, { once: true })
if (curtainUp) setTimeout(curtainGone, 2600)
selectSource()
updateControls()
