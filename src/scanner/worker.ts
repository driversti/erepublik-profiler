import type { Sql } from "../db/database.ts";
import type { Config } from "../config.ts";
import { claimPendingScan, reclaimStaleScan, updateScanStatus } from "../db/queries.ts";
import { runScan } from "./scanner.ts";

const POLL_INTERVAL_MS = 5_000;

export async function startWorker(
  sql: Sql,
  config: Config,
  rotateVpn: (oldIp: string) => Promise<string>,
  sendTelegram: (msg: string) => Promise<void>,
  currentIp: string,
): Promise<void> {
  let ip = currentIp;

  console.log("🔄 Scanner worker started. Polling for pending scans...");

  while (true) {
    try {
      let scan = await claimPendingScan(sql);

      if (scan) {
        console.log(`📋 Claimed scan #${scan.id}: ${scan.scan_type} [${scan.start_id}–${scan.end_id}]`);
      } else {
        scan = await reclaimStaleScan(sql);
        if (scan) {
          console.log(`♻️ Reclaimed stale scan #${scan.id}: ${scan.scan_type} [${scan.start_id}–${scan.end_id}] (resuming after crash)`);
        }
      }

      if (scan) {
        try {
          await runScan(
            sql, config, scan.id,
            scan.scan_type as "full" | "alive" | "retry",
            scan.start_id, scan.end_id,
            rotateVpn, sendTelegram, ip,
          );
        } catch (err) {
          const msg = `💀 Scan #${scan.id} failed: ${(err as Error).message}`;
          console.error(msg);
          await sendTelegram(msg);
          await updateScanStatus(sql, scan.id, "failed");
        }
      }
    } catch (err) {
      console.error("Worker poll error:", (err as Error).message);
    }

    await Bun.sleep(POLL_INTERVAL_MS);
  }
}
