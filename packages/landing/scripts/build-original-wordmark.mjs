import { readFile, writeFile } from 'node:fs/promises'

// Keep the supplied JPEG intact. This display mask uses its luminance as alpha
// so the original lettering can take the site's ink color without a paper box.
const source = new URL('../site/assets/brand/baited-original.jpg', import.meta.url)
const target = new URL('../site/assets/brand/baited-original-mask.svg', import.meta.url)
const jpeg = await readFile(source)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="376" viewBox="0 0 1280 376">
  <title>BAITED original wordmark</title>
  <filter id="ink" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.333333 -0.333333 -0.333333 0 1"/>
    <feComponentTransfer><feFuncA type="linear" slope="1.15" intercept="-0.08"/></feComponentTransfer>
  </filter>
  <image width="1280" height="376" filter="url(#ink)" href="data:image/jpeg;base64,${jpeg.toString('base64')}"/>
</svg>
`
await writeFile(target, svg)
