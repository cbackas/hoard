import { getTrending, type MediaType, type Title } from "../simkl/trending.ts";
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
        <ul class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          <TitleBatch tab={currentTab} offset={offset} />
        </ul>
      </main>
    </Layout>
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
      <p class="mt-2 truncate text-sm font-medium" title={title.name}>
        {title.name}
      </p>
      <p class="text-xs text-neutral-400">{details}</p>
    </li>
  );
}
