# Server-rendered HTML with Hono + HTMX, no client-side framework

Routing, middleware and rendering use Hono (an app with `.use()` middleware and `hono/jsx` for pages), served by `Bun.serve` — Hono is only the `fetch` handler, Bun stays the runtime and server. HTMX swaps server-rendered fragments; there is no SPA or client-side state. Styling uses the Tailwind v4 CLI writing a static stylesheet, and HTMX comes from npm rather than a CDN so the app works on an offline LAN.

## Considered Options

- **@kitajs/html** for rendering: stricter JSX types (including htmx attributes), but doesn't escape text by default — it needs a `safe` attribute plus its `xss-scan` checker, which only runs on TypeScript 5/6. Hono escapes text and attributes by default and works with TypeScript 7, at the cost of looser element/attribute typing.
- **Hand-rolled middleware over `Bun.serve` routes**: what we started with; replaced by Hono's app once we wanted Express-style `.use()` composition, rather than slowly rebuilding it ourselves.
