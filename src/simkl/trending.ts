import { z } from "zod";

const TRENDING_URL = "https://data.simkl.in/discover/trending/today_500.json";
const POSTER_BASE_URL = "https://simkl.in/posters/";
// SIMKL regenerates the file daily and serves it with max-age=3600, so refetching more often gains nothing.
const CACHE_TTL_MS = 60 * 60 * 1000;

export type MediaType = "show" | "movie";

/** A Title as shown on the Trending list. */
export interface Title {
  mediaType: MediaType;
  name: string;
  year: number | undefined;
  rating: number | undefined;
  posterUrl: string | undefined;
  /** How many SIMKL users watched it today; what SIMKL ranks the Trending list by. */
  watched: number;
}

type TrendingLists = Record<MediaType, Title[]>;

/** A SIMKL trending item, reduced to a Title (minus its media type, which comes from its list). Optional fields that are missing or malformed become undefined. */
const simklItem = z
  .object({
    title: z.string().min(1),
    watched: z.number().int().nonnegative().catch(0),
    // e.g. "07/29/2026"
    release_date: z
      .string()
      .regex(/^\d{2}\/\d{2}\/\d{4}$/)
      .transform((date) => Number(date.slice(-4)))
      .optional()
      .catch(undefined),
    ratings: z
      .object({ simkl: z.object({ rating: z.number() }) })
      .optional()
      .catch(undefined),
    // e.g. "20/206580538447a41c39"; "_m" is the medium size.
    poster: z
      .string()
      .regex(/^[\w/]+$/)
      .transform((poster) => `${POSTER_BASE_URL}${poster}_m.webp`)
      .optional()
      .catch(undefined),
  })
  .transform(
    (item): Omit<Title, "mediaType"> => ({
      name: item.title,
      year: item.release_date,
      rating: item.ratings?.simkl.rating,
      posterUrl: item.poster,
      watched: item.watched,
    }),
  );

/** A list of SIMKL items as Titles. An unusable item is logged and dropped rather than failing the whole list. */
const titleList = (mediaType: MediaType) =>
  z
    .array(
      simklItem.nullable().catch(({ error, value }) => {
        console.debug("Skipping unusable SIMKL item:", z.prettifyError(error), value);
        return null;
      }),
    )
    .transform((titles) => titles.filter((title) => title !== null).map((title): Title => ({ ...title, mediaType })));

const trendingResponse = z.object({ tv: titleList("show"), movies: titleList("movie") });

let cached: { lists: TrendingLists; fetchedAt: number } | undefined;
// Shared by requests that arrive while a fetch is running, so they don't each start one.
let inFlight: Promise<TrendingLists> | undefined;

/** The Trending list for a media type, in SIMKL's order. Cached in memory for an hour. */
export async function getTrending(mediaType: MediaType): Promise<Title[]> {
  const lists = await loadLists();
  return lists[mediaType];
}

function loadLists(): Promise<TrendingLists> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    console.debug("SIMKL trending cache hit, age", Math.round((Date.now() - cached.fetchedAt) / 1000), "s");
    return Promise.resolve(cached.lists);
  }
  if (inFlight) {
    console.debug("SIMKL trending fetch already running; waiting on it");
    return inFlight;
  }
  console.debug(cached ? "SIMKL trending cache expired; refetching" : "SIMKL trending cache empty; fetching");
  inFlight = fetchLists()
    .then((lists) => {
      cached = { lists, fetchedAt: Date.now() };
      return lists;
    })
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

async function fetchLists(): Promise<TrendingLists> {
  const started = performance.now();
  const response = await fetch(TRENDING_URL);
  if (!response.ok) throw new Error(`SIMKL trending request failed: ${response.status} ${response.statusText}`);
  const { tv, movies } = trendingResponse.parse(await response.json());
  const lists = { show: tv, movie: movies };
  const ms = (performance.now() - started).toFixed(0);
  console.info(`Fetched SIMKL trending list: ${lists.show.length} shows, ${lists.movie.length} movies (${ms}ms)`);
  return lists;
}
