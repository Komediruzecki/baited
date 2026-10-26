// Opus-led choreography from Paolo's fan, sheet-stack and pixel references.
import { initScreenStack } from './screen-stack.js'
import { initSceneSeam } from './scene-seam.js'

export function initLandingMotion({ reduced }) {
  initScreenStack({ reduced })
  initSceneSeam({ reduced })
}
