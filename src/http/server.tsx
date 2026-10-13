import { resolve } from "node:path";
import { serveStatic } from "@hono/bun";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { config } from "../config.ts";
import { Hello, Home } from "../views/Home.tsx";
import { liveReload } from "./liveReload.tsx";
import { requestLog } from "./middleware/requestLog.ts";
import { securityHeaders } from "./middleware/securityHeaders.ts";

const PUBLIC_DIR = resolve(import.meta.dir, "../../public");

const app = new Hono();

app.use(requestLog);
app.use(securityHeaders);

app.get("/", (c) => c.html(<Home />));
app.get("/hello", (c) => c.html(<Hello at={new Date()} />));
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

export function startServer(serverConfig: typeof config) {
  const server = Bun.serve({ port: serverConfig.port, development: serverConfig.isDev, fetch: app.fetch });

  console.info(`Hoard listening on ${server.url}`);
  console.debug("Config:", { ...serverConfig, simklClientId: serverConfig.simklClientId ? "<set>" : undefined });
  return server;
}
