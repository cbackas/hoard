import type { Context } from "hono";

/**
 * Sends the browser to url. A plain redirect would make HTMX swap the page at url into the grid, so HTMX requests
 * get HX-Redirect instead, which makes HTMX navigate there.
 */
export function navigate(c: Context, url: string): Response {
  if (c.req.header("HX-Request")) {
    c.header("HX-Redirect", url);
    return c.body(null, 204);
  }
  return c.redirect(url);
}
