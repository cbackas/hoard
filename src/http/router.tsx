import { Hono } from "hono";
import { z } from "zod";
import { TABS, TitleBatch, TrendingPage } from "../views/Trending.tsx";
import { validate } from "./validate.ts";

// The regex keeps unknown paths falling through to the 404 (and to live reload) instead of failing validation.
// The alternation must be grouped: Hono merges all routes into one regex, and a bare "a|b" leaks out of it.
const TAB_PATH = `/:tab{(?:${TABS.join("|")})}`;

export const router = new Hono();

router.get("/", (c) => c.redirect("/all"));

router.get(TAB_PATH, validate({ param: { tab: z.enum(TABS) }, query: { offset: z.coerce.number().int().min(0).default(0) } }), (c) => {
  const { param: { tab }, query: { offset } } = c.get("input");
  c.header("Vary", "HX-Request");
  if (c.req.header("HX-Request")) return c.html(<TitleBatch tab={tab} offset={offset} />);
  return c.html(<TrendingPage tab={tab} offset={offset} />);
});
