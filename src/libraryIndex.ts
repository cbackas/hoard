import { db } from "./db/index.ts";
import type { LibraryExternalIdsTable } from "./db/schema.ts";
import { connectedServer } from "./ownedServers.ts";
import { type ConnectedSession, shortId } from "./sessions.ts";
import type { Title } from "./simkl/trending.ts";
import type { EpisodeCounter } from "./episodeCounts.ts";

// The Library index of each Owned server. Matching reads it from memory; it's also saved to the database (see
// ADR 0007), so a restart picks up where it left off instead of indexing again. Rebuilt in the background.

/** An index is rebuilt once it's this old. */
const INDEX_TTL_MS = 60 * 60 * 1000;
// After a failed build, the next attempt waits this long, so requests don't each start another while the server
// is struggling. A refresh doesn't wait.
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
/** Rows inserted per statement when saving, keeping well under SQLite's limit on bound parameters. */
const INSERT_BATCH_SIZE = 1000;

/** A Show in an Owned server's Libraries. */
export interface IndexedShow {
  /** Specials included. */
  episodes: number;
  /** Its key on the server. */
  ratingKey: string;
  /** Its ID in Plex's online metadata, e.g. "plex://show/5d9c086eba6eb9001fba3d37"; only Shows matched by Plex's own agents have one. */
  plexGuid: string | undefined;
}

/** The External IDs, e.g. "imdb://tt0111161", of everything in an Owned server's Libraries, Movies and Shows apart. */
export interface LibraryIndex {
  movieIds: Set<string>;
  /** Each Show, by External ID. Where several Shows have the same External ID, it's the one with the most episodes. */
  shows: Map<string, IndexedShow>;
  /** How many Movies and Shows were indexed; one with several External IDs counts once. */
  movieCount: number;
  showCount: number;
  builtAt: number;
}

/** What's known of an Owned server's Library index: the latest one built, if any, and whether a build is running. */
export interface LibraryIndexState {
  index: LibraryIndex | undefined;
  building: boolean;
}

interface ServerState {
  index?: LibraryIndex;
  /** Settles once the saved index, if any, has been read from the database. */
  loaded: Promise<void>;
  building?: Promise<void>;
  failedAt?: number;
}

/** Keyed by Owned server machine identifier, so sessions using the same server share it. */
const states = new Map<string, ServerState>();

/**
 * The session's Owned server's Library index. Only waits on the database, and only the first time a server is
 * asked about after a start: when there's no index yet, or it's older than INDEX_TTL_MS, this starts building one
 * in the background and returns the old one meanwhile.
 */
export async function libraryIndex(session: ConnectedSession): Promise<LibraryIndexState> {
  const state = await serverState(session);
  const now = Date.now();
  const stale = !state.index || now - state.index.builtAt >= INDEX_TTL_MS;
  const failedRecently = state.failedAt !== undefined && now - state.failedAt < RETRY_AFTER_FAILURE_MS;
  if (stale && !state.building) {
    if (failedRecently) console.debug(`Library index of ${session.plex_server_name} failed to build recently; not retrying yet`);
    else startBuild(session, state, state.index ? "it's over an hour old" : "there isn't one yet");
  }
  return { index: state.index, building: state.building !== undefined };
}

/** Rebuilds the session's Owned server's Library index in the background, unless a build is already running. */
export async function refreshLibraryIndex(session: ConnectedSession): Promise<LibraryIndexState> {
  const state = await serverState(session);
  if (state.building) console.debug(`Library index of ${session.plex_server_name} is already building`);
  else startBuild(session, state, `session ${shortId(session.id)} asked for a refresh`);
  return { index: state.index, building: state.building !== undefined };
}

/** How much of a Title Plex has: none of it (a Gap), all of it, or, for a Show, fewer episodes than have aired. */
export type CollectionStatus =
  | { status: "gap" }
  | { status: "collected" }
  | { status: "partial"; episodes: number; airedEpisodes: number };

/**
 * How much of the Title Plex has. It's in Plex when any of its External IDs is in the index of its own media type;
 * Movies and Shows are never matched against each other, as TMDB numbers them separately (see ADR 0002).
 *
 * A Show is only checked for being Partially collected when countEpisodes is given, and only when Plex has fewer
 * episodes than SIMKL's count, which includes announced episodes, so can't be less than the number aired. Until
 * countEpisodes knows the Show's counts, it's Collected.
 */
export function collectionStatus(title: Title, index: LibraryIndex, countEpisodes?: EpisodeCounter): CollectionStatus {
  if (title.mediaType === "movie") {
    return title.externalIds.some((id) => index.movieIds.has(id)) ? { status: "collected" } : { status: "gap" };
  }
  const matches = title.externalIds.map((id) => index.shows.get(id)).filter((show) => show !== undefined);
  // Its External IDs can match different Shows in Plex; the one with the most episodes is the best copy.
  const show = matches.reduce<IndexedShow | undefined>((best, match) => (best && best.episodes >= match.episodes ? best : match), undefined);
  if (!show) return { status: "gap" };
  if (!countEpisodes || (title.totalEpisodes !== undefined && show.episodes >= title.totalEpisodes)) return { status: "collected" };
  const counts = countEpisodes.count(show, index.builtAt);
  if (counts && counts.inPlex < counts.aired) return { status: "partial", episodes: counts.inPlex, airedEpisodes: counts.aired };
  return { status: "collected" };
}

/** The server's state, reading its saved index from the database the first time it's asked for. */
async function serverState(session: ConnectedSession): Promise<ServerState> {
  let state = states.get(session.plex_server_id);
  if (!state) {
    // Builds only start once this has settled, so the saved index can't overwrite a newer one.
    const created: ServerState = { loaded: Promise.resolve() };
    created.loaded = loadIndex(session.plex_server_id, session.plex_server_name).then((index) => {
      created.index = index;
    });
    states.set(session.plex_server_id, created);
    state = created;
  }
  await state.loaded;
  return state;
}

/** Builds the index through this session's Connection and token, then saves it. Keeps the old one if the build fails. */
function startBuild(session: ConnectedSession, state: ServerState, reason: string): void {
  const serverId = session.plex_server_id;
  const serverName = session.plex_server_name;
  console.debug(`Building the Library index of ${serverName}: ${reason}`);
  state.building = buildIndex(session)
    .then(async (index) => {
      state.index = index;
      state.failedAt = undefined;
      try {
        await saveIndex(serverId, index);
      } catch (error) {
        // It's still used from memory; it just has to be built again after a restart.
        console.warn(`Couldn't save the Library index of ${serverName}:`, error);
      }
    })
    .catch((error: unknown) => {
      state.failedAt = Date.now();
      console.warn(`Couldn't build the Library index of ${serverName}${state.index ? "; keeping the previous one" : ""}:`, error);
    })
    .finally(() => {
      state.building = undefined;
    });
}

async function buildIndex(session: ConnectedSession): Promise<LibraryIndex> {
  const started = performance.now();
  const server = connectedServer(session);
  const libraries = await server.libraries();
  console.debug(`${session.plex_server_name} has ${libraries.length} Movie and Show Libraries:`, libraries.map((library) => `${library.mediaType} ${library.title}`));

  const index: LibraryIndex = { movieIds: new Set(), shows: new Map(), movieCount: 0, showCount: 0, builtAt: 0 };
  // One at a time, so indexing doesn't flood a modest server with requests.
  for (const library of libraries) {
    const items = await server.libraryItems(library);
    console.debug(`Library ${library.title}: indexed ${items.length} items`);
    for (const { externalIds, ratingKey, episodeCount, plexGuid } of items) {
      if (library.mediaType === "movie") {
        index.movieCount++;
        for (const id of externalIds) index.movieIds.add(id);
      } else {
        index.showCount++;
        const show: IndexedShow = { episodes: episodeCount ?? 0, ratingKey, plexGuid };
        for (const id of externalIds) addShow(index.shows, id, show);
      }
    }
  }

  index.builtAt = Date.now();
  const ms = (performance.now() - started).toFixed(0);
  console.info(`Indexed ${session.plex_server_name}'s Libraries: ${index.movieCount} movies, ${index.showCount} shows (${ms}ms)`);
  return index;
}

/** Adds the Show under the External ID, unless a Show with more episodes already has it, e.g. one in another Library. */
function addShow(shows: Map<string, IndexedShow>, id: string, show: IndexedShow): void {
  const existing = shows.get(id);
  if (!existing || show.episodes > existing.episodes) shows.set(id, show);
}

/** Replaces the server's saved index with this one, all at once so a failure leaves the previous one intact. */
async function saveIndex(serverId: string, index: LibraryIndex): Promise<void> {
  const started = performance.now();
  const rows: LibraryExternalIdsTable[] = [
    ...[...index.movieIds].map((id) => ({
      server_id: serverId,
      media_type: "movie" as const,
      external_id: id,
      episode_count: null,
      plex_rating_key: null,
      plex_guid: null,
    })),
    ...[...index.shows].map(([id, show]) => ({
      server_id: serverId,
      media_type: "show" as const,
      external_id: id,
      episode_count: show.episodes,
      plex_rating_key: show.ratingKey,
      plex_guid: show.plexGuid ?? null,
    })),
  ];
  const summary = { built_at: index.builtAt, movie_count: index.movieCount, show_count: index.showCount };
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("library_external_ids").where("server_id", "=", serverId).execute();
    for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
      await trx.insertInto("library_external_ids").values(rows.slice(start, start + INSERT_BATCH_SIZE)).execute();
    }
    await trx
      .insertInto("library_indexes")
      .values({ server_id: serverId, ...summary })
      .onConflict((oc) => oc.column("server_id").doUpdateSet(summary))
      .execute();
  });
  console.debug(`Saved the Library index of server ${serverId}: ${rows.length} External IDs (${(performance.now() - started).toFixed(0)}ms)`);
}

/** The server's saved index, or undefined if none was saved or it couldn't be read (then it's built again). */
async function loadIndex(serverId: string, serverName: string): Promise<LibraryIndex | undefined> {
  const started = performance.now();
  try {
    const saved = await db.selectFrom("library_indexes").selectAll().where("server_id", "=", serverId).executeTakeFirst();
    if (!saved) {
      console.debug(`No saved Library index for ${serverName}`);
      return undefined;
    }
    const rows = await db
      .selectFrom("library_external_ids")
      .select(["media_type", "external_id", "episode_count", "plex_rating_key", "plex_guid"])
      .where("server_id", "=", serverId)
      .execute();
    const index: LibraryIndex = {
      movieIds: new Set(),
      shows: new Map(),
      movieCount: saved.movie_count,
      showCount: saved.show_count,
      builtAt: saved.built_at,
    };
    for (const row of rows) {
      if (row.media_type === "movie") index.movieIds.add(row.external_id);
      else {
        index.shows.set(row.external_id, {
          episodes: row.episode_count ?? 0,
          ratingKey: row.plex_rating_key ?? "",
          plexGuid: row.plex_guid ?? undefined,
        });
      }
    }
    const age = Math.round((Date.now() - saved.built_at) / 60_000);
    console.debug(`Loaded the saved Library index of ${serverName}: ${rows.length} External IDs, built ${age} min ago (${(performance.now() - started).toFixed(0)}ms)`);
    return index;
  } catch (error) {
    console.warn(`Couldn't read the saved Library index of ${serverName}; building it again:`, error);
    return undefined;
  }
}
