import { resolve } from "node:path";
import { serveStatic } from "@hono/bun";
import { Hono } from "hono";
import type { config as appConfig } from "../config.ts";
import { Hello, Home } from "../views/Home.tsx";
import { liveReload } from "./liveReload.tsx";
import { requestLog } from "./middleware/requestLog.ts";
import { securityHeaders } from "./middleware/securityHeaders.ts";

const PUBLIC_DIR = resolve(import.meta.dir, "../../public");

function createApp(config: typeof appConfig): Hono {
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
    console.error("Unhandled error while serving request:", error);
    return c.text("Internal server error", 500);
  });

  return app;
}

export function startServer(config: typeof appConfig) {
  const app = createApp(config);
  const server = Bun.serve({ port: config.port, development: config.isDev, fetch: app.fetch });

  console.info(`Hoard listening on ${server.url}`);
  console.debug("Config:", { ...config, simklClientId: config.simklClientId ? "<set>" : undefined });
  return server;
}
