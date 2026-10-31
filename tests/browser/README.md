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
Bootstrap checks hold entity and operation responses separately, verify full
work-area widths and centered loaders, and resize the page while data is pending.
Switcher checks hover the divider, verify all three buttons are unobscured in
both themes and after horizontal scrolling, and click expand up, expand down,
and reset while checking the resulting table height.
They do not replace checking Safari on a physical iPad: WebKit's public
automation API exposes taps and wheel input, but not a native touch fling.

Run `node tests/browser/responsive.mjs` to check portrait tablet widgets at
768/834/1024px, rotation to landscape, desktop columns, expanded header height,
and mobile touch opening for income, expense and transfer. It also checks
swipes and long-press cancellation. API requests use isolated mock data;
screenshots are saved under `output/playwright/`.

For subcategories with real persistence, run from the sibling backend checkout:
`node tests/integration/subcategories.cjs --browser`. This starts an isolated
local MongoDB and API, opens the real frontend and verifies creation, editing a
legacy payment, reload, graph hover, journal filters and the mobile transfer
form. Requires `mongod` and Chrome. It does not use the production database.

Run `node tests/browser/desktop-assistant.mjs` for the Codex chat flow. This uses
synthetic API responses and checks offline history, draft preservation, reconnect,
Enter/Shift+Enter, the send button, speech transcript events, image attachments,
standalone window resizing, button placement, mobile Codex-only access, and
absence of legacy AI API requests.
Screenshots are saved under `output/playwright/`. Physical microphone capture
still depends on the browser and its microphone permission.

Run `node tests/browser/appearance.mjs` for personal theme settings. It verifies
section inheritance, independent palettes, graph footer typography, live canvas
updates, named theme persistence, light/dark and account isolation, and the dock
on desktop/tablet and compact phone sheet. API data and browser storage are isolated.

Run `node tests/browser/appearance-controls.mjs` to check independent chip backgrounds,
text and outlines, chip/day opacity, preserved cell striping, widget rounding and
equal light/dark control geometry on desktop, touch tablet and phone.
