import type { Database } from "bun:sqlite";
import type { Config } from "../config.ts";
import { createRouteHandler } from "./routes.ts";
import { ProcessManager } from "./process-manager.ts";

export function startApiServer(db: Database, config: Config): void {
  const processManager = new ProcessManager();
  const handler = createRouteHandler(db, processManager);

  Bun.serve({
    port: config.apiPort,
    fetch: handler,
  });

  console.log(`🚀 Profiler API server running on http://localhost:${config.apiPort}`);
}
