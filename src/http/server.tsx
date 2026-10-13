import { resolve } from "node:path";
import { serveStatic } from "@hono/bun";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { config } from "../config.ts";
import { liveReload } from "./liveReload.tsx";
import { router } from "./router.tsx";
import { requestLog } from "./middleware/requestLog.ts";
import { securityHeaders } from "./middleware/securityHeaders.ts";

const PUBLIC_DIR = resolve(import.meta.dir, "../../public");

export const app = new Hono();

app.use(requestLog);
app.use(securityHeaders);

app.route("/", router);
app.use(
  "/public/*",
  serveStatic({
    root: PUBLIC_DIR,
    rewriteRequestPath: (path) => path.slice("/public".length),
    onFound: (_, c) => {
      if (config.isDev) c.header("Cache-Control", "no-store");
    },
  }),
);
app.route("/", liveReload(PUBLIC_DIR));

app.notFound((c) => c.text("Not found", 404));
app.onError((error, c) => {
  if (error instanceof HTTPException) {
    const log = error.status >= 500 ? console.error : console.warn;
    log(`${error.status} ${c.req.method} ${c.req.path}: ${error.message}`, error.cause ?? "");
    return c.text(error.message || "Request failed", error.status);
  }
  console.error("Unhandled error while serving request:", error);
  return c.text("Internal server error", 500);
});
