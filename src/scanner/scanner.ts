import type { Database } from "bun:sqlite";
import type { Config } from "../config.ts";
import {
  createScan,
  finishScan,
  insertSnapshot,
  insertAchievements,
  saveCheckpoint,
  getCheckpoint,
  incrementScanCounters,
  getLatestScanId,
  getAliveCitizenIds,
  type SnapshotRow,
} from "../db/queries.ts";
import { parseCitizenResponse } from "./parser.ts";
import { fetchWithRetry, withJitter } from "./retry.ts";

interface ScanStats {
  alive: number;
  dead: number;
  banned: number;
  notFound: number;
  skipped: number;
  errors: number;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export async function runScan(
  db: Database,
  config: Config,
  scanType: "full" | "alive",
  rotateVpn: (oldIp: string) => Promise<string>,
  sendTelegram: (msg: string) => Promise<void>,
  currentIp: string,
): Promise<void> {
  let citizenIds: number[];
  let startId: number;
  let endId: number;

  if (scanType === "alive") {
    const latestScanId = getLatestScanId(db);
    if (!latestScanId) {
      console.error("No previous scan found. Run a full scan first.");
      return;
    }
    citizenIds = getAliveCitizenIds(db, latestScanId);
    if (citizenIds.length === 0) {
      console.log("No alive citizens found in latest scan.");
      return;
    }
    startId = citizenIds[0];
    endId = citizenIds[citizenIds.length - 1];
    console.log(`Alive scan: ${citizenIds.length} citizens to re-scan`);
  } else {
    startId = config.startId;
    endId = config.endId;
    citizenIds = [];
    for (let i = startId; i <= endId; i++) {
      citizenIds.push(i);
    }
  }

  const scanId = createScan(db, scanType, startId, endId);

  // Check for existing checkpoint to resume
  const checkpoint = getCheckpoint(db, scanId);
  let startIndex = 0;
  if (checkpoint) {
    startIndex = citizenIds.indexOf(checkpoint) + 1;
    if (startIndex <= 0) {
      startIndex = citizenIds.findIndex((id) => id > checkpoint);
      if (startIndex < 0) startIndex = citizenIds.length;
    }
    console.log(`Resuming from checkpoint: ID ${checkpoint} (index ${startIndex})`);
  }

  const startMsg = `🚀 Profiler scan started. Type: ${scanType}. Range: ${startId}–${endId}. Total: ${citizenIds.length - startIndex}. IP: ${currentIp}`;
  console.log(startMsg);
  await sendTelegram(startMsg);

  const stats: ScanStats = { alive: 0, dead: 0, banned: 0, notFound: 0, skipped: 0, errors: 0 };
  const scanStartTime = Date.now();
  let ip = currentIp;
  let shuttingDown = false;

  const shutdown = () => {
    shuttingDown = true;
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  let batchScanned = 0;
  let batchFound = 0;

  for (let i = startIndex; i < citizenIds.length; i++) {
    if (shuttingDown) {
      const msg = `🛑 Profiler stopped at ID ${citizenIds[i]}`;
      console.log(msg);
      await sendTelegram(msg);
      saveCheckpoint(db, scanId, citizenIds[i - 1] ?? startId);
      incrementScanCounters(db, scanId, { scanned: batchScanned, found: batchFound });
      process.removeListener("SIGTERM", shutdown);
      process.removeListener("SIGINT", shutdown);
      return;
    }

    const citizenId = citizenIds[i];
    const { fetchResult, newIp } = await fetchWithRetry(
      citizenId, ip, config, rotateVpn, sendTelegram,
    );
    if (newIp) ip = newIp;

    const now = new Date().toISOString();
    batchScanned++;

    if (fetchResult.type === "not_found") {
      insertSnapshot(db, {
        scan_id: scanId, citizen_id: citizenId, scanned_at: now,
        status: "not_found", is_organization: null,
        name: null, level: null, xp: null, created_at: null, avatar_url: null,
        ban_type: null, ban_reason: null,
        citizenship_country_id: null, citizenship_country_name: null,
        residence_country_id: null, residence_country_name: null,
        residence_region_id: null, residence_region_name: null,
        residence_city_id: null, residence_city_name: null,
        party_id: null, party_name: null,
        military_unit_id: null, military_unit_name: null,
        is_president: null, is_congressman: null, is_dictator: null, is_party_president: null,
        strength: null, division: null,
        ground_rank_name: null, ground_rank_number: null, ground_rank_points: null,
        air_rank_name: null, air_rank_number: null, air_rank_points: null, air_perception: null,
        best_damage: null, best_damage_battle_id: null,
        friend_count: null, newspaper_id: null, newspaper_name: null,
        pvp_matches_played: null, pvp_matches_won: null, pvp_matches_lost: null,
      });
      stats.notFound++;
    } else if (fetchResult.type === "success" && fetchResult.data) {
      const parsed = parseCitizenResponse(fetchResult.data);

      if (parsed.type === "skip") {
        stats.skipped++;
      } else {
        const snapshot: SnapshotRow = {
          scan_id: scanId,
          scanned_at: now,
          ...parsed.snapshot,
        };
        insertSnapshot(db, snapshot);

        if (parsed.achievements.length > 0) {
          insertAchievements(db, scanId, citizenId, parsed.achievements);
        }

        batchFound++;
        if (parsed.snapshot.status === "alive") stats.alive++;
        else if (parsed.snapshot.status === "dead") stats.dead++;
        else if (parsed.snapshot.status === "banned") stats.banned++;
      }
    } else {
      stats.errors++;
    }

    // Checkpoint
    if (batchScanned % config.checkpointInterval === 0) {
      saveCheckpoint(db, scanId, citizenId);
      incrementScanCounters(db, scanId, { scanned: batchScanned, found: batchFound });
      batchScanned = 0;
      batchFound = 0;
    }

    // Progress notification
    const totalProcessed = i - startIndex + 1;
    if (totalProcessed % config.progressEveryN === 0) {
      const elapsed = Date.now() - scanStartTime;
      const speed = Math.round(totalProcessed / (elapsed / 60_000));
      const pct = ((totalProcessed / (citizenIds.length - startIndex)) * 100).toFixed(1);
      const msg = `📊 Progress: ${citizenId}/${endId} (${pct}%) · Alive: ${stats.alive} · Dead: ${stats.dead} · 404: ${stats.notFound} · Speed: ${speed}/min`;
      console.log(msg);
      await sendTelegram(msg);
    }

    // Delay between requests
    const delay = withJitter(config.baseDelayMs, config.jitterPercent);
    if (delay > 0) await Bun.sleep(delay);
  }

  // Flush remaining counters
  if (batchScanned > 0) {
    incrementScanCounters(db, scanId, { scanned: batchScanned, found: batchFound });
  }

  finishScan(db, scanId);

  const elapsed = Date.now() - scanStartTime;
  const doneMsg = `✅ Scan complete. Type: ${scanType}. Alive: ${stats.alive}. Dead: ${stats.dead}. Banned: ${stats.banned}. 404: ${stats.notFound}. Errors: ${stats.errors}. Duration: ${formatDuration(elapsed)}`;
  console.log(doneMsg);
  await sendTelegram(doneMsg);

  process.removeListener("SIGTERM", shutdown);
  process.removeListener("SIGINT", shutdown);
}
