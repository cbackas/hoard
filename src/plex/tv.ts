import { z } from "zod";
import { plexClientId } from "./clientId.ts";
import { PlexHost, PlexRequestError, PRODUCT } from "./request.ts";

// plex.tv's account API: PINs for sign-in, which need no token, and the shapes of what it says about an account,
// which PlexClient asks for with the account's token.
export const PLEX_TV_URL = "https://plex.tv/api/v2";
const PLEX_AUTH_URL = "https://app.plex.tv/auth";

/** plex.tv without a token, for signing in. */
const plexTv = new PlexHost({ name: "plex.tv", baseUrl: PLEX_TV_URL });

const pinResponse = z.object({
  id: z.number().int(),
  code: z.string().min(1),
  // null until the user approves the PIN on plex.tv.
  authToken: z.string().min(1).nullable(),
});

export const userResponse = z.object({
  username: z.string().min(1),
  // e.g. "https://plex.tv/users/<uuid>/avatar?c=<n>". Only shown as an avatar, so a bad one is dropped rather than failing sign-in.
  thumb: z.url({ protocol: /^https$/ }).optional().catch(undefined),
});

// Every device on the account (players and other apps too), each with the Connections plex.tv knows for it.
// Each device is checked on its own, so one described unexpectedly doesn't lose the rest.
export const resourcesResponse = z.array(z.unknown());
export const resource = z.object({
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

/** Starts a sign-in: a new PIN for the user to approve on plex.tv. */
export async function createPin(): Promise<Pin> {
  const pin = await plexTv.post("/pins?strong=true", pinResponse);
  console.debug("Created plex.tv PIN", pin.id);
  return pin;
}

/** The PIN's current state; its authToken is set once the user has approved it. Undefined once it has expired. */
export async function checkPin(id: number): Promise<Pin | undefined> {
  try {
    return await plexTv.get(`/pins/${id}`, pinResponse);
  } catch (error) {
    // plex.tv answers 404 "Code not found or expired" for PINs past their lifetime.
    if (error instanceof PlexRequestError && error.status === 404) return undefined;
    throw error;
  }
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
