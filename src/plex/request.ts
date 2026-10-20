import { z } from "zod";
import { plexClientId } from "./clientId.ts";

// Requests to Plex's hosts: plex.tv, an Owned server, and Plex's online metadata. Every request identifies Hoard the
// same way, is given up on after REQUEST_TIMEOUT_MS, is logged, and has its JSON checked against a schema.

/** How Hoard names itself to Plex. */
export const PRODUCT = "Hoard";
// Without a limit, a hung request would leave whatever's waiting on it waiting forever. An Owned server's
// Connections are tried at once, so an unreachable one costs at most this, not this per Connection.
const REQUEST_TIMEOUT_MS = 10_000;

// One page of a list Plex pages through. totalSize is only sent because the request asks for a page.
const pageResponse = z.object({
  MediaContainer: z.object({ totalSize: z.number().int().nonnegative(), Metadata: z.array(z.unknown()).default([]) }),
});

/** A request to a Plex host that failed: status is the HTTP status it answered with, or undefined if it didn't answer. */
export class PlexRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * One of Plex's hosts, at baseUrl, with the token its requests are made with, if any. name is how it's referred to in
 * logs, e.g. "plex.tv" or the Owned server's name. The token is kept private, so logging a PlexHost doesn't show it.
 */
export class PlexHost {
  readonly name: string;
  readonly #baseUrl: string;
  readonly #token: string | undefined;

  constructor({ name, baseUrl, token }: { name: string; baseUrl: string; token?: string }) {
    this.name = name;
    this.#baseUrl = baseUrl;
    this.#token = token;
  }

  /** GETs path and parses the JSON with schema. Throws a PlexRequestError if the host didn't answer or answered with an error. */
  get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return this.#request("GET", path, schema);
  }

  /** POSTs to path and parses the JSON with schema. Throws like get. */
  post<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return this.#request("POST", path, schema);
  }

  /**
   * Every item of a list Plex pages through, e.g. a Library's items, asked for pageSize at a time. The items aren't
   * checked, so the caller can check each on its own and one described unexpectedly doesn't lose the rest.
   */
  async getAll(path: string, { pageSize }: { pageSize: number }): Promise<unknown[]> {
    const items: unknown[] = [];
    const separator = path.includes("?") ? "&" : "?";
    let totalSize = Infinity;
    for (let start = 0; start < totalSize; start += pageSize) {
      const params = new URLSearchParams({ "X-Plex-Container-Start": `${start}`, "X-Plex-Container-Size": `${pageSize}` });
      const page = (await this.get(`${path}${separator}${params}`, pageResponse)).MediaContainer;
      totalSize = page.totalSize;
      console.debug(`${this.name} ${path}: fetched ${start}–${start + page.Metadata.length} of ${totalSize}`);
      // An empty page means the list shrank while being read; stop rather than ask for pages that won't come.
      if (page.Metadata.length === 0) break;
      items.push(...page.Metadata);
    }
    return items;
  }

  async #request<T>(method: string, path: string, schema: z.ZodType<T>): Promise<T> {
    const started = performance.now();
    const elapsed = () => `${(performance.now() - started).toFixed(0)}ms`;
    let response: Response;
    try {
      response = await fetch(`${this.#baseUrl}${path}`, { method, headers: plexHeaders(this.#token), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      console.debug(`${this.name} ${method} ${path} didn't answer (${elapsed()}):`, error instanceof Error ? error.message : error);
      throw new PlexRequestError(`${this.name} ${method} ${path} didn't answer`, undefined, { cause: error });
    }
    console.debug(`${this.name} ${method} ${path} → ${response.status} (${elapsed()})`);
    if (!response.ok) {
      throw new PlexRequestError(`${this.name} ${method} ${path} failed: ${response.status} ${response.statusText}`, response.status);
    }
    return schema.parse(await response.json());
  }
}

/** Headers that identify Hoard to Plex; plex.tv lists each client identifier as a device on the account. */
function plexHeaders(token: string | undefined): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Plex-Product": PRODUCT,
    "X-Plex-Client-Identifier": plexClientId,
    ...(token && { "X-Plex-Token": token }),
  };
}
