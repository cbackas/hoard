import { Hono, type Context } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import { episodeCounter } from "../episodeCounts.ts";
import { libraryIndex, refreshLibraryIndex } from "../libraryIndex.ts";
import { chooseOwnedServer, refreshOwnedServers } from "../ownedServers.ts";
import {
  LIBRARY_PATH,
  LIBRARY_REFRESH_PATH,
  SERVER_MENU_PATH,
  SERVERS_PATH,
  SIGN_IN_CALLBACK_PATH,
  SIGN_IN_PATH,
  SIGN_OUT_PATH,
} from "../paths.ts";
import { PlexClient } from "../plex/client.ts";
import { authUrl, checkPin, createPin } from "../plex/tv.ts";
import { chosenServer, isSignedIn, sessionAccount, setPendingPin } from "../sessions.ts";
import { ServerMenuItems } from "../views/AccountMenu.tsx";
import { LibraryStatus } from "../views/LibraryStatus.tsx";
import { ServersPage, serversUrl } from "../views/Servers.tsx";
import { SIGN_IN_ERRORS, SignInPage, signInUrl } from "../views/SignIn.tsx";
import { DEFAULT_EPISODE_MODE, DEFAULT_FILTER, EPISODE_MODES, FILTERS, TABS, TitleBatch, TrendingPage } from "../views/Trending.tsx";
import { requireOwnedServer } from "./middleware/requireOwnedServer.ts";
import { requireSignIn } from "./middleware/requireSignIn.ts";
import { endSession, session, signInSession, startSession, type SessionEnv } from "./middleware/session.ts";
import { validate } from "./validate.ts";

// The regex keeps unknown paths falling through to the 404 (and to live reload) instead of failing validation.
// The alternation must be grouped: Hono merges all routes into one regex, and a bare "a|b" leaks out of it.
const TAB_PATH = `/:tab{(?:${TABS.join("|")})}`;

export const router = new Hono();

router.get("/", (c) => c.redirect("/all"));

router.get(
  TAB_PATH,
  session,
  requireSignIn,
  requireOwnedServer,
  validate({
    param: { tab: z.enum(TABS) },
    // An unknown setting falls back to the default rather than failing, like a missing one.
    query: {
      offset: z.coerce.number().int().min(0).default(0),
      filter: z.enum(FILTERS).catch(DEFAULT_FILTER),
      episodes: z.enum(EPISODE_MODES).catch(DEFAULT_EPISODE_MODE),
    },
  }),
  async (c) => {
    const { param: { tab }, query: { offset, ...settings } } = c.get("input");
    const current = c.get("session");
    const library = await libraryIndex(current);
    const countEpisodes = episodeCounter(current);
    c.header("Vary", "HX-Request");
    if (c.req.header("HX-Request")) {
      return c.html(<TitleBatch tab={tab} offset={offset} settings={settings} index={library.index} countEpisodes={countEpisodes} />);
    }
    return c.html(
      <TrendingPage
        tab={tab}
        offset={offset}
        settings={settings}
        countEpisodes={countEpisodes}
        account={sessionAccount(current)}
        server={chosenServer(current)}
        library={library}
      />,
    );
  },
);

router.get(LIBRARY_PATH, session, requireSignIn, requireOwnedServer, async (c) =>
  c.html(<LibraryStatus state={await libraryIndex(c.get("session"))} />),
);

router.post(LIBRARY_REFRESH_PATH, session, requireSignIn, requireOwnedServer, async (c) =>
  c.html(<LibraryStatus state={await refreshLibraryIndex(c.get("session"))} />),
);

router.get(SERVERS_PATH, session, requireSignIn, validate({ query: { unreachableId: z.string().optional() } }), async (c) => {
  const current = c.get("session");
  const servers = await refreshOwnedServers(current);
  const { unreachableId } = c.get("input").query;
  return c.html(
    <ServersPage
      account={sessionAccount(current)}
      servers={servers}
      current={chosenServer(current)}
      unreachableName={servers?.find((server) => server.id === unreachableId)?.name}
    />,
  );
});

router.get(SERVER_MENU_PATH, session, requireSignIn, async (c) => {
  const current = c.get("session");
  const servers = await refreshOwnedServers(current);
  return c.html(<ServerMenuItems servers={servers} current={chosenServer(current)} />);
});

router.post(SERVERS_PATH, session, requireSignIn, validate({ form: { server: z.string().min(1) } }), async (c) => {
  const { server: id } = c.get("input").form;
  switch (await chooseOwnedServer(c.get("session"), id)) {
    case "connected":
      return c.redirect("/", 303);
    case "unreachable":
      return c.redirect(serversUrl(id), 303);
    // The picker asks plex.tv again and shows what it finds.
    case "plexTvUnreachable":
    case "unknown":
      return c.redirect(SERVERS_PATH, 303);
  }
});

router.get(SIGN_IN_PATH, session, validate({ query: { error: z.enum(SIGN_IN_ERRORS).optional().catch(undefined) } }), (c) => {
  if (isSignedIn(c.get("session"))) return c.redirect("/");
  return c.html(<SignInPage error={c.get("input").query.error} />);
});

/** Where plex.tv sends the browser back to: APP_URL when set, otherwise the origin this browser used to reach us. */
function forwardUrl(c: Context): string {
  return `${config.appUrl ?? new URL(c.req.url).origin}${SIGN_IN_CALLBACK_PATH}`;
}

// A POST, not a link, so prefetchers and crawlers don't start sessions and PINs.
router.post(SIGN_IN_PATH, session, async (c) => {
  let pin;
  try {
    pin = await createPin();
  } catch (error) {
    console.warn("Couldn't start Plex sign-in:", error);
    return c.redirect(signInUrl("failed"), 303);
  }
  // The PIN is tied to this browser's session rather than put in the callback URL, so only this browser can claim it.
  await setPendingPin(await startSession(c), pin.id);
  return c.redirect(authUrl(pin, forwardUrl(c)), 303);
});

router.get(SIGN_IN_CALLBACK_PATH, session, async (c: Context<SessionEnv>) => {
  const current = c.get("session");
  const pinId = current?.plex_pin_id;
  if (!current || pinId == null) {
    console.debug("Sign-in callback without a pending PIN");
    return c.redirect(signInUrl("incomplete"));
  }
  try {
    const pin = await checkPin(pinId);
    if (!pin) {
      console.debug("Plex PIN", pinId, "has expired");
      return c.redirect(signInUrl("incomplete"));
    }
    if (!pin.authToken) {
      console.debug("Plex PIN", pinId, "wasn't approved");
      return c.redirect(signInUrl("incomplete"));
    }
    await signInSession(c, current, pinId, pin.authToken, await new PlexClient(pin.authToken).user());
  } catch (error) {
    console.warn("Couldn't finish Plex sign-in:", error);
    return c.redirect(signInUrl("failed"));
  }
  return c.redirect("/");
});

router.post(SIGN_OUT_PATH, session, async (c) => {
  await endSession(c);
  console.info("Signed out");
  return c.redirect(SIGN_IN_PATH, 303);
});
