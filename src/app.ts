import "./logging.ts";
import { config } from "./config.ts";
import { app } from "./http/server.tsx";
import { pruneSessions } from "./sessions.ts";

// Abandoned sign-ins expire after 30 minutes, so pruning only at boot would let them pile up between restarts.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

console.info('Starting Hoard');
console.debug("Config:", { ...config, simklClientId: config.simklClientId ? "<set>" : undefined, sessionSecret: "<set>", encryptionKey: "<set>" });

await pruneSessions();
setInterval(() => pruneSessions().catch((error) => console.error("Pruning sessions failed:", error)), PRUNE_INTERVAL_MS);

const server = Bun.serve({ port: config.port, development: config.isDev, fetch: app.fetch });;
console.info(`Hoard started: ${server.url}`);
