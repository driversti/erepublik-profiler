import { loadConfig } from "./config.ts";
import { initDatabase } from "./db/database.ts";
import { createTelegram } from "./telegram/telegram.ts";
import { createVpn } from "./vpn/vpn.ts";
import { runScan } from "./scanner/scanner.ts";
import { startApiServer } from "./api/server.ts";

const command = process.argv[2];

if (!command || !["scan", "web"].includes(command)) {
  console.log("Usage: bun run src/index.ts <command>");
  console.log("Commands:");
  console.log("  scan [full|alive]  — Run a scan (default: full)");
  console.log("  web                — Start the web server (API + dashboard)");
  process.exit(1);
}

const config = loadConfig();
const db = initDatabase(config.dbPath);
const telegram = createTelegram(config);
const vpn = createVpn(config, telegram.send);

if (command === "scan") {
  if (config.startId == null || config.endId == null) {
    console.error("START_ID and END_ID are required for scan mode");
    process.exit(1);
  }

  const arg = process.argv[3];
  const scanType = (["alive", "retry"].includes(arg) ? arg : "full") as "full" | "alive" | "retry";

  try {
    const ipInfo = await vpn.checkIpLeak();
    console.log(`Current IP: ${ipInfo.ip} (${ipInfo.country})`);
    const scanConfig = { ...config, startId: config.startId!, endId: config.endId! };
    await runScan(db, scanConfig, scanType, vpn.rotateVpn, telegram.send, ipInfo.ip);
  } catch (err) {
    const msg = `💀 Fatal error: ${(err as Error).message}`;
    console.error(msg);
    await telegram.send(msg);
    process.exit(1);
  } finally {
    db.close();
  }
} else if (command === "web") {
  startApiServer(db, config);
}
