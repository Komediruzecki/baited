// The navigation, after monochrome-studio.com's header: a dark pill centred at the top with the
// logo, the section links and the chat button. While the visitor keeps scrolling down it folds to
// the logo and the chat button, and it opens again as soon as they scroll up, reach the top, or
// move keyboard focus into it. When the footer fills the top of the screen the bar steps away: the
// footer has its own contact button, pages and way back to the top.
// The styles are in styles.css (.site-nav); without JavaScript the bar simply stays open.

export const FLOAT_AT = 80 // px scrolled before the bar becomes a pill
export const FOLD_AT = 320 // px scrolled before scrolling down folds it
export const AWAY_AT = 72 // the bar steps away once the footer's top is this close to the top

// The next state of the bar for a new scroll position. A few pixels of jitter change nothing.
export function navState({ y, lastY, folded }) {
  const floating = y > FLOAT_AT
  if (!floating || y < FOLD_AT) return { floating, folded: false }
  if (y > lastY + 4) return { floating, folded: true }
  if (y < lastY - 4) return { floating, folded: false }
  return { floating, folded }
}

export const navAway = (footerTop) => footerTop <= AWAY_AT

// The logo's hover fill: square pixels that each light up at their own random moment.
export const LOGO_COLUMNS = 10
export const LOGO_ROWS = 4
function logoPixels(nav) {
  const grid = nav.querySelector('.nav-logo__pixels')
  if (!grid || grid.childElementCount) return
  grid.style.setProperty('--logo-cols', LOGO_COLUMNS)
  for (let i = 0; i < LOGO_COLUMNS * LOGO_ROWS; i++) {
    const pixel = document.createElement('i')
    pixel.style.setProperty('--d', `${(0.03 + Math.random() * 0.35).toFixed(3)}s`)
    grid.append(pixel)
  }
}

export function initNav(nav = document.querySelector('.site-nav'), footer = document.querySelector('.site-footer')) {
  if (!nav) return
  logoPixels(nav)
  let state = { floating: false, folded: false }
  let away = false
  let lastY = window.scrollY
  let queued = false
  const apply = () => {
    nav.classList.toggle('is-floating', state.floating)
    nav.classList.toggle('is-folded', state.folded)
    nav.classList.toggle('is-away', away)
  }
  const update = () => {
    queued = false
    const y = window.scrollY
    const nextAway = footer ? navAway(footer.getBoundingClientRect().top) : false
    if (Math.abs(y - lastY) < 4 && state.floating === y > FLOAT_AT && nextAway === away) return
    away = nextAway
    state = navState({ y, lastY, folded: state.folded })
    lastY = y
    apply()
  }
  const queue = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(update)
  }
  window.addEventListener('scroll', queue, { passive: true })
  window.addEventListener('resize', queue, { passive: true })
  nav.addEventListener('focusin', () => {
    state = { ...state, folded: false }
    apply()
  })
  state = navState({ y: lastY, lastY, folded: false })
  away = footer ? navAway(footer.getBoundingClientRect().top) : false
  apply()
}
