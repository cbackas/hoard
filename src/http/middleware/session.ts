import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { createSession, findSession, type Session, SESSION_TTL_MS, shortId, touchSession } from "../../sessions.ts";

const COOKIE_NAME = "hoard_session";

export type SessionEnv = { Variables: { session: Session | undefined } };

function setSessionCookie(c: Context, id: string) {
  setCookie(c, COOKIE_NAME, id, {
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
  const id = getCookie(c, COOKIE_NAME);
  const current = id ? await findSession(id) : undefined;
  if (!current) {
    if (id) console.debug("Session cookie unknown or expired; ignoring it");
  } else if (await touchSession(current)) {
    setSessionCookie(c, current.id);
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
  setSessionCookie(c, created.id);
  c.set("session", created);
  return created;
}
