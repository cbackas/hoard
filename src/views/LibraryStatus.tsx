import type { LibraryIndexState } from "../libraryIndex.ts";
import { LIBRARY_PATH } from "../paths.ts";

export const LIBRARY_STATUS_ID = "library-status";
/** How often the counts are fetched again while the index builds. */
const POLL_DELAY = "2s";

const numberFormat = new Intl.NumberFormat("en");

function count(n: number, singular: string, plural: string): string {
  return `${numberFormat.format(n)} ${n === 1 ? singular : plural}`;
}

/**
 * How many Movies and Shows the Library index holds, for the header. While the index builds, it says so and
 * replaces itself with a fresh copy every POLL_DELAY until the build is done.
 */
export function LibraryStatus({ state: { index, building } }: { state: LibraryIndexState }) {
  const text = index
    ? `${count(index.movieCount, "movie", "movies")} · ${count(index.showCount, "show", "shows")}${building ? " · Refreshing…" : ""}`
    : building
      ? "Indexing library…"
      : "Couldn't index library";
  return (
    <p
      id={LIBRARY_STATUS_ID}
      role="status"
      class="truncate text-sm text-neutral-500"
      {...(building && { "hx-get": LIBRARY_PATH, "hx-trigger": `load delay:${POLL_DELAY}`, "hx-swap": "outerHTML" })}
    >
      {text}
    </p>
  );
}
