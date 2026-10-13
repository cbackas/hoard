import "./logging.ts";
import { config } from "./config.ts";
import { app } from "./http/server.tsx";

console.info('Starting Hoard');
console.debug("Config:", { ...config, simklClientId: config.simklClientId ? "<set>" : undefined });

const server = Bun.serve({ port: config.port, development: config.isDev, fetch: app.fetch });;
console.info(`Hoard started: ${server.url}`);
