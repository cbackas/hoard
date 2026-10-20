import type { IndexedShow } from "./libraryIndex.ts";
import { connectedServer, plexClient } from "./ownedServers.ts";
import type { ConnectedSession } from "./sessions.ts";

// How many of a Show's episodes are in Plex and how many have aired, for telling whether it's Partially collected.
// Counting takes a few requests per Show, so it's done in the background and kept in memory: asking for a count
// that isn't known or is out of date starts counting it, and a page can wait a little for those to finish.

/** A Show's regular episodes (specials left out) in Plex, and aired before today. */
export interface EpisodeCounts {
  inPlex: number;
  aired: number;
}

export interface EpisodeCounter {
  /** A Show's EpisodeCounts if they're known, starting to count them if they aren't or are out of date; indexBuiltAt is its Library index's. */
  count(show: IndexedShow, indexBuiltAt: number): EpisodeCounts | undefined;
  /** Settles once every count started so far has finished, or after maxWaitMs if that's sooner. */
  settled(maxWaitMs: number): Promise<void>;
}

/** After a failed count, the next attempt waits this long, so a Show Plex can't describe isn't asked about on every page load. */
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
/** Episodes in Plex are counted again after this long, as well as after a Library index rebuild, so new episodes show up soon. */
const IN_PLEX_TTL_MS = 5 * 60 * 1000;
/** Counts running at once, so a page of Shows doesn't flood Plex with requests. */
const CONCURRENCY = 4;

interface Count {
  value?: number;
  /** When value was counted; 0 before it has been. */
  countedAt: number;
  counting: boolean;
  failedAt?: number;
}

/** Aired episodes, by Plex ID. They only change as days pass, so a count is good until midnight. */
const airedCounts = new Map<string, Count>();
/** Episodes in Plex, by Owned server and key. A count is good for IN_PLEX_TTL_MS, or until the server's Library index is rebuilt. */
const inPlexCounts = new Map<string, Count>();
/** Counts started and not yet finished. */
const unfinished = new Set<Promise<void>>();

/**
 * The session's EpisodeCounter. A Show without a Plex ID can't be counted, so it never has EpisodeCounts. While a
 * count that's out of date is redone, the previous one is used.
 */
export function episodeCounter(session: ConnectedSession): EpisodeCounter {
  return {
    count(show, indexBuiltAt) {
      const { plexGuid, ratingKey } = show;
      if (plexGuid === undefined) return undefined;
      const aired = cachedCount(airedCounts, plexGuid, startOfToday(), `aired episodes of ${plexGuid}`, () =>
        plexClient(session).airedEpisodeCount(plexGuid, today()),
      );
      const inPlex = cachedCount(
        inPlexCounts,
        `${session.plex_server_id} ${ratingKey}`,
        Math.max(indexBuiltAt, Date.now() - IN_PLEX_TTL_MS),
        `episodes of Show ${ratingKey} on ${session.plex_server_name}`,
        () => connectedServer(session).regularEpisodeCount(ratingKey),
      );
      return aired === undefined || inPlex === undefined ? undefined : { inPlex, aired };
    },
    async settled(maxWaitMs) {
      if (unfinished.size === 0) return;
      const started = performance.now();
      const waitingOn = unfinished.size;
      await Promise.race([Promise.allSettled(unfinished), Bun.sleep(maxWaitMs)]);
      console.debug(`Waited ${(performance.now() - started).toFixed(0)}ms for ${waitingOn} episode counts; ${unfinished.size} still counting`);
    },
  };
}

/** The count under key, if there is one, starting to count it again in the background if it's from before freshSince. */
function cachedCount(counts: Map<string, Count>, key: string, freshSince: number, what: string, count: () => Promise<number>): number | undefined {
  let entry = counts.get(key);
  if (!entry) {
    entry = { countedAt: 0, counting: false };
    counts.set(key, entry);
  }
  const current = entry;
  const failedRecently = current.failedAt !== undefined && Date.now() - current.failedAt < RETRY_AFTER_FAILURE_MS;
  if (current.countedAt < freshSince && !current.counting && !failedRecently) {
    current.counting = true;
    console.debug(`Counting ${what}${current.value === undefined ? "" : " again"} (${running} counting, ${waiting.length} waiting)`);
    const counting: Promise<void> = inTurn(count)
      .then((value) => {
        console.debug(`Counted ${value} ${what}`);
        current.value = value;
        current.countedAt = Date.now();
        current.failedAt = undefined;
      })
      .catch((error: unknown) => {
        current.failedAt = Date.now();
        console.warn(`Couldn't count ${what}:`, error);
      })
      .finally(() => {
        current.counting = false;
        unfinished.delete(counting);
      });
    unfinished.add(counting);
  }
  return current.value;
}

let running = 0;
/** Counts waiting for one running to finish; each is started by the one it takes the place of. */
const waiting: (() => void)[] = [];

/** Runs job once fewer than CONCURRENCY are running. */
async function inTurn<T>(job: () => Promise<T>): Promise<T> {
  if (running < CONCURRENCY) running++;
  else await new Promise<void>((start) => waiting.push(start));
  try {
    return await job();
  } finally {
    // Hands this one's place straight to the next, so nothing new can take it in between.
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

/** Today's date where Hoard runs, e.g. "2026-10-20". */
function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

function startOfToday(): number {
  return new Date().setHours(0, 0, 0, 0);
}
