import { z } from "zod";
import type { MediaType } from "../simkl/trending.ts";
import type { PlexServer } from "./server.ts";

// Reading the Owned server's Movie and Show Libraries.

/** Items are fetched this many at a time, so a big Library doesn't come back as one huge response. */
const PAGE_SIZE = 500;
/** The External ID sources Hoard matches on. Plex writes each as e.g. "imdb://tt0111161". */
const EXTERNAL_ID_SOURCES = ["imdb", "tmdb", "tvdb"];

const PLEX_LIBRARY_TYPES: Record<string, MediaType> = { movie: "movie", show: "show" };

// Every library section, music and photos included. Directory is missing when the server has none.
const sectionsResponse = z.object({
  MediaContainer: z.object({ Directory: z.array(z.object({ key: z.string(), type: z.string(), title: z.string() })).default([]) }),
});

// One page of a section's items. totalSize is only sent because the request asks for a page. Each item is
// checked on its own, so one described unexpectedly doesn't lose the rest.
const itemsResponse = z.object({
  MediaContainer: z.object({ totalSize: z.number().int().nonnegative(), Metadata: z.array(z.unknown()).default([]) }),
});
const item = z.object({
  title: z.string(),
  // Missing for items matched by Plex's legacy agents, which only have a single agent-specific guid.
  Guid: z.array(z.object({ id: z.string() })).default([]),
  // A Show's episode count.
  leafCount: z.number().int().nonnegative().optional(),
});

/** A Movie or Show Library. */
export interface Library {
  key: string;
  title: string;
  mediaType: MediaType;
}

/** An item in a Library: its External IDs, e.g. "imdb://tt0111161", and for a Show, its episode count. */
export interface LibraryItem {
  externalIds: string[];
  episodeCount: number | undefined;
}

/** The server's Movie and Show Libraries; other types are left out. */
export async function getLibraries(server: PlexServer): Promise<Library[]> {
  const { Directory } = (await server.get("/library/sections", sectionsResponse)).MediaContainer;
  const libraries: Library[] = [];
  for (const { key, type, title } of Directory) {
    const mediaType = PLEX_LIBRARY_TYPES[type];
    if (mediaType) libraries.push({ key, title, mediaType });
    else console.debug(`Ignoring ${type} Library ${title}`);
  }
  return libraries;
}

/** Every item in the Library that has an External ID. Items without one can't be matched, so they're counted in a log and left out. */
export async function getLibraryItems(server: PlexServer, library: Library): Promise<LibraryItem[]> {
  const items: LibraryItem[] = [];
  let skipped = 0;
  let totalSize = Infinity;
  for (let start = 0; start < totalSize; start += PAGE_SIZE) {
    const params = new URLSearchParams({ includeGuids: "1", "X-Plex-Container-Start": `${start}`, "X-Plex-Container-Size": `${PAGE_SIZE}` });
    const page = (await server.get(`/library/sections/${encodeURIComponent(library.key)}/all?${params}`, itemsResponse)).MediaContainer;
    totalSize = page.totalSize;
    console.debug(`Library ${library.title}: fetched items ${start}–${start + page.Metadata.length} of ${totalSize}`);
    // An empty page means the Library shrank while being read; stop rather than ask for pages that won't come.
    if (page.Metadata.length === 0) break;
    for (const value of page.Metadata) {
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
      items.push({ externalIds, episodeCount: parsed.data.leafCount });
    }
  }
  if (skipped > 0) console.debug(`Library ${library.title}: left out ${skipped} items without a usable External ID`);
  return items;
}
