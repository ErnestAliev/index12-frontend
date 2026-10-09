Run `npm run test:browser` to check the real workspace with touch input in
Chromium. On macOS it uses the installed Google Chrome; elsewhere install
Chromium with `npx playwright-core install chromium`, or set
`SCROLL_TEST_CHROME` to a browser executable.

For WebKit: `npx playwright-core install webkit`, then
`npm run test:browser -- --webkit`.

The tests start isolated local Vite servers on ports 5185/5186 and mock every
API request. They cover frame-by-frame day alignment, native touch inertia in
Chromium, WebKit wheel input, stationary-cursor events, normal and edge taps,
vertical scrolling, buffered range recycling, resize and month navigation.
They also check that tapped summaries stay open, switch days with one tap,
close on outside taps, and preserve desktop hover behavior.
They do not replace checking Safari on a physical iPad: WebKit's public
automation API exposes taps and wheel input, but not a native touch fling.
