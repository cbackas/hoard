import type { ExpressionBuilder } from "kysely";
import { decrypt, encrypt } from "./crypto.ts";
import { db } from "./db/index.ts";
import type { DB, Session } from "./db/schema.ts";
import type { PlexAccount } from "./plex/tv.ts";

export type { Session };

/** A Session that holds a Plex token, from signing in through plex.tv. */
export type SignedInSession = Session & { plex_token: string; plex_username: string };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sessions slide: each recorded visit pushes expiry back this far. 400 days is the longest cookie lifetime browsers allow. */
export const SESSION_TTL_MS = 400 * DAY_MS;
/**
 * A session that never finishes signing in expires this long after it was created. Anyone can start a sign-in,
 * so this keeps abandoned ones from piling up for SESSION_TTL_MS. Comfortably longer than plex.tv keeps a PIN.
 */
const UNSIGNED_SESSION_TTL_MS = 30 * 60 * 1000;
/** last_seen_at is only rewritten this often, so ordinary page views don't each cost a database write. */
const TOUCH_INTERVAL_MS = DAY_MS;

/** 256 random bits, base64url-encoded, so unguessable. The cookie is also signed, so the id alone (e.g. from a copy of the database) isn't enough to use it. */
function newSessionId(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

/** Enough of a session id to tell sessions apart in logs without logging the credential itself. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function isSignedIn(session: Session | undefined): session is SignedInSession {
  return session?.plex_token != null && session.plex_username != null;
}

/** The Plex account a signed-in session belongs to. */
export function sessionAccount(session: SignedInSession): PlexAccount {
  return { username: session.plex_username, thumb: session.plex_thumb ?? undefined };
}

/** Matches sessions that haven't expired: signed in and seen within SESSION_TTL_MS, or still signing in and recent. */
function isLive(eb: ExpressionBuilder<DB, "sessions">) {
  const now = Date.now();
  return eb.and([
    eb("last_seen_at", ">", now - SESSION_TTL_MS),
    eb.or([eb("plex_token", "is not", null), eb("created_at", ">", now - UNSIGNED_SESSION_TTL_MS)]),
  ]);
}

export async function createSession(): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    id: newSessionId(),
    created_at: now,
    last_seen_at: now,
    plex_pin_id: null,
    plex_token: null,
    plex_username: null,
    plex_thumb: null,
  };
  await db.insertInto("sessions").values(session).execute();
  console.debug("Created session", shortId(session.id));
  return session;
}

/**
 * The live session with this id, or undefined if it doesn't exist or has expired. Its Plex token comes back
 * decrypted. A session whose token won't decrypt (e.g. ENCRYPTION_KEY changed) is deleted, signing it out.
 */
export async function findSession(id: string): Promise<Session | undefined> {
  const session = await db.selectFrom("sessions").selectAll().where("id", "=", id).where(isLive).executeTakeFirst();
  if (session?.plex_token) {
    try {
      session.plex_token = await decrypt(session.plex_token);
    } catch (error) {
      // WebCrypto's error says nothing useful ("operation failed"), so the likely causes are spelled out instead.
      console.warn(`Couldn't decrypt the Plex token of session ${shortId(session.id)}; ENCRYPTION_KEY changed or the value is corrupt. Signing it out`);
      console.debug("Decrypt error:", error);
      await deleteSession(session);
      return undefined;
    }
  }
  return session;
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

/** Remembers the plex.tv PIN of the sign-in this session just started, so the callback can only claim its own. */
export async function setPendingPin(session: Session, pinId: number): Promise<void> {
  await db.updateTable("sessions").set({ plex_pin_id: pinId }).where("id", "=", session.id).execute();
  session.plex_pin_id = pinId;
  console.debug("Session", shortId(session.id), "is signing in with PIN", pinId);
}

/**
 * Signs the session in: stores the Plex token (encrypted) and account details and clears the pending PIN.
 * The session also gets a new id, so an id known before sign-in (e.g. one planted by an attacker) isn't signed in;
 * the caller has to send the new cookie.
 *
 * Returns false, changing nothing, if another request already completed this sign-in (e.g. the callback loaded
 * twice): that request rotated the id, so this one's is gone.
 */
export async function completeSignIn(session: Session, pinId: number, token: string, account: PlexAccount): Promise<boolean> {
  const signedIn = { plex_pin_id: null, plex_username: account.username, plex_thumb: account.thumb ?? null };
  const id = newSessionId();
  const { numUpdatedRows } = await db
    .updateTable("sessions")
    .set({ ...signedIn, id, plex_token: await encrypt(token) })
    .where("id", "=", session.id)
    .where("plex_pin_id", "=", pinId)
    .executeTakeFirst();
  if (numUpdatedRows === 0n) {
    console.debug("Session", shortId(session.id), "already completed sign-in with PIN", pinId);
    return false;
  }
  console.debug("Session", shortId(session.id), "is now", shortId(id));
  Object.assign(session, signedIn, { id, plex_token: token });
  console.info(`Signed in to Plex as ${account.username} (session ${shortId(id)})`);
  return true;
}

export async function deleteSession(session: Session): Promise<void> {
  await db.deleteFrom("sessions").where("id", "=", session.id).execute();
  console.debug("Deleted session", shortId(session.id));
}

/** Deletes expired sessions, including sign-ins that were never finished. */
export async function pruneSessions(): Promise<void> {
  const { numDeletedRows } = await db
    .deleteFrom("sessions")
    .where((eb) => eb.not(isLive(eb)))
    .executeTakeFirst();
  if (numDeletedRows > 0n) console.info(`Pruned ${numDeletedRows} expired sessions`);
  else console.debug("No expired sessions to prune");
}
