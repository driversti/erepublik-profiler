import { loadConfig } from "./config.ts";
import { initDatabase } from "./db/database.ts";
import { createTelegram } from "./telegram/telegram.ts";
import { createVpn } from "./vpn/vpn.ts";
import { startWorker } from "./scanner/worker.ts";
import { startApiServer } from "./api/server.ts";

const command = process.argv[2];

if (!command || !["scan", "web"].includes(command)) {
  console.log("Usage: bun run src/index.ts <command>");
  console.log("Commands:");
  console.log("  scan  — Start the scanner worker (polls for pending scans)");
  console.log("  web   — Start the web server (API + dashboard)");
  process.exit(1);
}

const config = loadConfig();
const sql = await initDatabase(config.databaseUrl);
const telegram = createTelegram(config);
const vpn = createVpn(config, telegram.send);

if (command === "scan") {
  try {
    const ipInfo = await vpn.checkIpLeak();
    console.log(`Current IP: ${ipInfo.ip} (${ipInfo.country})`);
    await startWorker(sql, config, vpn.rotateVpn, telegram.send, ipInfo.ip);
  } catch (err) {
    const msg = `💀 Fatal error: ${(err as Error).message}`;
    console.error(msg);
    await telegram.send(msg);
    await sql.end();
    process.exit(1);
  }
} else if (command === "web") {
  startApiServer(sql, config);
}
