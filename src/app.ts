import "./logging.ts";
import { config } from "./config.ts";
import { startServer } from "./http/server.tsx";

startServer(config);

console.info("Application started");
