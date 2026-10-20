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
   * How many episodes of the Show with this Plex ID (e.g. "plex://show/5d9c086eba6eb9001fba3d37") aired before today,
   * a "YYYY-MM-DD" date; specials (season 0) aren't counted. A season that has finished airing is counted from its
   * total, so only a season with episodes still to come has its episodes fetched.
   */
  async airedEpisodeCount(plexGuid: string, today: string): Promise<number> {
    let aired = 0;
    for (const raw of await this.#children(plexGuid.replace("plex://show/", ""))) {
      const parsed = season.safeParse(raw);
      if (!parsed.success) {
        console.debug(`Skipping a season of ${plexGuid} Plex described unexpectedly:`, z.prettifyError(parsed.error));
        continue;
      }
      const { ratingKey, index, leafCount, lastEpisodeOriginallyAvailableAt: last, nextEpisodeOriginallyAvailableAt: next } = parsed.data;
      if (index <= 0 || last === undefined) continue;
      if (next === undefined && last < today) {
        aired += leafCount;
        continue;
      }
      const episodes = await this.#children(ratingKey);
      const airedInSeason = episodes.filter((raw) => {
        const airDate = episode.safeParse(raw).data?.originallyAvailableAt;
        return airDate !== undefined && airDate < today;
      }).length;
      console.debug(`${plexGuid} season ${index} is still airing: ${airedInSeason} of ${episodes.length} episodes aired before ${today}`);
      aired += airedInSeason;
    }
    return aired;
  }

  /** The account's Owned server, through its Connection in use. */
  server(chosen: ChosenServer): PlexServer {
    return new PlexServer(chosen, this.#token);
  }

  /** Every child of the metadata item with this key: a Show's seasons or a season's episodes. */
  #children(key: string): Promise<unknown[]> {
    return this.#metadata.getAll(`/library/metadata/${encodeURIComponent(key)}/children`, { pageSize: METADATA_PAGE_SIZE });
  }
}
