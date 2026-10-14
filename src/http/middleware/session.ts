import { deleteCookie, getCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { config } from "../../config.ts";
import type { PlexAccount } from "../../plex/tv.ts";
import {
  completeSignIn,
  createSession,
  deleteSession,
  findSession,
  type Session,
  SESSION_TTL_MS,
  shortId,
  touchSession,
} from "../../sessions.ts";

const COOKIE_NAME = "hoard_session";

export type SessionEnv = { Variables: { session: Session | undefined } };

/** Sets the session cookie, HMAC-signed so a session id read out of the database can't be used as a cookie. */
async function setSessionCookie(c: Context, id: string) {
  await setSignedCookie(c, COOKIE_NAME, id, config.sessionSecret, {
    path: "/",
    httpOnly: true,
    // Lax, not Strict: the cookie has to come along when Plex sign-in redirects back to us.
    sameSite: "Lax",
    // Only when this request is HTTPS; on a plain-HTTP LAN the browser would drop a Secure cookie.
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/**
 * Attaches the browser's existing session, if any, as c.get("session"), refreshing its expiry when due.
 * It never creates one, so visits that don't need a session (bots, curl, health checks) leave no rows behind;
 * call startSession when one is needed. Add it to page routes only, not static files or live reload.
 */
export const session = createMiddleware<SessionEnv>(async (c, next) => {
  const id = await getSignedCookie(c, config.sessionSecret, COOKIE_NAME);
  const current = id ? await findSession(id) : undefined;
  if (!current) {
    // Hono gives false for a wrong signature but undefined for a missing or malformed one, same as no cookie.
    if (id) console.debug("Session cookie unknown or expired; ignoring it");
    else if (getCookie(c, COOKIE_NAME) !== undefined) console.debug("Session cookie isn't validly signed; ignoring it");
  } else if (await touchSession(current)) {
    await setSessionCookie(c, current.id);
  } else {
    console.debug("Resumed session", shortId(current.id));
  }
  c.set("session", current);
  await next();
});

/** Returns the request's session, first creating one and setting its cookie if there isn't one yet. */
export async function startSession(c: Context<SessionEnv>): Promise<Session> {
  const existing = c.get("session");
  if (existing) return existing;
  const created = await createSession();
  await setSessionCookie(c, created.id);
  c.set("session", created);
  return created;
}

/**
 * Signs the session in to Plex. Its id changes in the process, so this re-sends the cookie. If another request
 * already completed this sign-in, nothing changes and no cookie is sent; that request's response carries it.
 */
export async function signInSession(
  c: Context<SessionEnv>,
  session: Session,
  pinId: number,
  token: string,
  account: PlexAccount,
): Promise<void> {
  if (await completeSignIn(session, pinId, token, account)) await setSessionCookie(c, session.id);
}

/** Deletes the request's session, if any, and tells the browser to drop its cookie. */
export async function endSession(c: Context<SessionEnv>): Promise<void> {
  const current = c.get("session");
  if (current) await deleteSession(current);
  deleteCookie(c, COOKIE_NAME, { path: "/" });
  c.set("session", undefined);
}
