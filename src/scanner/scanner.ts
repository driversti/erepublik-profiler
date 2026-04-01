import type { Database } from "bun:sqlite";
import type { Config } from "../config.ts";

type ScanConfig = Config & { startId: number; endId: number };
import {
  createScan,
  finishScan,
  insertSnapshot,
  insertAchievements,
  insertOrganization,
  insertScanError,
  insertFailedCitizen,
  saveCheckpoint,
  getCheckpoint,
  incrementScanCounters,
  getUnfinishedScan,
  getAliveCitizenIds,
  getQueuedRetryIds,
  markCitizenRetried,
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

/**
 * Iterates citizen IDs for a scan. For full scans, yields sequential IDs
 * without allocating an array. For alive scans, uses the pre-fetched ID list.
 */
interface ScanRange {
  totalCount: number;
  startId: number;
  endId: number;
  getId(index: number): number;
}

function fullScanRange(startId: number, endId: number, resumeFromIndex: number): ScanRange {
  return {
    totalCount: endId - startId + 1,
    startId,
    endId,
    getId(index: number) { return startId + index; },
  };
}

function aliveScanRange(citizenIds: number[]): ScanRange {
  return {
    totalCount: citizenIds.length,
    startId: citizenIds[0],
    endId: citizenIds[citizenIds.length - 1],
    getId(index: number) { return citizenIds[index]; },
  };
}

function retryScanRange(citizenIds: number[]): ScanRange {
  return {
    totalCount: citizenIds.length,
    startId: citizenIds[0],
    endId: citizenIds[citizenIds.length - 1],
    getId(index: number) { return citizenIds[index]; },
  };
}

export async function runScan(
  db: Database,
  config: ScanConfig,
  scanType: "full" | "alive" | "retry",
  rotateVpn: (oldIp: string) => Promise<string>,
  sendTelegram: (msg: string) => Promise<void>,
  currentIp: string,
): Promise<void> {
  let range: ScanRange;
  let scanId: number;
  let startIndex = 0;
  let retryRowIdMap: Map<number, number> | null = null;

  if (scanType === "alive") {
    const citizenIds = getAliveCitizenIds(db);
    if (citizenIds.length === 0) {
      console.log("No alive citizens found.");
      return;
    }
    range = aliveScanRange(citizenIds);
    console.log(`Alive scan: ${citizenIds.length} citizens to re-scan`);

    // Resume unfinished alive scan or create new one
    const unfinished = getUnfinishedScan(db, "alive");
    if (unfinished) {
      scanId = unfinished.id;
      const cp = getCheckpoint(db, scanId);
      if (cp) {
        const idx = citizenIds.indexOf(cp);
        startIndex = idx >= 0 ? idx + 1 : citizenIds.findIndex((id) => id > cp);
        if (startIndex < 0) startIndex = citizenIds.length;
        console.log(`Resuming alive scan ${scanId} from checkpoint: ID ${cp}`);
      }
    } else {
      scanId = createScan(db, scanType, range.startId, range.endId);
    }
  } else if (scanType === "retry") {
    const queuedItems = getQueuedRetryIds(db);
    if (queuedItems.length === 0) {
      console.log("No retry-queued citizens. Nothing to do.");
      return;
    }
    const citizenIds = queuedItems.map((r) => r.citizen_id);
    retryRowIdMap = new Map(queuedItems.map((r) => [r.citizen_id, r.id]));
    range = retryScanRange(citizenIds);
    const unfinished = getUnfinishedScan(db, "retry");
    if (unfinished) {
      scanId = unfinished.id;
      const cp = getCheckpoint(db, scanId);
      if (cp) {
        const idx = citizenIds.indexOf(cp);
        startIndex = idx >= 0 ? idx + 1 : citizenIds.findIndex((id) => id > cp);
        if (startIndex < 0) startIndex = citizenIds.length;
        console.log(`Resuming retry scan ${scanId} from checkpoint: ID ${cp}`);
      }
    } else {
      scanId = createScan(db, "retry", range.startId, range.endId);
    }
  } else {
    range = fullScanRange(config.startId, config.endId, 0);

    // Resume unfinished full scan or create new one
    const unfinished = getUnfinishedScan(db, "full");
    if (unfinished) {
      scanId = unfinished.id;
      const cp = getCheckpoint(db, scanId);
      if (cp) {
        startIndex = cp - config.startId + 1;
        console.log(`Resuming full scan ${scanId} from checkpoint: ID ${cp}`);
      }
    } else {
      scanId = createScan(db, scanType, config.startId, config.endId);
    }
  }

  const remaining = range.totalCount - startIndex;
  const startMsg = `🚀 Profiler scan started. Type: ${scanType}. Range: ${range.startId}–${range.endId}. Remaining: ${remaining}. IP: ${currentIp}`;
  console.log(startMsg);
  await sendTelegram(startMsg);

  const stats: ScanStats = { alive: 0, dead: 0, banned: 0, notFound: 0, skipped: 0, errors: 0 };
  const scanStartTime = Date.now();
  let ip = currentIp;
  let shuttingDown = false;

  const shutdown = () => { shuttingDown = true; };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  let batchScanned = 0;
  let batchFound = 0;

  // Begin a transaction for the first batch
  db.run("BEGIN");

  for (let i = startIndex; i < range.totalCount; i++) {
    if (shuttingDown) {
      db.run("COMMIT");
      const citizenId = range.getId(i);
      const msg = `🛑 Profiler stopped at ID ${citizenId}`;
      console.log(msg);
      await sendTelegram(msg);
      if (i > startIndex) {
        saveCheckpoint(db, scanId, range.getId(i - 1));
      }
      incrementScanCounters(db, scanId, { scanned: batchScanned, found: batchFound });
      process.removeListener("SIGTERM", shutdown);
      process.removeListener("SIGINT", shutdown);
      return;
    }

    const citizenId = range.getId(i);
    const { fetchResult, newIp, totalAttempts } = await fetchWithRetry(
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
        if (parsed.citizenId) {
          insertOrganization(db, scanId, parsed.citizenId, parsed.name, parsed.createdAt, now);
        }
      } else {
        const snapshot: SnapshotRow = {
          scan_id: scanId,
          scanned_at: now,
          ...parsed.snapshot,
        };
        insertSnapshot(db, snapshot);

        if (scanType === "retry" && retryRowIdMap) {
          const rowId = retryRowIdMap.get(citizenId);
          if (rowId !== undefined) markCitizenRetried(db, rowId);
        }

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
      insertScanError(db, scanId, citizenId, now,
        fetchResult.error?.statusCode,
        fetchResult.error?.message ?? "Unknown error",
        fetchResult.error?.retryable ?? false,
      );
      insertFailedCitizen(
        db, scanId, citizenId, now,
        fetchResult.error?.message ?? "Unknown error",
        fetchResult.error?.statusCode,
        totalAttempts,
      );
    }

    // Checkpoint + commit transaction at batch intervals
    if (batchScanned % config.checkpointInterval === 0) {
      db.run("COMMIT");
      saveCheckpoint(db, scanId, citizenId);
      incrementScanCounters(db, scanId, { scanned: batchScanned, found: batchFound });
      batchScanned = 0;
      batchFound = 0;
      db.run("BEGIN");
    }

    // Progress notification
    const totalProcessed = i - startIndex + 1;
    if (totalProcessed % config.progressEveryN === 0) {
      const elapsed = Date.now() - scanStartTime;
      const speed = Math.round(totalProcessed / (elapsed / 60_000));
      const pct = ((totalProcessed / remaining) * 100).toFixed(1);
      const msg = `📊 Progress: ${citizenId}/${range.endId} (${pct}%) · Alive: ${stats.alive} · Dead: ${stats.dead} · 404: ${stats.notFound} · Speed: ${speed}/min`;
      console.log(msg);
      await sendTelegram(msg);
    }

    // Delay between requests
    const delay = withJitter(config.baseDelayMs, config.jitterPercent);
    if (delay > 0) await Bun.sleep(delay);
  }

  // Commit remaining batch
  db.run("COMMIT");

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
