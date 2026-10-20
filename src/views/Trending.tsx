import { getTrending, getTrendingStaleSince, type MediaType, type Title } from "../simkl/trending.ts";
import { isCollected, type LibraryIndex, type LibraryIndexState } from "../libraryIndex.ts";
import type { ChosenServer } from "../plex/server.ts";
import type { PlexAccount } from "../plex/tv.ts";
import { AppLayout } from "./AppLayout.tsx";
import { MENU_ITEM, MENU_PANEL } from "./menu.ts";

export const TABS = ["all", "shows", "movies"] as const;
export type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = { all: "All", shows: "Shows", movies: "Movies" };

/** How Collected Titles are presented: shown normally, dimmed with an "In Plex" badge, or removed. */
export const FILTERS = ["off", "fade", "hide"] as const;
export type Filter = (typeof FILTERS)[number];
export const DEFAULT_FILTER: Filter = "fade";

const FILTER_LABELS: Record<Filter, string> = { off: "Off", fade: "Fade", hide: "Hide" };

/** A Tab's URL, leaving out the default filter and a zero offset so the usual URL is just "/all". */
function trendingUrl(tab: Tab, filter: Filter, offset = 0): string {
  const query = new URLSearchParams();
  if (filter !== DEFAULT_FILTER) query.set("filter", filter);
  if (offset > 0) query.set("offset", String(offset));
  const search = query.toString();
  return search ? `/${tab}?${search}` : `/${tab}`;
}

/**
 * How many Titles the first page and each "Load more" shows. A multiple of the grid's column counts
 * (2, 3, 4, 6 and 8) so every batch fills whole rows.
 */
const BATCH_SIZE = 96;
const TAB_MEDIA_TYPES: Record<Tab, MediaType[]> = { all: ["show", "movie"], shows: ["show"], movies: ["movie"] };

export function TrendingPage({
  tab: currentTab,
  offset,
  filter,
  account,
  server,
  library,
}: {
  tab: Tab;
  offset: number;
  filter: Filter;
  account: PlexAccount;
  server: ChosenServer;
  library: LibraryIndexState;
}) {
  return (
    <AppLayout
      account={account}
      server={server}
      library={library}
      nav={<TabNav currentTab={currentTab} filter={filter} />}
      actions={<FilterMenu tab={currentTab} currentFilter={filter} />}
    >
      <StaleNotice />
      <ul class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        <TitleBatch tab={currentTab} offset={offset} filter={filter} index={library.index} />
      </ul>
    </AppLayout>
  );
}

function TabNav({ currentTab, filter }: { currentTab: Tab; filter: Filter }) {
  return (
    <nav class="flex gap-1 rounded-lg bg-neutral-900 p-1">
      {TABS.map((tab) => (
        <a
          href={trendingUrl(tab, filter)}
          aria-current={tab === currentTab ? "page" : undefined}
          class="rounded-md px-4 py-1.5 text-sm font-medium text-neutral-400 hover:text-neutral-100 aria-[current=page]:bg-neutral-700 aria-[current=page]:text-neutral-100"
        >
          {TAB_LABELS[tab]}
        </a>
      ))}
    </nav>
  );
}

const FILTER_DESCRIPTIONS: Record<Filter, string> = {
  off: "Show them like any other title",
  fade: "Dim them with an “In Plex” badge",
  hide: "Show only titles not in Plex",
};

/** A button showing the current Filter that opens a menu to choose another; each choice reloads the Tab from the top. */
function FilterMenu({ tab, currentFilter }: { tab: Tab; currentFilter: Filter }) {
  return (
    <>
      <button
        popovertarget="filter-menu"
        aria-label={`Titles in Plex: ${FILTER_LABELS[currentFilter]}`}
        class="flex cursor-pointer items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100 [anchor-name:--filter-menu] hover:bg-neutral-800"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          class="size-4 text-neutral-400"
        >
          <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" />
        </svg>
        {FILTER_LABELS[currentFilter]}
      </button>
      {/* Below the button, right edges lined up. */}
      <div
        id="filter-menu"
        popover="auto"
        class={`${MENU_PANEL} mt-2 w-64 [position-anchor:--filter-menu] [position-area:bottom_span-left]`}
      >
        <p class="border-b border-neutral-800 px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Titles in Plex
        </p>
        {FILTERS.map((filter) => (
          <a
            href={trendingUrl(tab, filter)}
            aria-current={filter === currentFilter ? "true" : undefined}
            class={`${MENU_ITEM} flex items-start gap-2`}
          >
            <span class="w-4 shrink-0 text-amber-400">{filter === currentFilter ? "✓" : ""}</span>
            <span>
              <span class="block">{FILTER_LABELS[filter]}</span>
              <span class="block text-xs text-neutral-400">{FILTER_DESCRIPTIONS[filter]}</span>
            </span>
          </a>
        ))}
      </div>
    </>
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

/**
 * A batch of a tab's Trending list starting at offset, ending with a "Load more" item that swaps itself for the next
 * batch. With the Hide filter the offset counts only the Titles left after hiding. Without an index yet, nothing is
 * Collected.
 */
export async function TitleBatch({
  tab,
  offset,
  filter,
  index,
}: {
  tab: Tab;
  offset: number;
  filter: Filter;
  index: LibraryIndex | undefined;
}) {
  // SIMKL ranks each list by watched, so sorting on it merges lists into one ranking. The sort is stable,
  // so a single list keeps SIMKL's order.
  const lists = await Promise.all(TAB_MEDIA_TYPES[tab].map(getTrending));
  const all = lists
    .flat()
    .sort((a, b) => b.watched - a.watched)
    .map((title) => ({ title, collected: index !== undefined && isCollected(title, index) }));
  const titles = filter === "hide" ? all.filter(({ collected }) => !collected) : all;
  const collectedCount = all.filter(({ collected }) => collected).length;
  console.debug(
    `Tab ${tab}, filter ${filter}, offset ${offset}: ${collectedCount} of ${all.length} Titles Collected${index ? "" : " (no Library index yet)"}`,
  );
  const end = offset + BATCH_SIZE;
  const nextOffset = end < titles.length ? end : undefined;
  if (filter === "hide" && offset === 0 && all.length > 0 && titles.length === 0) {
    return <li class="col-span-full py-16 text-center text-neutral-400">Everything on this list is already in Plex.</li>;
  }
  return (
    <>
      {titles.slice(offset, end).map(({ title, collected }) => (
        <TitleCard title={title} faded={collected && filter === "fade"} />
      ))}
      {nextOffset === undefined ? null : (
        <li class="col-span-full flex justify-center pt-4">
          <button
            class="rounded-md bg-amber-500 px-4 py-2 font-semibold text-neutral-950 hover:bg-amber-400"
            hx-get={trendingUrl(tab, filter, nextOffset)}
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

/** A Title's poster and details; faded (dimmed, with an "In Plex" badge) when it's Collected under the Fade filter. */
function TitleCard({ title, faded }: { title: Title; faded: boolean }) {
  const details = [title.year, title.rating === undefined ? undefined : `★ ${title.rating.toFixed(1)}`]
    .filter((detail) => detail !== undefined)
    .join(" · ");
  return (
    <li class={faded ? "opacity-40 transition-opacity hover:opacity-100 focus-within:opacity-100" : undefined}>
      <div class="relative">
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
        {faded && (
          <span class="absolute top-2 left-2 rounded bg-neutral-950/85 px-1.5 py-0.5 text-xs font-semibold text-amber-400">
            In Plex
          </span>
        )}
      </div>
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
