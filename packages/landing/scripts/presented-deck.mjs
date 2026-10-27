import { lstat, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Presented-deck staging hook changed; refusing an incomplete preview')
  return source.replace(before, after)
}

function withPresentation(source) {
  source = replaceOnce(source,
    'export function createDeck({ hand, items, gsap, reduced, onFront, onSettle }) {',
    'export function createDeck({ hand, items, gsap, reduced, onFront, onSettle, presentation }) {')
  source = replaceOnce(source,
    '  let spread = 1\n',
    '  let spread = 1\n  let room = 0\n  const metrics = () => ({ width, height, zoom, room, count })\n')
  source = replaceOnce(source,
    '    spread = hand.clientWidth ? fanSpread(hand.clientWidth / zoom, width, height) : 1\n',
    '    room = hand.clientWidth / zoom\n    spread = room ? fanSpread(room, width, height) : 1\n')
  source = replaceOnce(source,
    '  function render() {\n    const direction = Math.sign(target - state.position)\n',
    '  function render() {\n    const direction = Math.sign(target - state.position)\n    const frameMetrics = metrics()\n    const visibleIndices = []\n')
  source = replaceOnce(source,
    '      const pose = fanPose(d, width, height, spread)\n',
    '      const originalPose = fanPose(d, width, height, spread)\n      const pose = presentation?.pose?.(d, frameMetrics, originalPose) ?? originalPose\n')
  source = replaceOnce(source,
    '      if (!pose.visible) return\n',
    '      if (!pose.visible) return\n      visibleIndices.push(index)\n')
  source = replaceOnce(source,
    '      if (shades[index]) shades[index].style.opacity = pose.dim.toFixed(3)\n    })\n  }\n',
    '      if (shades[index]) shades[index].style.opacity = pose.dim.toFixed(3)\n    })\n    presentation?.onRender?.({ position: state.position, target, front, metrics: frameMetrics, visibleIndices })\n  }\n')
  source = replaceOnce(source,
    '    to,\n    next: () => to(target + 1, { deliberate: true }),\n',
    `    get metrics() {
      return metrics()
    },
    redraw: render,
    suspend() {
      tween?.kill()
      liftTween?.kill()
      tween = null
      liftTween = null
      lift.value = 0
      render()
      return state.position
    },
    snap(index, details = {}) {
      tween?.kill()
      liftTween?.kill()
      tween = null
      liftTween = null
      lift.value = 0
      target = Math.round(index)
      setFront(target, details)
      settle(details)
    },
    to,
    next: () => to(target + 1, { deliberate: true }),
`)
  return source
}

// Opt-in dev staging seam. No motion controller is created here, and the copied
// fan retains its original behavior when no presentation callback is supplied.
export async function installPresentedDeck({ environment, stagingSite }) {
  if (environment === 'prod') return false
  if (environment !== 'dev' || basename(stagingSite) !== 'site-dev') throw new Error('Presented deck requires a site-dev staging tree')
  const directory = join(stagingSite, 'card-lab/landing')
  const selected = await lstat(join(directory, 'selected-cards.js'))
  if (!selected.isFile() || selected.isSymbolicLink()) throw new Error('Presented deck requires the selected-card staging installer first')
  const appPath = join(stagingSite, 'app.js')
  const [app, deck] = await Promise.all([readFile(appPath, 'utf8'), readFile(join(stagingSite, 'deck.js'), 'utf8')])
  const nextApp = replaceOnce(app,
    "import { createDeck, wrapIndex, wrapOffset } from './deck.js'",
    "import { createDeck, wrapIndex, wrapOffset } from '/card-lab/landing/presented-deck.js'")
  if (!app.includes("from '/card-lab/landing/selected-cards.js'")) throw new Error('Presented deck requires the selected-card staging installer first')
  const nextDeck = withPresentation(deck)
  // Resolve and validate every hook before changing the unpublished staging tree.
  await writeFile(join(directory, 'presented-deck.js'), nextDeck)
  await writeFile(appPath, nextApp)
  return true
}
