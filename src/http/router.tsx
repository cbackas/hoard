import { Hono, type Context } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import { authUrl, checkPin, createPin, getUser } from "../plex/tv.ts";
import { isSignedIn, sessionAccount, setPendingPin } from "../sessions.ts";
import { SIGN_IN_ERRORS, SIGN_IN_PATH, SignInPage, signInUrl } from "../views/SignIn.tsx";
import { TABS, TitleBatch, TrendingPage } from "../views/Trending.tsx";
import { requireSignIn } from "./middleware/requireSignIn.ts";
import { endSession, session, signInSession, startSession, type SessionEnv } from "./middleware/session.ts";
import { validate } from "./validate.ts";

// The regex keeps unknown paths falling through to the 404 (and to live reload) instead of failing validation.
// The alternation must be grouped: Hono merges all routes into one regex, and a bare "a|b" leaks out of it.
const TAB_PATH = `/:tab{(?:${TABS.join("|")})}`;
const SIGN_IN_CALLBACK_PATH = `${SIGN_IN_PATH}/callback`;

export const router = new Hono();

router.get("/", (c) => c.redirect("/all"));

router.get(
  TAB_PATH,
  session,
  requireSignIn,
  validate({ param: { tab: z.enum(TABS) }, query: { offset: z.coerce.number().int().min(0).default(0) } }),
  (c) => {
    const { param: { tab }, query: { offset } } = c.get("input");
    c.header("Vary", "HX-Request");
    if (c.req.header("HX-Request")) return c.html(<TitleBatch tab={tab} offset={offset} />);
    return c.html(<TrendingPage tab={tab} offset={offset} account={sessionAccount(c.get("session"))} />);
  },
);

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
    await signInSession(c, current, pinId, pin.authToken, await getUser(pin.authToken));
  } catch (error) {
    console.warn("Couldn't finish Plex sign-in:", error);
    return c.redirect(signInUrl("failed"));
  }
  return c.redirect("/");
});

router.post("/sign-out", session, async (c) => {
  await endSession(c);
  console.info("Signed out");
  return c.redirect(SIGN_IN_PATH, 303);
});
