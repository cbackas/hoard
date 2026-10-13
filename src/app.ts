import "./logging.ts";
import { config } from "./config.ts";
import { app } from "./http/server.tsx";
// Imported for its side effect: the Plex client identifier is created at boot, before Plex sign-in (HOARD-4) needs it.
import "./plex/clientId.ts";
import { pruneSessions } from "./sessions.ts";

console.info('Starting Hoard');
console.debug("Config:", { ...config, simklClientId: config.simklClientId ? "<set>" : undefined });

await pruneSessions();

const server = Bun.serve({ port: config.port, development: config.isDev, fetch: app.fetch });;
console.info(`Hoard started: ${server.url}`);
