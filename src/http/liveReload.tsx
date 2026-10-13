// Dev only: reloads the page when the server restarts (EventSource reconnects) or the
// stylesheet is rebuilt (a "reload" event). Does nothing in production.
import { watch } from "node:fs";
import { Hono } from "hono";
import { config } from "../config.ts";

const SCRIPT_PATH = "/__livereload.js";
const STREAM_PATH = "/__livereload";

const SCRIPT = `
let connected = false;
const source = new EventSource("${STREAM_PATH}");
source.onopen = () => { if (connected) location.reload(); connected = true; };
source.addEventListener("reload", () => location.reload());
`;

/** The script tag for the page head; renders nothing in production. */
export function LiveReloadScript() {
  return config.isDev ? <script src={SCRIPT_PATH} defer></script> : null;
}

/** Routes to mount on the app; none in production. */
export function liveReload(publicDir: string): Hono {
  const app = new Hono();
  if (!config.isDev) return app;
  app.get(SCRIPT_PATH, (c) => c.body(SCRIPT, 200, { "Content-Type": "text/javascript; charset=utf-8" }));
  app.get(STREAM_PATH, () => stream(publicDir));
  return app;
}

function stream(publicDir: string): Response {
  let cleanup = () => {};
  const body = new ReadableStream<string>({
    start(controller) {
      controller.enqueue("retry: 300\n\n");
      const keepAlive = setInterval(() => controller.enqueue(": ping\n\n"), 5_000);
      const watcher = watch(publicDir, (_, filename) => {
        if (filename !== "styles.css") return;
        console.debug("Stylesheet rebuilt, telling client to reload");
        controller.enqueue("event: reload\ndata:\n\n");
      });
      cleanup = () => {
        clearInterval(keepAlive);
        watcher.close();
      };
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
}
