import { copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../selected-cards/', import.meta.url))

function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('Selected-card staging hook changed; refusing an incomplete preview')
  return text.replace(before, after)
}

// Install the approved presentation into either unpublished build tree. Card
// Lab stays dev-only; these public modules never load its React app or controls.
export async function installSelectedCards({ environment, stagingSite }) {
  if (!['dev', 'prod'].includes(environment) || basename(stagingSite) !== `site-${environment}`) throw new Error('Selected cards require a matching site-dev or site-prod staging tree')
  const indexPath = join(stagingSite, 'index.html')
  const appPath = join(stagingSite, 'app.js')
  let [html, app] = await Promise.all([readFile(indexPath, 'utf8'), readFile(appPath, 'utf8')])
  const prism = await lstat(join(stagingSite, 'assets/card-deck/back-prism.webp'))
  if (!prism.isFile() || prism.isSymbolicLink()) throw new Error('The selected Prism back is missing from the build')

  html = replaceOnce(html, '<script type="module" src="/app.js"></script>', '<link rel="stylesheet" href="/assets/card-deck/selected-cards.css" />\n    <script type="module" src="/app.js"></script>')
  app = "import { cardFace as selectedCardFace, prepareSelectedScenes, revealSelectedCard, pauseSelectedReveal, settleSelectedCard, warmSelectedArt } from '/assets/card-deck/selected-cards.js'\n" + app
  app = replaceOnce(app, 'initNav()\n', 'prepareSelectedScenes(cards)\ninitNav()\n')
  const first = app.indexOf('function cardFace(card) {')
  const last = app.indexOf("\nconst hand = $('deck-hand')", first)
  if (first < 0 || last < first || app.indexOf('function cardFace(card) {', first + 1) >= 0) throw new Error('The landing card factory changed')
  app = app.slice(0, first) + 'const cardFace = (card) => selectedCardFace(card, cards.length)\n' + app.slice(last)
  app = replaceOnce(app,
    `  items.forEach((item, index) => {
    if (Math.abs(wrapOffset(index, around, items.length)) > 3) return
    const image = item.querySelector('img')
    if (!image.getAttribute('src')) image.src = image.dataset.src
  })`,
    '  warmSelectedArt(items, around)')
  app = replaceOnce(app, '    warmArt(index)\n', '    pauseSelectedReveal()\n    warmArt(index)\n')
  app = replaceOnce(app, '  onSettle(index, { deliberate } = {}) {\n', '  onSettle(index, { deliberate } = {}) {\n    settleSelectedCard(items[index])\n')
  app = replaceOnce(app, "hand.addEventListener('keydown', (event) => {", "settleSelectedCard(items[deck.front])\n\nhand.addEventListener('keydown', (event) => {")
  app = replaceOnce(app, '  if (event.button !== 0 || !event.isPrimary || drag) return\n', '  if (event.button !== 0 || !event.isPrimary || drag) return\n  pauseSelectedReveal()\n')
  app = replaceOnce(app,
    "hand.addEventListener('lostpointercapture', (event) => endDrag(event))",
    "hand.addEventListener('lostpointercapture', (event) => {\n  if (event.target === hand) endDrag(event)\n})")
  app = replaceOnce(app, '    if (!entries[0].isIntersecting) return\n', '    if (!entries.at(-1)?.isIntersecting) return\n')
  app = replaceOnce(app,
    "new IntersectionObserver((entries) => hand.classList.toggle('is-live', entries[0].isIntersecting), { threshold: 0.35 }).observe(hand)",
    "new IntersectionObserver((entries) => {\n  const latest = entries.at(-1)\n  if (!latest) return\n  hand.classList.toggle('is-live', latest.isIntersecting)\n  revealSelectedCard(items[wrapIndex(deck.target, items.length)])\n}, { threshold: 0.35 }).observe(hand)")
  const target = join(stagingSite, 'assets/card-deck')
  await mkdir(target, { recursive: true })
  await Promise.all(['selected-cards.js', 'selected-cards.css'].map(file => copyFile(join(source, file), join(target, file))))
  await Promise.all([writeFile(appPath, app), writeFile(indexPath, html)])
  return true
}
