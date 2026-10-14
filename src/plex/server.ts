import { z } from "zod";
import { type ConnectionKind, type OwnedServer, type PlexConnection, plexHeaders } from "./tv.ts";

// Requests to the user's Plex Media Server itself, as opposed to plex.tv, and what's known about which of its
// Connections answer.

// All of a server's Connections are tried at once, so an unreachable one costs at most this, not this per Connection.
const REQUEST_TIMEOUT_MS = 10_000;
/** A Connection that answered isn't checked again for this long. */
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;
const KIND_PREFERENCE: ConnectionKind[] = ["local", "remote", "relay"];

const identityResponse = z.object({ MediaContainer: z.object({ machineIdentifier: z.string() }) });

/** An Owned server and the Connection to it in use. */
export interface ChosenServer {
  id: string;
  name: string;
  connectionUri: string;
}

/** Requests to a ChosenServer. */
export interface PlexServer {
  /** GETs path and parses the JSON with schema. Throws if that fails; if the server didn't answer at all, the Connection is also marked as not answering. */
  get<T>(path: string, schema: z.ZodType<T>): Promise<T>;
}

/**
 * The latest check of each Connection, keyed by connectionKey. Kept in memory, so after a restart every Connection
 * is checked again. answered is true while a check is still running, so callers don't wait on it.
 */
const checks = new Map<string, { at: number; answered: boolean }>();

/** A Connection belongs to one server: a LAN address can be reused by another machine. */
function connectionKey(serverId: string, uri: string): string {
  return `${serverId} ${uri}`;
}

/** Whether the Owned server with this machine identifier answers at uri, recording the result. Never throws: any failure is a no. */
async function check(uri: string, serverId: string): Promise<boolean> {
  const started = performance.now();
  const elapsed = () => `${(performance.now() - started).toFixed(0)}ms`;
  let answered = false;
  try {
    // /identity doesn't need a token: this checks the server is reachable, not that the token works.
    const response = await fetch(`${uri}/identity`, { headers: plexHeaders(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
      console.debug(`${uri} answered ${response.status} (${elapsed()})`);
    } else {
      const { machineIdentifier } = identityResponse.parse(await response.json()).MediaContainer;
      answered = machineIdentifier === serverId;
      if (answered) console.debug(`${uri} answered (${elapsed()})`);
      else console.debug(`${uri} is a different Plex server, ${machineIdentifier} (${elapsed()})`);
    }
  } catch (error) {
    console.debug(`${uri} didn't answer (${elapsed()}):`, error instanceof Error ? error.message : error);
  }
  checks.set(connectionKey(serverId, uri), { at: Date.now(), answered });
  return answered;
}

/**
 * The Owned server's best Connection that answers: local, then remote, then relay. All are tried at once, but a
 * preferred one that's still trying is waited for before settling for a worse one. Undefined if none answer.
 */
export async function findConnection(server: OwnedServer): Promise<PlexConnection | undefined> {
  const ordered = server.connections.toSorted((a, b) => KIND_PREFERENCE.indexOf(a.kind) - KIND_PREFERENCE.indexOf(b.kind));
  console.debug(`Trying ${ordered.length} Connections to ${server.name}:`, ordered.map((connection) => `${connection.kind} ${connection.uri}`));
  const attempts = ordered.map((connection) => check(connection.uri, server.id));
  for (const [i, attempt] of attempts.entries()) {
    if (await attempt) return ordered[i];
  }
  return undefined;
}

/**
 * Whether the Connection is believed to still answer, without waiting on the server: when it hasn't been checked
 * for RECHECK_INTERVAL_MS, this starts a check in the background, and if that fails a later call says no. A request
 * through plexServer that gets no answer also makes it say no.
 */
export function stillAnswers(server: ChosenServer): boolean {
  const key = connectionKey(server.id, server.connectionUri);
  const latest = checks.get(key);
  if (latest && !latest.answered) return false;
  if (!latest || Date.now() - latest.at >= RECHECK_INTERVAL_MS) {
    checks.set(key, { at: Date.now(), answered: true });
    console.debug(`Checking ${server.name}'s Connection ${server.connectionUri} in the background`);
    void check(server.connectionUri, server.id).then((answered) => {
      if (!answered) console.warn(`Owned server ${server.name} stopped answering at ${server.connectionUri}`);
    });
  }
  return true;
}

/** Requests to the server through its Connection in use, authenticated with token. */
export function plexServer(server: ChosenServer, token: string): PlexServer {
  return {
    async get(path, schema) {
      const started = performance.now();
      let response;
      try {
        response = await fetch(`${server.connectionUri}${path}`, { headers: plexHeaders(token), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch (error) {
        console.warn(`Owned server ${server.name} didn't answer GET ${path} at ${server.connectionUri}`);
        checks.set(connectionKey(server.id, server.connectionUri), { at: Date.now(), answered: false });
        throw error;
      }
      console.debug(`${server.name} GET ${path} → ${response.status} (${(performance.now() - started).toFixed(0)}ms)`);
      if (!response.ok) throw new Error(`${server.name} GET ${path} failed: ${response.status} ${response.statusText}`);
      return schema.parse(await response.json());
    },
  };
}
