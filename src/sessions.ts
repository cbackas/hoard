import { db } from "./db/index.ts";
import type { Session } from "./db/schema.ts";

export type { Session };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sessions slide: each recorded visit pushes expiry back this far. 400 days is the longest cookie lifetime browsers allow. */
export const SESSION_TTL_MS = 400 * DAY_MS;
/** last_seen_at is only rewritten this often, so ordinary page views don't each cost a database write. */
const TOUCH_INTERVAL_MS = DAY_MS;

/** 256 random bits, base64url-encoded; unguessable, so the cookie needs no signature. */
function newSessionId(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

/** Enough of a session id to tell sessions apart in logs without logging the credential itself. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Sessions last seen at or before this moment have expired. */
function expiryCutoff(): number {
  return Date.now() - SESSION_TTL_MS;
}

export async function createSession(): Promise<Session> {
  const now = Date.now();
  const session = { id: newSessionId(), created_at: now, last_seen_at: now };
  await db.insertInto("sessions").values(session).execute();
  console.debug("Created session", shortId(session.id));
  return session;
}

/** The live session with this id, or undefined if it doesn't exist or has expired. */
export async function findSession(id: string): Promise<Session | undefined> {
  return db
    .selectFrom("sessions")
    .selectAll()
    .where("id", "=", id)
    .where("last_seen_at", ">", expiryCutoff())
    .executeTakeFirst();
}

/**
 * Records a visit if the last recorded one was long enough ago, updating `session.last_seen_at` in place.
 * Returns whether it did, i.e. whether the expiry moved and the cookie needs re-sending.
 */
export async function touchSession(session: Session): Promise<boolean> {
  const now = Date.now();
  if (now - session.last_seen_at < TOUCH_INTERVAL_MS) return false;
  await db.updateTable("sessions").set({ last_seen_at: now }).where("id", "=", session.id).execute();
  session.last_seen_at = now;
  console.debug("Refreshed session", shortId(session.id));
  return true;
}

/** Deletes sessions whose cookies have expired. */
export async function pruneSessions(): Promise<void> {
  const { numDeletedRows } = await db.deleteFrom("sessions").where("last_seen_at", "<=", expiryCutoff()).executeTakeFirst();
  if (numDeletedRows > 0n) console.info(`Pruned ${numDeletedRows} expired sessions`);
  else console.debug("No expired sessions to prune");
}
