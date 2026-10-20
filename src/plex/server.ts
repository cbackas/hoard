import { z } from "zod";
import type { MediaType } from "../simkl/trending.ts";
import { PlexHost, PlexRequestError } from "./request.ts";
import type { ConnectionKind, OwnedServer, PlexConnection } from "./tv.ts";

// The user's Plex Media Server itself, as opposed to plex.tv: reading its Movie and Show Libraries, and what's known
// about which of its Connections answer.

/** A Connection that answered isn't checked again for this long. */
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;
const KIND_PREFERENCE: ConnectionKind[] = ["local", "remote", "relay"];
/** Library items are fetched this many at a time, so a big Library doesn't come back as one huge response. */
const PAGE_SIZE = 500;
/** The External ID sources Hoard matches on. Plex writes each as e.g. "imdb://tt0111161". */
const EXTERNAL_ID_SOURCES = ["imdb", "tmdb", "tvdb"];
const PLEX_LIBRARY_TYPES: Record<string, MediaType> = { movie: "movie", show: "show" };

const identityResponse = z.object({ MediaContainer: z.object({ machineIdentifier: z.string() }) });

// Every library section, music and photos included. Directory is missing when the server has none.
const sectionsResponse = z.object({
  MediaContainer: z.object({ Directory: z.array(z.object({ key: z.string(), type: z.string(), title: z.string() })).default([]) }),
});

const item = z.object({
  title: z.string(),
  ratingKey: z.string().min(1),
  // e.g. "plex://show/5d9c086eba6eb9001fba3d37" for Plex's own agents; a legacy agent's guid isn't one Plex's online metadata knows.
  guid: z.string().optional(),
  // Missing for items matched by Plex's legacy agents, which only have a single agent-specific guid.
  Guid: z.array(z.object({ id: z.string() })).default([]),
  // A Show's episode count.
  leafCount: z.number().int().nonnegative().optional(),
});

// A Show's seasons.
const seasonsResponse = z.object({
  MediaContainer: z.object({
    Metadata: z.array(z.object({ index: z.number().int().optional(), leafCount: z.number().int().nonnegative().default(0) })).default([]),
  }),
});

/** An Owned server and the Connection to it in use. */
export interface ChosenServer {
  id: string;
  name: string;
  connectionUri: string;
}

/** A Movie or Show Library. */
export interface Library {
  key: string;
  title: string;
  mediaType: MediaType;
}

/**
 * An item in a Library: its External IDs, e.g. "imdb://tt0111161", its key on the server, and for a Show, its episode
 * count (specials included) and its ID in Plex's online metadata, if it has one.
 */
export interface LibraryItem {
  externalIds: string[];
  ratingKey: string;
  episodeCount: number | undefined;
  plexGuid: string | undefined;
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
  let answered = false;
  try {
    // /identity doesn't need a token: this checks the server is reachable, not that the token works.
    const { machineIdentifier } = (await new PlexHost({ name: uri, baseUrl: uri }).get("/identity", identityResponse)).MediaContainer;
    answered = machineIdentifier === serverId;
    if (!answered) console.debug(`${uri} is a different Plex server, ${machineIdentifier}`);
  } catch {
    // The request logged why.
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
 * through a PlexServer that gets no answer also makes it say no.
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

/**
 * Requests to an Owned server through its Connection in use, made with a signed-in account's token (see
 * PlexClient.server). A request that gets no answer marks the Connection as not answering.
 */
export class PlexServer {
  readonly #server: ChosenServer;
  readonly #host: PlexHost;

  constructor(server: ChosenServer, token: string) {
    this.#server = server;
    this.#host = new PlexHost({ name: server.name, baseUrl: server.connectionUri, token });
  }

  /** The server's Movie and Show Libraries; other types are left out. */
  async libraries(): Promise<Library[]> {
    const { Directory } = (await this.#ask(() => this.#host.get("/library/sections", sectionsResponse))).MediaContainer;
    const libraries: Library[] = [];
    for (const { key, type, title } of Directory) {
      const mediaType = PLEX_LIBRARY_TYPES[type];
      if (mediaType) libraries.push({ key, title, mediaType });
      else console.debug(`Ignoring ${type} Library ${title}`);
    }
    return libraries;
  }

  /** Every item in the Library that has an External ID. Items without one can't be matched, so they're counted in a log and left out. */
  async libraryItems(library: Library): Promise<LibraryItem[]> {
    const path = `/library/sections/${encodeURIComponent(library.key)}/all?includeGuids=1`;
    const values = await this.#ask(() => this.#host.getAll(path, { pageSize: PAGE_SIZE }));
    const items: LibraryItem[] = [];
    let skipped = 0;
    for (const value of values) {
      const parsed = item.safeParse(value);
      if (!parsed.success) {
        console.debug(`Skipping unusable item in Library ${library.title}:`, z.prettifyError(parsed.error), value);
        skipped++;
        continue;
      }
      const externalIds = parsed.data.Guid.map((guid) => guid.id).filter((id) => EXTERNAL_ID_SOURCES.includes(id.split("://")[0] ?? ""));
      if (externalIds.length === 0) {
        console.debug(`No IMDb, TMDB or TVDB ID for ${parsed.data.title} in Library ${library.title}`);
        skipped++;
        continue;
      }
      const { ratingKey, guid, leafCount } = parsed.data;
      items.push({ externalIds, ratingKey, episodeCount: leafCount, plexGuid: guid?.startsWith("plex://show/") ? guid : undefined });
    }
    if (skipped > 0) console.debug(`Library ${library.title}: left out ${skipped} items without a usable External ID`);
    return items;
  }

  /** How many episodes of the Show with this key the server has, leaving out specials (season 0). */
  async regularEpisodeCount(ratingKey: string): Promise<number> {
    const path = `/library/metadata/${encodeURIComponent(ratingKey)}/children`;
    const { Metadata } = (await this.#ask(() => this.#host.get(path, seasonsResponse))).MediaContainer;
    return Metadata.filter((season) => season.index !== undefined && season.index > 0).reduce((sum, season) => sum + season.leafCount, 0);
  }

  /** Makes the request, marking the Connection as not answering if the server didn't answer it. */
  async #ask<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof PlexRequestError && error.status === undefined) {
        const { id, name, connectionUri } = this.#server;
        console.warn(`Owned server ${name} didn't answer at ${connectionUri}`);
        checks.set(connectionKey(id, connectionUri), { at: Date.now(), answered: false });
      }
      throw error;
    }
  }
}
