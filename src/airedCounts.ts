import { db } from "./db/index.ts";
import { plexClient } from "./ownedServers.ts";
import type { AiredCounts, PlexClient } from "./plex/client.ts";
import type { SignedInSession } from "./sessions.ts";
import type { Title } from "./simkl/trending.ts";

// How much of each Trending Show has aired, from Plex's online metadata, for its card and for telling whether it's
// Partially collected. Every Trending Show is counted once a day in the background, using the token of whichever
// Signed in session asked for a Tab, and counts are saved so a restart doesn't count them all again. A Show someone's
// waiting on, e.g. a card on screen, is counted ahead of the rest.

export type { AiredCounts };

/** Counts running at once, so counting the whole list doesn't flood Plex with requests. */
const CONCURRENCY = 4;
/** After a failed count, the next attempt waits this long, so a Show that can't be counted isn't asked about over and over. */
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
/** Saved counts of Shows not counted for this long are deleted on start; they've dropped off the Trending list. */
const FORGET_AFTER_DAYS = 30;

interface Entry {
  /** null when Plex's online metadata doesn't know the Show; undefined until it's first counted. */
  counts: AiredCounts | null | undefined;
  /** The day counts are for, "YYYY-MM-DD". */
  countedOn: string | undefined;
  failedAt?: number;
  /** Set while a count is waiting or running; settles when it finishes, whether or not it worked. */
  pending?: Promise<void>;
  finish?: () => void;
  running?: boolean;
}

interface Job {
  title: Title;
  client: PlexClient;
}

/** By SIMKL ID. */
const entries = new Map<number, Entry>();
/** Shows someone's waiting on, counted before the background ones. */
const urgent: Job[] = [];
const background: Job[] = [];
let workers = 0;
let loaded: Promise<void> | undefined;

/** Reads the saved counts, once. Everything else here needs it to have settled. */
export function loadAiredCounts(): Promise<void> {
  loaded ??= loadSaved();
  return loaded;
}

/**
 * The Show's AiredCounts as last counted, which may be from an earlier day while today's count is pending: null if
 * Plex's online metadata doesn't know it, undefined if it hasn't been counted. Call once loadAiredCounts has settled.
 */
export function knownAiredCounts(title: Title): AiredCounts | null | undefined {
  return entries.get(title.simklId)?.counts;
}

/** Starts counting, in the background, every one of these Shows not yet counted today, in the order given. */
export async function countAiredInBackground(session: SignedInSession, shows: Title[]): Promise<void> {
  await loadAiredCounts();
  const today = localDate();
  const client = plexClient(session);
  const jobs = shows.filter((title) => needsCount(entryFor(title), today)).map((title) => ({ title, client }));
  if (jobs.length === 0) return;
  // Marked as waiting, so the next call doesn't add them again.
  for (const { title } of jobs) queue(title);
  background.push(...jobs);
  console.debug(`Counting aired episodes of ${jobs.length} Trending Shows in the background (${workers} counting, ${urgent.length} waiting ahead)`);
  startWorkers();
}

/**
 * Counts the Show ahead of the background ones, unless it's been counted today. Returns what to wait on for the count,
 * or undefined if there's none to wait for: it's counted, or it failed recently. Call once loadAiredCounts has settled.
 */
export function countAiredSoon(session: SignedInSession, title: Title): Promise<void> | undefined {
  const entry = entryFor(title);
  if (entry.running) return entry.pending;
  if (!entry.pending && !needsCount(entry, localDate())) return undefined;
  const pending = queue(title);
  console.debug(`Counting aired episodes of ${title.name} (SIMKL ${title.simklId}) ahead of the background ones`);
  urgent.push({ title, client: plexClient(session) });
  startWorkers();
  return pending;
}

function entryFor(title: Title): Entry {
  let entry = entries.get(title.simklId);
  if (!entry) {
    entry = { counts: undefined, countedOn: undefined };
    entries.set(title.simklId, entry);
  }
  return entry;
}

function needsCount(entry: Entry, today: string): boolean {
  if (entry.pending || entry.countedOn === today) return false;
  return entry.failedAt === undefined || Date.now() - entry.failedAt >= RETRY_AFTER_FAILURE_MS;
}

/** Marks the Show as waiting to be counted, if it isn't already, and returns what settles once it has been. */
function queue(title: Title): Promise<void> {
  const entry = entryFor(title);
  entry.pending ??= new Promise<void>((resolve) => {
    entry.finish = resolve;
  });
  return entry.pending;
}

function startWorkers(): void {
  while (workers < CONCURRENCY && (urgent.length > 0 || background.length > 0)) {
    workers++;
    void work().finally(() => {
      workers--;
    });
  }
}

async function work(): Promise<void> {
  for (let job = nextJob(); job; job = nextJob()) await count(job);
}

/** The next Show waiting to be counted. A Show can be in both lists, so whichever comes second is skipped. */
function nextJob(): Job | undefined {
  for (;;) {
    const job = urgent.shift() ?? background.shift();
    if (!job) return undefined;
    const entry = entries.get(job.title.simklId);
    if (entry?.pending && !entry.running) return job;
  }
}

async function count({ title, client }: Job): Promise<void> {
  const entry = entryFor(title);
  entry.running = true;
  const today = localDate();
  try {
    const counts = (await client.airedCounts(title.externalIds, today)) ?? null;
    if (counts === null) console.debug(`Plex's online metadata doesn't know ${title.name} (SIMKL ${title.simklId})`);
    entry.counts = counts;
    entry.countedOn = today;
    entry.failedAt = undefined;
    await save(title.simklId, counts, today);
  } catch (error) {
    entry.failedAt = Date.now();
    console.warn(`Couldn't count the aired episodes of ${title.name} (SIMKL ${title.simklId}):`, error);
  } finally {
    entry.running = false;
    entry.finish?.();
    entry.pending = undefined;
    entry.finish = undefined;
  }
}

async function save(simklId: number, counts: AiredCounts | null, countedOn: string): Promise<void> {
  const values = { seasons: counts?.seasons ?? null, episodes: counts?.episodes ?? null, counted_on: countedOn };
  try {
    await db
      .insertInto("aired_counts")
      .values({ simkl_id: simklId, ...values })
      .onConflict((oc) => oc.column("simkl_id").doUpdateSet(values))
      .execute();
  } catch (error) {
    // It's still used from memory; it just has to be counted again after a restart.
    console.warn(`Couldn't save the aired counts of SIMKL ${simklId}:`, error);
  }
}

async function loadSaved(): Promise<void> {
  const started = performance.now();
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - FORGET_AFTER_DAYS);
    const forgotten = await db.deleteFrom("aired_counts").where("counted_on", "<", localDate(cutoff)).executeTakeFirst();
    const rows = await db.selectFrom("aired_counts").selectAll().execute();
    for (const row of rows) {
      const counts = row.seasons === null || row.episodes === null ? null : { seasons: row.seasons, episodes: row.episodes };
      entries.set(row.simkl_id, { counts, countedOn: row.counted_on });
    }
    const ms = (performance.now() - started).toFixed(0);
    console.debug(`Loaded the saved aired counts of ${rows.length} Shows, forgot ${forgotten.numDeletedRows} not counted in ${FORGET_AFTER_DAYS} days (${ms}ms)`);
  } catch (error) {
    console.warn("Couldn't read the saved aired counts; counting them again:", error);
  }
}

/** The date where Hoard runs, e.g. "2026-10-20"; an episode counts as aired from the day after its air date. */
function localDate(date = new Date()): string {
  return date.toLocaleDateString("en-CA");
}
