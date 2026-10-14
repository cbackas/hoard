import { z } from "zod";
import { plexClientId } from "./clientId.ts";

// plex.tv's account API: PINs for sign-in, and the signed-in user.
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

export type Pin = z.output<typeof pinResponse>;
/** The signed-in Plex account: who it is and its avatar URL, if it has one. */
export type PlexAccount = z.output<typeof userResponse>;

class PlexTvError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Headers that identify Hoard to plex.tv; Plex lists each client identifier as a device on the account. */
function plexHeaders(token?: string): Record<string, string> {
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
