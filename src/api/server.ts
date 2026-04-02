import type { Sql } from "../db/database.ts";
import type { Config } from "../config.ts";
import { createRouteHandler } from "./routes.ts";
import { ProcessManager } from "./process-manager.ts";

export function startApiServer(sql: Sql, config: Config): void {
  const processManager = new ProcessManager(sql);
  const handler = createRouteHandler(sql, processManager);

  Bun.serve({
    port: config.apiPort,
    fetch: handler,
  });

  console.log(`🚀 Profiler API server running on http://localhost:${config.apiPort}`);
}
