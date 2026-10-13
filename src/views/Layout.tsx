import type { Child } from "hono/jsx";
import { raw } from "hono/html";
import { LiveReloadScript } from "../http/liveReload.tsx";

// Keeps HTMX compatible with our CSP (no injected <style>, no eval) and stops swapped-in
// HTML from running scripts.
const HTMX_CONFIG = JSON.stringify({
  includeIndicatorStyles: false,
  allowEval: false,
  allowScriptTags: false,
  selfRequestsOnly: true,
});

export function Layout({ title, children }: { title: string; children: Child }) {
  return (
    <>
      {raw("<!doctype html>")}
      <html lang="en" class="dark">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="htmx-config" content={HTMX_CONFIG} />
          <title>{title}</title>
          <link rel="stylesheet" href="/public/styles.css" />
          <script src="/public/vendor/htmx.min.js" defer></script>
          <LiveReloadScript />
        </head>
        <body class="min-h-screen bg-neutral-950 text-neutral-100 antialiased">{children}</body>
      </html>
    </>
  );
}
