import type { Sql } from "../db/database.ts";
import type { Config } from "../config.ts";
import {
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
  getScanStatus,
  updateScanStatus,
  upsertScanProgress,
  type SnapshotRow,
} from "../db/queries.ts";
import { parseCitizenResponse } from "./parser.ts";
import { fetchCitizen } from "./fetcher.ts";

function withJitter(ms: number, jitterPercent: number): number {
  if (ms === 0) return 0;
  const jitter = ms * jitterPercent;
  return Math.round(ms + (Math.random() * 2 - 1) * jitter);
}

const COOLDOWN_DELAY_MS = 200;
const COOLDOWN_REQUESTS = 30;
const MIN_SUCCESSES_BEFORE_FAST = 100;

class Throttle {
  private baseDelayMs: number;
  private jitterPercent: number;
  private requestsSinceRotation = Infinity;
  private successesSinceRotation = 0;
  private consecutiveQuickBlocks = 0;

  constructor(baseDelayMs: number, jitterPercent: number) {
    this.baseDelayMs = baseDelayMs;
    this.jitterPercent = jitterPercent;
  }

  onSuccess(): void {
    this.requestsSinceRotation++;
    this.successesSinceRotation++;
  }

  onRotation(): void {
    if (this.successesSinceRotation < MIN_SUCCESSES_BEFORE_FAST) {
      this.consecutiveQuickBlocks++;
    } else {
      this.consecutiveQuickBlocks = 0;
    }
    this.requestsSinceRotation = 0;
    this.successesSinceRotation = 0;
  }

  getDelay(): number {
    const cooldownWindow = COOLDOWN_REQUESTS * (1 + this.consecutiveQuickBlocks);
    if (this.requestsSinceRotation < cooldownWindow) {
      const cooldown = COOLDOWN_DELAY_MS * (1 + this.consecutiveQuickBlocks);
      return withJitter(cooldown, this.jitterPercent);
    }
    return withJitter(this.baseDelayMs, this.jitterPercent);
  }
}

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

interface ScanRange {
  totalCount: number;
  startId: number;
  endId: number;
  getId(index: number): number;
}

function fullScanRange(startId: number, endId: number): ScanRange {
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
  sql: Sql,
  config: Config,
  scanId: number,
  scanType: "full" | "alive" | "retry",
  startId: number,
  endId: number,
  rotateVpn: (oldIp: string) => Promise<string>,
  sendTelegram: (msg: string) => Promise<void>,
  currentIp: string,
): Promise<void> {
  let range: ScanRange;
  let startIndex = 0;
  let retryRowIdMap: Map<number, number> | null = null;

  if (scanType === "alive") {
    const citizenIds = await getAliveCitizenIds(sql);
    if (citizenIds.length === 0) {
      console.log("No alive citizens found.");
      await updateScanStatus(sql, scanId, "completed");
      return;
    }
    range = aliveScanRange(citizenIds);
    console.log(`Alive scan: ${citizenIds.length} citizens to re-scan`);

    const cp = await getCheckpoint(sql, scanId);
    if (cp) {
      const idx = citizenIds.indexOf(cp);
      startIndex = idx >= 0 ? idx + 1 : citizenIds.findIndex((id) => id > cp);
      if (startIndex < 0) startIndex = citizenIds.length;
      console.log(`Resuming alive scan ${scanId} from checkpoint: ID ${cp}`);
    }
  } else if (scanType === "retry") {
    const queuedItems = await getQueuedRetryIds(sql);
    if (queuedItems.length === 0) {
      console.log("No retry-queued citizens. Nothing to do.");
      await updateScanStatus(sql, scanId, "completed");
      return;
    }
    const citizenIds = queuedItems.map((r) => r.citizen_id);
    retryRowIdMap = new Map(queuedItems.map((r) => [r.citizen_id, r.id]));
    range = retryScanRange(citizenIds);

    const cp = await getCheckpoint(sql, scanId);
    if (cp) {
      const idx = citizenIds.indexOf(cp);
      startIndex = idx >= 0 ? idx + 1 : citizenIds.findIndex((id) => id > cp);
      if (startIndex < 0) startIndex = citizenIds.length;
      console.log(`Resuming retry scan ${scanId} from checkpoint: ID ${cp}`);
    }
  } else {
    range = fullScanRange(startId, endId);

    const cp = await getCheckpoint(sql, scanId);
    if (cp) {
      startIndex = cp - startId + 1;
      console.log(`Resuming full scan ${scanId} from checkpoint: ID ${cp}`);
    }
  }

  const remaining = range.totalCount - startIndex;
  const startMsg = `🚀 Profiler scan started. Type: ${scanType}. Range: ${range.startId}–${range.endId}. Remaining: ${remaining}. IP: ${currentIp}`;
  console.log(startMsg);
  await sendTelegram(startMsg);

  const stats: ScanStats = { alive: 0, dead: 0, banned: 0, notFound: 0, skipped: 0, errors: 0 };
  const throttle = new Throttle(config.baseDelayMs, config.jitterPercent);
  const scanStartTime = Date.now();
  let ip = currentIp;

  let batchScanned = 0;
  let batchFound = 0;

  for (let i = startIndex; i < range.totalCount; i++) {
    // Check for cancellation at checkpoint intervals
    if (batchScanned > 0 && batchScanned % config.checkpointInterval === 0) {
      const currentStatus = await getScanStatus(sql, scanId);
      if (currentStatus === "cancelling") {
        const citizenId = range.getId(i);
        const msg = `🛑 Profiler stopped at ID ${citizenId} (cancelled via UI)`;
        console.log(msg);
        await sendTelegram(msg);
        await saveCheckpoint(sql, scanId, range.getId(i - 1));
        await incrementScanCounters(sql, scanId, { scanned: batchScanned, found: batchFound });
        await updateScanStatus(sql, scanId, "cancelled");
        return;
      }

      await saveCheckpoint(sql, scanId, range.getId(i - 1));
      await incrementScanCounters(sql, scanId, { scanned: batchScanned, found: batchFound });
      batchScanned = 0;
      batchFound = 0;
    }

    const citizenId = range.getId(i);
    const fetchResult = await fetchCitizen(citizenId);

    // Rotate VPN on block
    if (fetchResult.type === "error" && fetchResult.error?.retryable) {
      const code = fetchResult.error.statusCode;
      if (code === 403 || code === 429 || !code) {
        throttle.onRotation();
        ip = await rotateVpn(ip);
      }
    } else {
      throttle.onSuccess();
    }

    const now = new Date().toISOString();
    batchScanned++;

    if (fetchResult.type === "not_found") {
      await insertSnapshot(sql, {
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
          await insertOrganization(sql, scanId, parsed.citizenId, parsed.name, parsed.createdAt, now);
        }
      } else {
        const snapshot: SnapshotRow = {
          scan_id: scanId,
          scanned_at: now,
          ...parsed.snapshot,
        };
        await insertSnapshot(sql, snapshot);

        if (scanType === "retry" && retryRowIdMap) {
          const rowId = retryRowIdMap.get(citizenId);
          if (rowId !== undefined) await markCitizenRetried(sql, rowId);
        }

        if (parsed.achievements.length > 0) {
          await insertAchievements(sql, scanId, citizenId, parsed.achievements);
        }

        batchFound++;
        if (parsed.snapshot.status === "alive") stats.alive++;
        else if (parsed.snapshot.status === "dead") stats.dead++;
        else if (parsed.snapshot.status === "banned") stats.banned++;
      }
    } else {
      stats.errors++;
      await insertScanError(sql, scanId, citizenId, now,
        fetchResult.error?.statusCode,
        fetchResult.error?.message ?? "Unknown error",
        fetchResult.error?.retryable ?? false,
      );
      await insertFailedCitizen(sql, scanId, citizenId, now,
        fetchResult.error?.message ?? "Unknown error",
        fetchResult.error?.statusCode,
        1,
      );
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

      await upsertScanProgress(sql, scanId, citizenId, stats, speed);
    }

    // Adaptive delay
    const delay = throttle.getDelay();
    if (delay > 0) await Bun.sleep(delay);
  }

  // Final flush
  if (batchScanned > 0) {
    await incrementScanCounters(sql, scanId, { scanned: batchScanned, found: batchFound });
  }

  await finishScan(sql, scanId);

  const elapsed = Date.now() - scanStartTime;
  const doneMsg = `✅ Scan complete. Type: ${scanType}. Alive: ${stats.alive}. Dead: ${stats.dead}. Banned: ${stats.banned}. 404: ${stats.notFound}. Errors: ${stats.errors}. Duration: ${formatDuration(elapsed)}`;
  console.log(doneMsg);
  await sendTelegram(doneMsg);
}
