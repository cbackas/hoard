import type { MiddlewareHandler } from "hono";

// Everything is served from our own origin; HTMX is configured (see Layout) to need neither
// inline styles nor eval. Any external origin (e.g. poster images) has to be allowed here.
const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // Plex account avatar URLs are on plex.tv and redirect to assets.plex.tv for uploaded avatars.
    "img-src 'self' data: https://simkl.in https://plex.tv https://assets.plex.tv",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    // The sign-in form redirects to Plex, and browsers apply form-action to where a form's redirects lead.
    "form-action 'self' https://app.plex.tv",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
};

/** Adds the security headers to every response, including 404s and errors. */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(name, value);
};
