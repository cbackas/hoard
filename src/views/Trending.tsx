import { getTrending, getTrendingStaleSince, type MediaType, type Title } from "../simkl/trending.ts";
import { knownAiredCounts } from "../airedCounts.ts";
import type { EpisodeCounter } from "../episodeCounts.ts";
import { type CollectionStatus, collectionStatus, type LibraryIndex, type LibraryIndexState } from "../libraryIndex.ts";
import { showCountsUrl } from "../paths.ts";
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

/** Whether a Partially collected Show counts as Collected ("any" episodes) or as a Gap ("complete" only). */
export const EPISODE_MODES = ["any", "complete"] as const;
export type EpisodeMode = (typeof EPISODE_MODES)[number];
export const DEFAULT_EPISODE_MODE: EpisodeMode = "any";

const EPISODE_MODE_LABELS: Record<EpisodeMode, string> = { any: "Any episodes", complete: "Complete only" };

/** The settings menu's choices, carried in the URL. */
export interface Settings {
  filter: Filter;
  episodes: EpisodeMode;
}

/** A Tab's URL, leaving out default settings and a zero offset so the usual URL is just "/all". */
function trendingUrl(tab: Tab, { filter, episodes }: Settings, offset = 0): string {
  const query = new URLSearchParams();
  if (filter !== DEFAULT_FILTER) query.set("filter", filter);
  if (episodes !== DEFAULT_EPISODE_MODE) query.set("episodes", episodes);
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
  settings,
  account,
  server,
  library,
  countEpisodes,
}: {
  tab: Tab;
  offset: number;
  settings: Settings;
  account: PlexAccount;
  server: ChosenServer;
  library: LibraryIndexState;
  countEpisodes: EpisodeCounter;
}) {
  return (
    <AppLayout
      account={account}
      server={server}
      library={library}
      nav={<TabNav currentTab={currentTab} settings={settings} />}
      actions={<SettingsMenu tab={currentTab} settings={settings} />}
    >
      <StaleNotice />
      <ul class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        <TitleBatch tab={currentTab} offset={offset} settings={settings} index={library.index} countEpisodes={countEpisodes} />
      </ul>
    </AppLayout>
  );
}

function TabNav({ currentTab, settings }: { currentTab: Tab; settings: Settings }) {
  return (
    <nav class="flex gap-1 rounded-lg bg-neutral-900 p-1">
      {TABS.map((tab) => (
        <a
          href={trendingUrl(tab, settings)}
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

const EPISODE_MODE_DESCRIPTIONS: Record<EpisodeMode, string> = {
  any: "Count a show once Plex has any of it",
  complete: "Keep shows with missing episodes visible",
};

/**
 * A button showing the current Filter that opens a menu of the settings: the Filter, and on Tabs with Shows, whether
 * Partially collected Shows count as Collected. Each choice reloads the Tab from the top.
 */
function SettingsMenu({ tab, settings }: { tab: Tab; settings: Settings }) {
  const hasShows = TAB_MEDIA_TYPES[tab].includes("show");
  const label = `Titles in Plex: ${FILTER_LABELS[settings.filter]}${hasShows ? `, shows: ${EPISODE_MODE_LABELS[settings.episodes]}` : ""}`;
  return (
    <>
      <button
        popovertarget="filter-menu"
        aria-label={label}
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
        {FILTER_LABELS[settings.filter]}
      </button>
      {/* Below the button, right edges lined up. */}
      <div
        id="filter-menu"
        popover="auto"
        class={`${MENU_PANEL} mt-2 w-64 [position-anchor:--filter-menu] [position-area:bottom_span-left]`}
      >
        <MenuHeading>Titles in Plex</MenuHeading>
        {FILTERS.map((filter) => (
          <MenuChoice
            href={trendingUrl(tab, { ...settings, filter })}
            current={filter === settings.filter}
            label={FILTER_LABELS[filter]}
            description={FILTER_DESCRIPTIONS[filter]}
          />
        ))}
        {hasShows && (
          <>
            <MenuHeading>Shows in Plex</MenuHeading>
            {EPISODE_MODES.map((episodes) => (
              <MenuChoice
                href={trendingUrl(tab, { ...settings, episodes })}
                current={episodes === settings.episodes}
                label={EPISODE_MODE_LABELS[episodes]}
                description={EPISODE_MODE_DESCRIPTIONS[episodes]}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}

/** A section heading in the settings menu, ruled off from what's above it. */
function MenuHeading({ children }: { children: string }) {
  return (
    <p class="border-b border-neutral-800 px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500 [&:not(:first-child)]:mt-1 [&:not(:first-child)]:border-t">
      {children}
    </p>
  );
}

/** A settings menu link, ticked when it's the current choice. */
function MenuChoice({ href, current, label, description }: { href: string; current: boolean; label: string; description: string }) {
  return (
    <a href={href} aria-current={current ? "true" : undefined} class={`${MENU_ITEM} flex items-start gap-2`}>
      <span class="w-4 shrink-0 text-amber-400">{current ? "✓" : ""}</span>
      <span>
        <span class="block">{label}</span>
        <span class="block text-xs text-neutral-400">{description}</span>
      </span>
    </a>
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

const GAP: CollectionStatus = { status: "gap" };
/** How long a card whose counts were still being counted waits before asking for them again. */
const SHOW_COUNTS_RETRY_DELAY = "2s";
/** How long a batch waits for episode counts it started. The first counts of the day can take longer; they carry on in the background. */
const EPISODE_COUNT_WAIT_MS = 1500;

/**
 * A batch of a tab's Trending list starting at offset, ending with a "Load more" item that swaps itself for the next
 * batch. With the Hide filter the offset counts only the Titles left after hiding. Without an index yet, nothing is
 * Collected. With "complete" episodes, a Partially collected Show counts as a Gap and shows how many of its episodes
 * Plex has; Shows are only checked for that with "complete" episodes, as it takes requests to Plex.
 */
export async function TitleBatch({
  tab,
  offset,
  settings,
  index,
  countEpisodes,
}: {
  tab: Tab;
  offset: number;
  settings: Settings;
  index: LibraryIndex | undefined;
  countEpisodes: EpisodeCounter;
}) {
  const { filter, episodes } = settings;
  // SIMKL ranks each list by watched, so sorting on it merges lists into one ranking. The sort is stable,
  // so a single list keeps SIMKL's order.
  const lists = await Promise.all(TAB_MEDIA_TYPES[tab].map(getTrending));
  const ranked = lists.flat().sort((a, b) => b.watched - a.watched);
  const statuses = () =>
    ranked.map((title) => {
      const collection = index === undefined ? GAP : collectionStatus(title, index, episodes === "complete" ? countEpisodes : undefined);
      return { title, collection, collected: collection.status === "collected" };
    });
  let all = statuses();
  if (episodes === "complete") {
    // Working out the statuses started counting the episodes of any Show whose counts were unknown or out of date.
    // Recounting a Show already counted is quick, so waiting a little means the page is up to date, not one load behind.
    await countEpisodes.settled(EPISODE_COUNT_WAIT_MS);
    all = statuses();
  }
  const titles = filter === "hide" ? all.filter(({ collected }) => !collected) : all;
  const collectedCount = all.filter(({ collected }) => collected).length;
  const partialCount = all.filter(({ collection }) => collection.status === "partial").length;
  console.debug(
    `Tab ${tab}, filter ${filter}, episodes ${episodes}, offset ${offset}: ${collectedCount} of ${all.length} Titles Collected, ${partialCount} Shows Partially collected${index ? "" : " (no Library index yet)"}`,
  );
  const end = offset + BATCH_SIZE;
  const nextOffset = end < titles.length ? end : undefined;
  if (filter === "hide" && offset === 0 && all.length > 0 && titles.length === 0) {
    return <li class="col-span-full py-16 text-center text-neutral-400">Everything on this list is already in Plex.</li>;
  }
  return (
    <>
      {titles.slice(offset, end).map(({ title, collection, collected }) => (
        <TitleCard
          title={title}
          faded={collected && filter === "fade"}
          partial={collection.status === "partial" ? collection : undefined}
        />
      ))}
      {nextOffset === undefined ? null : (
        <li class="col-span-full flex justify-center pt-4">
          <button
            class="rounded-md bg-amber-500 px-4 py-2 font-semibold text-neutral-950 hover:bg-amber-400"
            hx-get={trendingUrl(tab, settings, nextOffset)}
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

/**
 * A Title's poster and details, and for a Show, its ShowCounts; faded (dimmed, with an "In Plex" badge) when it's
 * Collected under the Fade filter. partial is set for a Partially collected Show shown as a Gap.
 */
function TitleCard({
  title,
  faded,
  partial,
}: {
  title: Title;
  faded: boolean;
  partial: { episodes: number; airedEpisodes: number } | undefined;
}) {
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
      {title.mediaType === "show" && <ShowCounts title={title} partial={partial} retry={false} />}
    </li>
  );
}

/**
 * A Show's seasons and episodes aired, e.g. "5 seasons · 62 eps", with partial (when it's Partially collected and
 * shown as a Gap) putting how many of the episodes Plex has in their place. Nothing when Plex's online metadata
 * doesn't know the Show. Until it's been counted, a placeholder the same size, which fetches the counts once it's on
 * screen; retry is set when they were still being counted then, so it asks again shortly.
 */
export function ShowCounts({
  title,
  partial,
  retry,
}: {
  title: Title;
  partial: { episodes: number; airedEpisodes: number } | undefined;
  retry: boolean;
}) {
  const counts = knownAiredCounts(title);
  if (counts === null) return <></>;
  if (counts === undefined) {
    return (
      <p
        class="text-xs"
        aria-busy="true"
        hx-get={showCountsUrl(title.simklId)}
        hx-trigger={retry ? `load delay:${SHOW_COUNTS_RETRY_DELAY}` : "intersect once"}
        hx-swap="outerHTML"
      >
        <span class="inline-block h-3 w-24 animate-pulse rounded bg-neutral-800 align-middle" />
      </p>
    );
  }
  if (counts.seasons === 0) return <p class="text-xs text-neutral-400">Not aired yet</p>;
  return (
    <p class="text-xs text-neutral-400">
      {`${counts.seasons} ${counts.seasons === 1 ? "season" : "seasons"} · `}
      {partial ? (
        <span class="text-amber-400" title={`Plex has ${partial.episodes} of the ${partial.airedEpisodes} episodes aired`}>
          {`${partial.episodes}/${partial.airedEpisodes} eps`}
        </span>
      ) : (
        `${counts.episodes} ${counts.episodes === 1 ? "ep" : "eps"}`
      )}
    </p>
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
