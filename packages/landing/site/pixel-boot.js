// Covers the first paint with the pixel curtain, so the page never flashes before pixels.js takes
// it away square by square. Loaded as a plain blocking script in <head>; with reduced motion it
// does nothing. If pixels.js never runs, pixels.css fades the cover out after 2.5 seconds.
try {
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('pixel-boot')
} catch (error) {
  // Without matchMedia there is simply no curtain.
}
