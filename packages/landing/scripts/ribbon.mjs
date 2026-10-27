import { lstat, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ribbonSource = fileURLToPath(new URL('../ribbon/', import.meta.url))
const ribbonFiles = ['ribbon.js', 'ribbon-geometry.js', 'ribbon.css']

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Ribbon staging hook changed; refusing an incomplete preview')
  return source.replace(before, after)
}

// The approved ribbon is layered after selected-card and presented-deck staging
// in both environments. It does not depend on the dev-only Card Lab.
export async function installRibbon({ environment, stagingSite }) {
  if (!['dev', 'prod'].includes(environment) || basename(stagingSite) !== `site-${environment}`) throw new Error('Ribbon requires a matching site-dev or site-prod staging tree')
  const target = join(stagingSite, 'assets/card-deck')
  for (const file of ['selected-cards.js', 'presented-deck.js']) {
    const stat = await lstat(join(target, file))
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Ribbon requires selected-card and presented-deck staging first')
  }
  const appPath = join(stagingSite, 'app.js')
  const htmlPath = join(stagingSite, 'index.html')
  let [app, html] = await Promise.all([readFile(appPath, 'utf8'), readFile(htmlPath, 'utf8')])
  if (!app.includes("from '/assets/card-deck/selected-cards.js'") || !app.includes("from '/assets/card-deck/presented-deck.js'")) {
    throw new Error('Ribbon requires selected-card and presented-deck staging first')
  }
  html = replaceOnce(html,
    '<link rel="stylesheet" href="/assets/card-deck/selected-cards.css" />',
    '<link rel="stylesheet" href="/assets/card-deck/selected-cards.css" />\n    <link rel="stylesheet" href="/assets/card-deck/ribbon.css" />')
  app = replaceOnce(app, 'const deck = createDeck({\n  hand,\n  items,',
    `const deck = createRibbonDeck({
  createDeck,
  hand,
  items,
  cards,
  status: $('deck-status'),
  help: $('deck-help'),
  pauseReveal: pauseSelectedReveal,
  settleReveal: settleSelectedCard,
  warmArt: (around, before, after) => { if (deckNear) warmSelectedArt(items, around, before, after) },`)
  app = replaceOnce(app, 'let drag = null\n',
    `let drag = null
hand.addEventListener('ribboncancelinput', () => {
  if (drag) endDrag({ pointerId: drag.id }, true)
})
`)
  app = replaceOnce(app, '  if (!ended.active) {\n',
    `  if (cancelled) {
    deck.cancel()
    return
  }
  if (!ended.active) {
`)
  app = replaceOnce(app, '  if (event.target === hand) endDrag(event)\n',
    '  if (event.target === hand) endDrag(event, true)\n')
  app = "import { createRibbonDeck } from '/assets/card-deck/ribbon.js'\n" + app

  // Read every module only after all hooks validate, and write nothing unless
  // the complete controller, geometry and stylesheet are ordinary source files.
  const assets = await Promise.all(ribbonFiles.map(async file => {
    const source = join(ribbonSource, file)
    const stat = await lstat(source)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Ribbon assets must be regular source files')
    return { file, contents: await readFile(source) }
  }))
  await Promise.all(assets.map(({ file, contents }) => writeFile(join(target, file), contents)))
  await Promise.all([writeFile(appPath, app), writeFile(htmlPath, html)])
  return true
}
