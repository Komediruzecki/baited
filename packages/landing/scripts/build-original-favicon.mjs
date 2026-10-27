import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Reuse the approved wordmark's B at tab size. No generated or redrawn letterform.
const source = new URL('../site/assets/brand/baited-logo-white.webp', import.meta.url)
const target = new URL('../site/assets/brand/baited-favicon.png', import.meta.url)
const data = `data:image/webp;base64,${(await readFile(source)).toString('base64')}`
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const result = await page.evaluate(async (url) => {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#391879'
    ctx.beginPath()
    ctx.roundRect(0, 0, 256, 256, 40)
    ctx.fill()
    // The gap before A begins after column 134 in the approved 764 × 225 file.
    ctx.drawImage(image, 0, 0, 134, 225, 61, 15.5, 134, 225)
    return canvas.toDataURL('image/png').split(',')[1]
  }, data)
  await writeFile(target, Buffer.from(result, 'base64'))
  console.log('Built the BAITED favicon from the original B.')
} finally {
  await browser.close()
}
