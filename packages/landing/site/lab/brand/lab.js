import { initBrand } from '/brand.js'

const template = document.getElementById('brand-template')
for (const slot of document.querySelectorAll('[data-hand]')) {
  const fragment = template.content.cloneNode(true)
  const mark = slot.closest('[data-mark]').dataset.mark
  fragment.querySelector('.brand').href = `#proof-${mark}`
  slot.replaceChildren(fragment)
}
initBrand()
