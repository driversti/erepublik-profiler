import type { Database } from "bun:sqlite";
import type { Config } from "../config.ts";
import { createRouteHandler } from "./routes.ts";

export function startApiServer(db: Database, config: Config): void {
  const handler = createRouteHandler(db);

  Bun.serve({
    port: config.apiPort,
    fetch: handler,
  });

  console.log(`🚀 Profiler API server running on http://localhost:${config.apiPort}`);
}
