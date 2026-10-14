import { createMiddleware } from "hono/factory";
import { ensureConnected } from "../../ownedServers.ts";
import { SERVERS_PATH } from "../../paths.ts";
import type { ConnectedSession, SignedInSession } from "../../sessions.ts";
import { serversUrl } from "../../views/Servers.tsx";
import { navigate } from "../navigate.ts";

/**
 * Makes sure the session is connected to an Owned server (see ensureConnected); after it, c.get("session") is
 * connected. Otherwise it sends the browser to the picker, which says what went wrong. Goes after requireSignIn.
 */
export const requireOwnedServer = createMiddleware<{ Variables: { session: ConnectedSession } }>(async (c, next) => {
  const session: SignedInSession = c.get("session");
  const result = await ensureConnected(session);
  if (!("problem" in result)) return next();
  console.debug(`No Owned server to use (${result.problem}); sending ${c.req.path} to the picker`);
  // For plexTvUnreachable and notChosen, the picker asks plex.tv itself and shows what it finds.
  return navigate(c, result.problem === "unreachable" ? serversUrl(result.server.id) : SERVERS_PATH);
});
