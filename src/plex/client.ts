import { z } from "zod";
import { PlexHost } from "./request.ts";
import { type ChosenServer, PlexServer } from "./server.ts";
import { type OwnedServer, PLEX_TV_URL, type PlexAccount, resource, resourcesResponse, userResponse } from "./tv.ts";

// Plex's online metadata service: what Plex knows about a Show from its own agents, aired or not, whether or not
// it's in a Library. It's undocumented, but it's what Plex's own apps read (see ADR 0008).
const METADATA_URL = "https://metadata.provider.plex.tv";
/** Seasons or episodes asked for at a time; more than nearly any Show has, so it's usually one page. */
const METADATA_PAGE_SIZE = 200;

// A Show's seasons and a season's episodes in Plex's online metadata. Dates are "YYYY-MM-DD"; an episode without
// one isn't scheduled yet.
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined);
const season = z.object({
  ratingKey: z.string().min(1),
  index: z.number().int(),
  leafCount: z.number().int().nonnegative().default(0),
  lastEpisodeOriginallyAvailableAt: date,
  // Only set while the season has an episode still to come.
  nextEpisodeOriginallyAvailableAt: date,
});
const episode = z.object({ originallyAvailableAt: date });
// A lookup by External ID; nothing in Metadata when the service doesn't know it.
const matchesResponse = z.object({ MediaContainer: z.object({ Metadata: z.array(z.unknown()).default([]) }) });
// With includeChildren, a Show comes with its seasons. childCount leaves specials out.
const matchedShow = z.object({
  ratingKey: z.string().min(1),
  title: z.string().optional(),
  childCount: z.number().int().nonnegative().default(0),
  Children: z.object({ Metadata: z.array(z.unknown()).default([]) }).optional(),
});
/** The type number Plex's metadata service uses for Shows. */
const SHOW_TYPE = 2;

/** How much of a Show has aired: seasons with an episode aired, and episodes aired. Specials (season 0) aren't counted. */
export interface AiredCounts {
  seasons: number;
  episodes: number;
}

/**
 * Plex, as a signed-in account: plex.tv for the account itself, Plex's online metadata, and the account's Owned
 * servers, all asked with its token. The token is kept private, so logging a PlexClient doesn't show it.
 */
export class PlexClient {
  readonly #token: string;
  readonly #tv: PlexHost;
  readonly #metadata: PlexHost;

  constructor(token: string) {
    this.#token = token;
    this.#tv = new PlexHost({ name: "plex.tv", baseUrl: PLEX_TV_URL, token });
    this.#metadata = new PlexHost({ name: "Plex metadata", baseUrl: METADATA_URL, token });
  }

  /** The account the token belongs to. */
  user(): Promise<PlexAccount> {
    return this.#tv.get("/user", userResponse);
  }

  /** The account's Owned servers. Servers shared with it, and devices that aren't servers, are left out. */
  async ownedServers(): Promise<OwnedServer[]> {
    const resources = await this.#tv.get("/resources?includeHttps=1&includeRelay=1", resourcesResponse);
    const servers: OwnedServer[] = [];
    for (const raw of resources) {
      const parsed = resource.safeParse(raw);
      if (!parsed.success) {
        console.debug("Skipping a Plex device plex.tv described unexpectedly:", z.prettifyError(parsed.error));
        continue;
      }
      const device = parsed.data;
      if (!device.owned || !device.provides.split(",").includes("server")) continue;
      servers.push({
        id: device.clientIdentifier,
        name: device.name,
        connections: device.connections.map((connection) => ({
          uri: connection.uri,
          kind: connection.relay ? "relay" : connection.local ? "local" : "remote",
        })),
      });
    }
    console.debug(`Account has ${resources.length} Plex devices, ${servers.length} of them Owned servers:`, servers.map((server) => server.name));
    return servers;
  }

  /**
   * How much of the Show with these External IDs (e.g. "tvdb://426669") aired before today, a "YYYY-MM-DD" date, or
   * undefined if Plex's metadata service knows none of them. The IDs are tried in turn until one is found. A season
   * that has finished airing is counted from its total, so only a season with episodes still to come has its
   * episodes fetched; usually it's a single request.
   */
  async airedCounts(externalIds: string[], today: string): Promise<AiredCounts | undefined> {
    for (const id of externalIds) {
      const path = `/library/metadata/matches?type=${SHOW_TYPE}&includeChildren=1&guid=${encodeURIComponent(id)}`;
      const [raw] = (await this.#metadata.get(path, matchesResponse)).MediaContainer.Metadata;
      if (raw === undefined) {
        console.debug(`Plex's metadata service doesn't know ${id}`);
        continue;
      }
      const parsed = matchedShow.safeParse(raw);
      if (!parsed.success) {
        console.debug(`Skipping ${id}, which Plex described unexpectedly:`, z.prettifyError(parsed.error));
        continue;
      }
      const { ratingKey, title, childCount, Children } = parsed.data;
      let seasons = Children?.Metadata ?? [];
      // The seasons came complete with every Show tried, even one with 54, but if some are missing they're fetched in full.
      const regularSeasons = seasons.filter((raw) => (season.safeParse(raw).data?.index ?? 0) > 0).length;
      if (regularSeasons < childCount) {
        console.debug(`${id} came with ${regularSeasons} of its ${childCount} seasons; fetching them all`);
        seasons = await this.#children(ratingKey);
      }
      const counts = await this.#countAired(id, seasons, today);
      console.debug(`${title ?? id} (${id}) aired ${counts.episodes} episodes in ${counts.seasons} seasons before ${today}`);
      return counts;
    }
    return undefined;
  }

  /** The account's Owned server, through its Connection in use. */
  server(chosen: ChosenServer): PlexServer {
    return new PlexServer(chosen, this.#token);
  }

  /** Counts a Show's seasons and episodes aired before today; id is the External ID it was found by, for logs. */
  async #countAired(id: string, seasons: unknown[], today: string): Promise<AiredCounts> {
    const counts: AiredCounts = { seasons: 0, episodes: 0 };
    for (const raw of seasons) {
      const parsed = season.safeParse(raw);
      if (!parsed.success) {
        console.debug(`Skipping a season of ${id} Plex described unexpectedly:`, z.prettifyError(parsed.error));
        continue;
      }
      const { ratingKey, index, leafCount, lastEpisodeOriginallyAvailableAt: last, nextEpisodeOriginallyAvailableAt: next } = parsed.data;
      if (index <= 0 || last === undefined) continue;
      if (next === undefined && last < today) {
        counts.seasons++;
        counts.episodes += leafCount;
        continue;
      }
      const episodes = await this.#children(ratingKey);
      const airedInSeason = episodes.filter((raw) => {
        const airDate = episode.safeParse(raw).data?.originallyAvailableAt;
        return airDate !== undefined && airDate < today;
      }).length;
      console.debug(`${id} season ${index} is still airing: ${airedInSeason} of ${episodes.length} episodes aired before ${today}`);
      if (airedInSeason > 0) counts.seasons++;
      counts.episodes += airedInSeason;
    }
    return counts;
  }

  /** Every child of the metadata item with this key: a Show's seasons or a season's episodes. */
  #children(key: string): Promise<unknown[]> {
    return this.#metadata.getAll(`/library/metadata/${encodeURIComponent(key)}/children`, { pageSize: METADATA_PAGE_SIZE });
  }
}
