import { findConnection, type PlexServer, plexServer, stillAnswers } from "./plex/server.ts";
import { getOwnedServers, type OwnedServer } from "./plex/tv.ts";
import {
  chosenServer,
  clearOwnedServer,
  type ConnectedSession,
  isConnected,
  renameOwnedServer,
  type Session,
  setOwnedServer,
  type SignedInSession,
} from "./sessions.ts";

// Which Owned server each session reads libraries from, and keeping it connected.

/** Why a session couldn't be connected to an Owned server, so the picker should be shown. */
export type ServerProblem =
  | { problem: "plexTvUnreachable" }
  /** Several Owned servers and none chosen yet, or none at all. */
  | { problem: "notChosen" }
  /** None of the server's Connections answered. */
  | { problem: "unreachable"; server: OwnedServer };

/**
 * The account's Owned servers, or undefined if plex.tv couldn't be asked, for callers that say so rather than fail.
 * Read-only; see refreshOwnedServers.
 */
export async function listOwnedServers(session: SignedInSession): Promise<OwnedServer[] | undefined> {
  try {
    return await getOwnedServers(session.plex_token);
  } catch (error) {
    console.warn("Couldn't list Owned servers:", error);
    return undefined;
  }
}

/** listOwnedServers, also saving a new name for the session's Owned server if it was renamed in Plex. */
export async function refreshOwnedServers(session: SignedInSession): Promise<OwnedServer[] | undefined> {
  const servers = await listOwnedServers(session);
  if (servers) await syncName(session, servers);
  return servers;
}

async function syncName(session: Session, servers: OwnedServer[]): Promise<void> {
  const current = servers.find((server) => server.id === session.plex_server_id);
  if (current && current.name !== session.plex_server_name) await renameOwnedServer(session, current.name);
}

/** Connects the session through the server's best Connection that answers. False if none do. */
async function connect(session: SignedInSession, server: OwnedServer): Promise<boolean> {
  const connection = await findConnection(server);
  if (!connection) {
    console.warn(`None of the ${server.connections.length} Connections to Owned server ${server.name} answered`);
    return false;
  }
  await setOwnedServer(session, server, connection);
  return true;
}

/**
 * Makes sure the session is connected to an Owned server whose Connection answers. Without one chosen, it picks the
 * account's only Owned server. Once the Connection in use stops answering, it looks for another to the same server;
 * if the server is no longer an Owned server, it forgets it and picks again. Usually returns without waiting on
 * anything (see stillAnswers); otherwise it asks plex.tv and tries Connections, which takes up to 10s.
 */
export async function ensureConnected(session: SignedInSession): Promise<ConnectedSession | ServerProblem> {
  const current = chosenServer(session);
  if (current) {
    if (isConnected(session) && stillAnswers(current)) return session;
    console.info(`Looking for another Connection to Owned server ${current.name}`);
  }

  const servers = await listOwnedServers(session);
  if (!servers) return { problem: "plexTvUnreachable" };
  await syncName(session, servers);

  let server = servers.find((owned) => owned.id === current?.id);
  if (current && !server) {
    console.info(`${current.name} is no longer one of the account's Owned servers`);
    await clearOwnedServer(session);
  }
  if (!server) {
    const [only, ...others] = servers;
    if (!only || others.length > 0) {
      console.debug(`Account has ${servers.length} Owned servers; one has to be chosen`);
      return { problem: "notChosen" };
    }
    console.debug(`Picking the account's only Owned server, ${only.name}`);
    server = only;
  }

  if (!(await connect(session, server))) return { problem: "unreachable", server };
  // connect set the server columns on session.
  return session as ConnectedSession;
}

/** Switches the session to the Owned server with this machine identifier, if it is one and a Connection to it answers. */
export async function chooseOwnedServer(
  session: SignedInSession,
  id: string,
): Promise<"connected" | "plexTvUnreachable" | "unknown" | "unreachable"> {
  const servers = await listOwnedServers(session);
  if (!servers) return "plexTvUnreachable";
  const server = servers.find((owned) => owned.id === id);
  if (!server) {
    console.debug("Chosen server", id, "isn't one of the account's Owned servers");
    return "unknown";
  }
  return (await connect(session, server)) ? "connected" : "unreachable";
}

/** Requests to the session's Owned server, through its Connection in use. */
export function connectedServer(session: ConnectedSession): PlexServer {
  return plexServer(chosenServer(session), session.plex_token);
}
