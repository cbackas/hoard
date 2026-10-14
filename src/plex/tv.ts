import { z } from "zod";
import { plexClientId } from "./clientId.ts";

// plex.tv's account API: PINs for sign-in, the signed-in user, and their servers.
const PLEX_TV_URL = "https://plex.tv/api/v2";
const PLEX_AUTH_URL = "https://app.plex.tv/auth";
const PRODUCT = "Hoard";
// Without a limit, a hung plex.tv request would leave the sign-in request waiting on it forever.
const FETCH_TIMEOUT_MS = 10_000;

const pinResponse = z.object({
  id: z.number().int(),
  code: z.string().min(1),
  // null until the user approves the PIN on plex.tv.
  authToken: z.string().min(1).nullable(),
});

const userResponse = z.object({
  username: z.string().min(1),
  // e.g. "https://plex.tv/users/<uuid>/avatar?c=<n>". Only shown as an avatar, so a bad one is dropped rather than failing sign-in.
  thumb: z.url({ protocol: /^https$/ }).optional().catch(undefined),
});

// Every device on the account (players and other apps too), each with the Connections plex.tv knows for it.
// Each device is checked on its own, so one described unexpectedly doesn't lose the rest.
const resourcesResponse = z.array(z.unknown());
const resource = z.object({
  name: z.string(),
  clientIdentifier: z.string().min(1),
  // Comma-separated roles, e.g. "server" or "client,player,pubsub-player".
  provides: z.string(),
  // false for servers shared with the account by someone else.
  owned: z.boolean(),
  connections: z.array(z.object({ uri: z.url(), local: z.boolean(), relay: z.boolean() })),
});

export type Pin = z.output<typeof pinResponse>;
/** The signed-in Plex account: who it is and its avatar URL, if it has one. */
export type PlexAccount = z.output<typeof userResponse>;

export type ConnectionKind = "local" | "remote" | "relay";
/** One way of reaching an Owned server. */
export interface PlexConnection {
  uri: string;
  kind: ConnectionKind;
}
/** An Owned server: its machine identifier, name and Connections, in plex.tv's order. */
export interface OwnedServer {
  id: string;
  name: string;
  connections: PlexConnection[];
}

class PlexTvError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Headers that identify Hoard to Plex; plex.tv lists each client identifier as a device on the account. */
export function plexHeaders(token?: string): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Plex-Product": PRODUCT,
    "X-Plex-Client-Identifier": plexClientId,
    ...(token && { "X-Plex-Token": token }),
  };
}

async function plexTv<T>(method: string, path: string, schema: z.ZodType<T>, token?: string): Promise<T> {
  const started = performance.now();
  const response = await fetch(`${PLEX_TV_URL}${path}`, {
    method,
    headers: plexHeaders(token),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const ms = (performance.now() - started).toFixed(0);
  console.debug(`plex.tv ${method} ${path} → ${response.status} (${ms}ms)`);
  if (!response.ok) {
    throw new PlexTvError(`plex.tv ${method} ${path} failed: ${response.status} ${response.statusText}`, response.status);
  }
  return schema.parse(await response.json());
}

/** Starts a sign-in: a new PIN for the user to approve on plex.tv. */
export async function createPin(): Promise<Pin> {
  const pin = await plexTv("POST", "/pins?strong=true", pinResponse);
  console.debug("Created plex.tv PIN", pin.id);
  return pin;
}

/** The PIN's current state; its authToken is set once the user has approved it. Undefined once it has expired. */
export async function checkPin(id: number): Promise<Pin | undefined> {
  try {
    return await plexTv("GET", `/pins/${id}`, pinResponse);
  } catch (error) {
    // plex.tv answers 404 "Code not found or expired" for PINs past their lifetime.
    if (error instanceof PlexTvError && error.status === 404) return undefined;
    throw error;
  }
}

/** The account a token belongs to. */
export async function getUser(token: string): Promise<PlexAccount> {
  return plexTv("GET", "/user", userResponse, token);
}

/** The account's Owned servers. Servers shared with it, and devices that aren't servers, are left out. */
export async function getOwnedServers(token: string): Promise<OwnedServer[]> {
  const resources = await plexTv("GET", "/resources?includeHttps=1&includeRelay=1", resourcesResponse, token);
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

/** The plex.tv page where the user approves the PIN, which then sends the browser to forwardUrl. */
export function authUrl(pin: Pin, forwardUrl: string): string {
  // Plex reads these from the URL fragment, not the query string.
  const params = new URLSearchParams({
    clientID: plexClientId,
    code: pin.code,
    forwardUrl,
    "context[device][product]": PRODUCT,
  });
  return `${PLEX_AUTH_URL}#?${params}`;
}
