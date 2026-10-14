import { createMiddleware } from "hono/factory";
import { isSignedIn, type SignedInSession } from "../../sessions.ts";
import { SIGN_IN_PATH } from "../../paths.ts";
import { navigate } from "../navigate.ts";
import type { SessionEnv } from "./session.ts";

/**
 * Sends visitors who aren't signed in to Plex to the sign-in page; after it, c.get("session") is signed in.
 * Goes after the session middleware.
 */
export const requireSignIn = createMiddleware<SessionEnv & { Variables: { session: SignedInSession } }>(async (c, next) => {
  if (isSignedIn(c.get("session"))) return next();
  console.debug(`Not signed in; sending ${c.req.path} to the sign-in page`);
  return navigate(c, SIGN_IN_PATH);
});
