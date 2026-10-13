import { getTrending, getTrendingStaleSince, type MediaType, type Title } from "../simkl/trending.ts";
import { Layout } from "./Layout.tsx";

export const TABS = ["all", "shows", "movies"] as const;
export type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = { all: "All", shows: "Shows", movies: "Movies" };

/**
 * How many Titles the first page and each "Load more" shows. A multiple of the grid's column counts
 * (2, 3, 4, 6 and 8) so every batch fills whole rows.
 */
const BATCH_SIZE = 96;
const TAB_MEDIA_TYPES: Record<Tab, MediaType[]> = { all: ["show", "movie"], shows: ["show"], movies: ["movie"] };

export function TrendingPage({ tab: currentTab, offset }: { tab: Tab; offset: number }) {
  return (
    <Layout title="Hoard">
      <header class="flex items-center justify-between gap-6 px-6 py-6">
        <h1 class="text-3xl font-bold tracking-tight">Hoard</h1>
        <nav class="flex gap-1 rounded-lg bg-neutral-900 p-1">
          {TABS.map((tab) => (
            <a
              href={`/${tab}`}
              aria-current={tab === currentTab ? "page" : undefined}
              class="rounded-md px-4 py-1.5 text-sm font-medium text-neutral-400 hover:text-neutral-100 aria-[current=page]:bg-neutral-700 aria-[current=page]:text-neutral-100"
            >
              {TAB_LABELS[tab]}
            </a>
          ))}
        </nav>
      </header>
      <main class="px-6 pb-16">
        <StaleNotice />
        <ul class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          <TitleBatch tab={currentTab} offset={offset} />
        </ul>
      </main>
    </Layout>
  );
}

/** Says so when SIMKL couldn't be reached and the list on screen is an older copy. */
async function StaleNotice() {
  const staleSince = await getTrendingStaleSince();
  if (!staleSince) return <></>;
  const hours = Math.max(1, Math.round((Date.now() - staleSince.getTime()) / (60 * 60 * 1000)));
  const age = new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-hours, "hour");
  return (
    <p role="status" class="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
      {`Couldn't reach SIMKL, so this list is out of date. It was last updated ${age}.`}
    </p>
  );
}

/** A batch of a tab's Trending list starting at offset, ending with a "Load more" item that swaps itself for the next batch. */
export async function TitleBatch({ tab, offset }: { tab: Tab; offset: number }) {
  // SIMKL ranks each list by watched, so sorting on it merges lists into one ranking. The sort is stable,
  // so a single list keeps SIMKL's order.
  const lists = await Promise.all(TAB_MEDIA_TYPES[tab].map(getTrending));
  const titles = lists.flat().sort((a, b) => b.watched - a.watched);
  const end = offset + BATCH_SIZE;
  const nextOffset = end < titles.length ? end : undefined;
  return (
    <>
      {titles.slice(offset, end).map((title) => (
        <TitleCard title={title} />
      ))}
      {nextOffset === undefined ? null : (
        <li class="col-span-full flex justify-center pt-4">
          <button
            class="rounded-md bg-amber-500 px-4 py-2 font-semibold text-neutral-950 hover:bg-amber-400"
            hx-get={`/${tab}?offset=${nextOffset}`}
            hx-target="closest li"
            hx-swap="outerHTML"
          >
            Load more
          </button>
        </li>
      )}
    </>
  );
}

function TitleCard({ title }: { title: Title }) {
  const details = [title.year, title.rating === undefined ? undefined : `★ ${title.rating.toFixed(1)}`]
    .filter((detail) => detail !== undefined)
    .join(" · ");
  return (
    <li>
      {title.posterUrl ? (
        <img
          src={title.posterUrl}
          alt=""
          loading="lazy"
          width="200"
          height="300"
          class="aspect-2/3 w-full rounded-md bg-neutral-800 object-cover"
        />
      ) : (
        <div class="aspect-2/3 w-full rounded-md bg-neutral-800" />
      )}
      <p class="mt-2 flex items-center gap-1.5 text-sm font-medium" title={title.name}>
        <MediaTypeIcon mediaType={title.mediaType} />
        <span class="truncate">{title.name}</span>
      </p>
      <p class="text-xs text-neutral-400">{details}</p>
    </li>
  );
}

const MEDIA_TYPE_LABELS: Record<MediaType, string> = { show: "Show", movie: "Movie" };

/** A small TV or film-strip icon, labelled for screen readers. */
function MediaTypeIcon({ mediaType }: { mediaType: MediaType }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      role="img"
      aria-label={MEDIA_TYPE_LABELS[mediaType]}
      class="size-3.5 shrink-0 text-neutral-500"
    >
      <title>{MEDIA_TYPE_LABELS[mediaType]}</title>
      {mediaType === "show" ? (
        <>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="m7 2 5 5 5-5" />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4" />
        </>
      )}
    </svg>
  );
}
