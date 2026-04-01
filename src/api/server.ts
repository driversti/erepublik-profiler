import type { Database } from "bun:sqlite";
import type { Config } from "../config.ts";

export function startApiServer(db: Database, config: Config): void {
  console.log(`API server placeholder — will be implemented next`);
  console.log(`Would listen on port ${config.apiPort}`);
}
