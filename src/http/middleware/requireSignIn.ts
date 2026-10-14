import { createMiddleware } from "hono/factory";
import { isSignedIn, type SignedInSession } from "../../sessions.ts";
import { SIGN_IN_PATH } from "../../views/SignIn.tsx";
import type { SessionEnv } from "./session.ts";

/**
 * Sends visitors who aren't signed in to Plex to the sign-in page; after it, c.get("session") is signed in.
 * Goes after the session middleware.
 */
export const requireSignIn = createMiddleware<SessionEnv & { Variables: { session: SignedInSession } }>(async (c, next) => {
  if (isSignedIn(c.get("session"))) return next();
  console.debug(`Not signed in; sending ${c.req.path} to the sign-in page`);
  // A redirect would make HTMX swap the sign-in page into the grid; HX-Redirect makes it navigate instead.
  if (c.req.header("HX-Request")) {
    c.header("HX-Redirect", SIGN_IN_PATH);
    return c.body(null, 204);
  }
  return c.redirect(SIGN_IN_PATH);
});
