# Baited error handling

The app and landing use the Baited wordmark, existing pixel bomb, purple background and authored Baity copy for page-level failures. The illustration settles once on entry; reduced-motion users get a still page.

| Failure | What the user sees | Recovery |
| --- | --- | --- |
| Invalid page URL | 404: That link was a decoy. | Return to Studio or the landing page |
| React screen failure | I dropped the deck. | Reload the screen |
| Session connection failure | Lost the signal. | Retry without exposing raw network details |
| Server failure | 500: I dropped the deck. | Return and retry |
| Temporary service outage | 503: A little out of fuel. | Retry after a moment |
| Twitch authorization failure | Let's reconnect. | Start a fresh connection from Studio |
| Rate limit or restricted page | Specific 429/403 guidance | Wait or return to Studio |
| Paused pilot or incomplete setup | Specific operational guidance | Wait for the host, or contact the operator |
| OBS overlay failure | Small transparent notice | Refresh the source or copy a fresh URL |

Microphone, gameplay, form-validation and live-connection controls retain their contextual recovery. A page-wide error must not conceal a recoverable local issue or cover the stream.

## Routing and safety

- Real HTML navigation receives the branded document while preserving its HTTP status. API/service routes retain JSON, including when a caller asks for HTML.
- Unknown Node app routes no longer turn into Studio. Vite handles its module/static requests, then an exact route list controls the app fallback. Missing scripts and service routes return 404 rather than HTML 200.
- Cloudflare's static assets have a generated `404.html` and `404-page` handling. The Worker-first route list stays narrow; this adds no blanket Worker invocation for every image, font or page miss.
- Pilot assets explicitly include the stylesheet, fonts, logo and bomb. The landing build adds its own standalone 404 and uses existing landing artwork.
- No exception stack, supplied URL, query, OAuth code or overlay capability is interpolated into the error page. Response cookies, rate-limit headers and HEAD behavior are preserved.
- Standalone error documents need no JavaScript. Their CSP permits only local styles, images and fonts. React's error boundary covers render/lazy-component failures; session loading has its own recovery state.

This cannot replace a browser's DNS/TLS/network error page, a Cloudflare platform failure before our code runs, or guarantee a rich screen when every required asset is unavailable. The native Twitch Extension has its own status UI; these changes do not alter or upload its ZIP.

## Verification

Focused checks cover route negotiation, exact route matching, API JSON, HEAD responses, authentication-cookie preservation, no reflected error details, Node middleware failures, a local Cloudflare gateway asset outage, and landing failures. Browser checks cover real 404 navigation, successful return to Studio, session retry, a simulated React render failure, transparent OBS errors, mobile width and reduced motion.

Local previews: `/lost-decoy` demonstrates the actual 404; `/studio` is the ordinary app. No debug error-trigger route is deployed.
