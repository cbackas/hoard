import type { MiddlewareHandler } from "hono";
import { logHttp } from "../../logging.ts";

/** Paths too noisy to be worth logging. */
const UNLOGGED_PATHS = new Set(["/__livereload.js", "/__livereload"]);

/** Logs each request's method, path, status and duration. */
export const requestLog: MiddlewareHandler = async (c, next) => {
  const started = performance.now();
  await next();
  if (UNLOGGED_PATHS.has(c.req.path)) return;
  const ms = (performance.now() - started).toFixed(1);
  logHttp(`${c.req.method} ${c.req.path} → ${c.res.status} (${ms}ms)`);
};
