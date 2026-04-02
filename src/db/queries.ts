import type { Sql } from "./database.ts";

export interface SnapshotRow {
  scan_id: number;
  citizen_id: number;
  scanned_at: string;
  status: string;
  is_organization: boolean | null;
  name: string | null;
  level: number | null;
  xp: number | null;
  created_at: string | null;
  avatar_url: string | null;
  ban_type: string | null;
  ban_reason: string | null;
  citizenship_country_id: number | null;
  citizenship_country_name: string | null;
  residence_country_id: number | null;
  residence_country_name: string | null;
  residence_region_id: number | null;
  residence_region_name: string | null;
  residence_city_id: number | null;
  residence_city_name: string | null;
  party_id: number | null;
  party_name: string | null;
  military_unit_id: number | null;
  military_unit_name: string | null;
  is_president: boolean | null;
  is_congressman: boolean | null;
  is_dictator: boolean | null;
  is_party_president: boolean | null;
  strength: number | null;
  division: number | null;
  ground_rank_name: string | null;
  ground_rank_number: number | null;
  ground_rank_points: number | null;
  air_rank_name: string | null;
  air_rank_number: number | null;
  air_rank_points: number | null;
  air_perception: number | null;
  best_damage: number | null;
  best_damage_battle_id: number | null;
  friend_count: number | null;
  newspaper_id: number | null;
  newspaper_name: string | null;
  pvp_matches_played: number | null;
  pvp_matches_won: number | null;
  pvp_matches_lost: number | null;
}

export interface AchievementEntry {
  medal_type: string;
  count: number;
}

export async function createScan(sql: Sql, scanType: string, startId: number, endId: number): Promise<number> {
  const [row] = await sql`
    INSERT INTO scans (started_at, scan_type, start_id, end_id, status)
    VALUES (NOW(), ${scanType}, ${startId}, ${endId}, 'pending')
    RETURNING id
  `;
  return row.id;
}

export async function claimPendingScan(sql: Sql): Promise<{ id: number; scan_type: string; start_id: number; end_id: number } | null> {
  const [row] = await sql`
    UPDATE scans SET status = 'running', started_at = NOW()
    WHERE id = (SELECT id FROM scans WHERE status = 'pending' ORDER BY id LIMIT 1)
    RETURNING id, scan_type, start_id, end_id
  `;
  return row ?? null;
}

export async function getScanStatus(sql: Sql, scanId: number): Promise<string | null> {
  const [row] = await sql`SELECT status FROM scans WHERE id = ${scanId}`;
  return row?.status ?? null;
}

export async function updateScanStatus(sql: Sql, scanId: number, status: string): Promise<void> {
  if (status === "completed" || status === "cancelled" || status === "failed") {
    await sql`UPDATE scans SET status = ${status}, finished_at = NOW() WHERE id = ${scanId}`;
  } else {
    await sql`UPDATE scans SET status = ${status} WHERE id = ${scanId}`;
  }
}

export async function finishScan(sql: Sql, scanId: number): Promise<void> {
  await sql`UPDATE scans SET finished_at = NOW(), status = 'completed' WHERE id = ${scanId}`;
}

export async function incrementScanCounters(sql: Sql, scanId: number, counts: { scanned: number; found: number }): Promise<void> {
  await sql`
    UPDATE scans SET total_scanned = total_scanned + ${counts.scanned}, total_found = total_found + ${counts.found}
    WHERE id = ${scanId}
  `;
}

export async function insertSnapshot(sql: Sql, row: SnapshotRow): Promise<void> {
  await sql`
    INSERT INTO snapshots (
      scan_id, citizen_id, scanned_at, status, is_organization,
      name, level, xp, created_at, avatar_url, ban_type, ban_reason,
      citizenship_country_id, citizenship_country_name,
      residence_country_id, residence_country_name,
      residence_region_id, residence_region_name,
      residence_city_id, residence_city_name,
      party_id, party_name, military_unit_id, military_unit_name,
      is_president, is_congressman, is_dictator, is_party_president,
      strength, division,
      ground_rank_name, ground_rank_number, ground_rank_points,
      air_rank_name, air_rank_number, air_rank_points, air_perception,
      best_damage, best_damage_battle_id,
      friend_count, newspaper_id, newspaper_name,
      pvp_matches_played, pvp_matches_won, pvp_matches_lost
    ) VALUES (
      ${row.scan_id}, ${row.citizen_id}, ${row.scanned_at}, ${row.status}, ${row.is_organization},
      ${row.name}, ${row.level}, ${row.xp}, ${row.created_at}, ${row.avatar_url},
      ${row.ban_type}, ${row.ban_reason},
      ${row.citizenship_country_id}, ${row.citizenship_country_name},
      ${row.residence_country_id}, ${row.residence_country_name},
      ${row.residence_region_id}, ${row.residence_region_name},
      ${row.residence_city_id}, ${row.residence_city_name},
      ${row.party_id}, ${row.party_name}, ${row.military_unit_id}, ${row.military_unit_name},
      ${row.is_president}, ${row.is_congressman}, ${row.is_dictator}, ${row.is_party_president},
      ${row.strength}, ${row.division},
      ${row.ground_rank_name}, ${row.ground_rank_number}, ${row.ground_rank_points},
      ${row.air_rank_name}, ${row.air_rank_number}, ${row.air_rank_points}, ${row.air_perception},
      ${row.best_damage}, ${row.best_damage_battle_id},
      ${row.friend_count}, ${row.newspaper_id}, ${row.newspaper_name},
      ${row.pvp_matches_played}, ${row.pvp_matches_won}, ${row.pvp_matches_lost}
    )
  `;
}

export async function insertSnapshotBatch(sql: Sql, rows: SnapshotRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (const row of rows) {
    await insertSnapshot(sql, row);
  }
}

export async function insertAchievements(sql: Sql, scanId: number, citizenId: number, achievements: AchievementEntry[]): Promise<void> {
  for (const a of achievements) {
    await sql`INSERT INTO achievements (scan_id, citizen_id, medal_type, count) VALUES (${scanId}, ${citizenId}, ${a.medal_type}, ${a.count})`;
  }
}

export async function insertScanError(sql: Sql, scanId: number, citizenId: number, scannedAt: string, statusCode: number | null | undefined, errorMessage: string, retryable: boolean): Promise<void> {
  await sql`
    INSERT INTO scan_errors (scan_id, citizen_id, scanned_at, status_code, error_message, retryable)
    VALUES (${scanId}, ${citizenId}, ${scannedAt}, ${statusCode ?? null}, ${errorMessage}, ${retryable})
  `;
}

export async function insertOrganization(sql: Sql, scanId: number, citizenId: number, name: string | null, createdAt: string | null, scannedAt: string): Promise<void> {
  await sql`
    INSERT INTO organizations (scan_id, citizen_id, name, created_at, scanned_at)
    VALUES (${scanId}, ${citizenId}, ${name}, ${createdAt}, ${scannedAt})
  `;
}

export async function getCheckpoint(sql: Sql, scanId: number): Promise<number | null> {
  const [row] = await sql`SELECT last_processed_id FROM checkpoint WHERE scan_id = ${scanId}`;
  return row?.last_processed_id ?? null;
}

export async function saveCheckpoint(sql: Sql, scanId: number, lastProcessedId: number): Promise<void> {
  await sql`
    INSERT INTO checkpoint (scan_id, last_processed_id, updated_at)
    VALUES (${scanId}, ${lastProcessedId}, NOW())
    ON CONFLICT (scan_id) DO UPDATE SET
      last_processed_id = EXCLUDED.last_processed_id,
      updated_at = NOW()
  `;
}

export async function upsertScanProgress(
  sql: Sql,
  scanId: number,
  currentId: number,
  stats: { alive: number; dead: number; banned: number; notFound: number; errors: number; skipped: number },
  ratePerMin: number,
): Promise<void> {
  await sql`
    INSERT INTO scan_progress (scan_id, current_id, alive, dead, banned, not_found, errors, skipped, rate_per_min, updated_at)
    VALUES (${scanId}, ${currentId}, ${stats.alive}, ${stats.dead}, ${stats.banned}, ${stats.notFound}, ${stats.errors}, ${stats.skipped}, ${ratePerMin}, NOW())
    ON CONFLICT (scan_id) DO UPDATE SET
      current_id = EXCLUDED.current_id,
      alive = EXCLUDED.alive,
      dead = EXCLUDED.dead,
      banned = EXCLUDED.banned,
      not_found = EXCLUDED.not_found,
      errors = EXCLUDED.errors,
      skipped = EXCLUDED.skipped,
      rate_per_min = EXCLUDED.rate_per_min,
      updated_at = NOW()
  `;
}

export async function getUnfinishedScan(sql: Sql, scanType: string): Promise<{ id: number; start_id: number; end_id: number } | null> {
  const [row] = await sql`
    SELECT id, start_id, end_id FROM scans
    WHERE scan_type = ${scanType} AND status = 'running'
    ORDER BY id DESC LIMIT 1
  `;
  return row ?? null;
}

export async function getAliveCitizenIds(sql: Sql): Promise<number[]> {
  const rows = await sql`
    SELECT citizen_id FROM snapshots s
    WHERE status = 'alive'
      AND scan_id = (SELECT MAX(scan_id) FROM snapshots WHERE citizen_id = s.citizen_id)
    ORDER BY citizen_id
  `;
  return rows.map((r: any) => r.citizen_id);
}

export interface FailedCitizenRow {
  id: number;
  scan_id: number;
  citizen_id: number;
  failed_at: string;
  error_message: string;
  status_code: number | null;
  retry_count: number;
  retry_queued_at: string | null;
  retried_at: string | null;
}

export async function insertFailedCitizen(
  sql: Sql, scanId: number, citizenId: number, failedAt: string,
  errorMessage: string, statusCode: number | null | undefined, retryCount: number,
): Promise<void> {
  await sql`
    INSERT INTO failed_citizens (scan_id, citizen_id, failed_at, error_message, status_code, retry_count)
    VALUES (${scanId}, ${citizenId}, ${failedAt}, ${errorMessage}, ${statusCode ?? null}, ${retryCount})
  `;
}

export async function getFailedCitizens(sql: Sql, scanId: number | null, limit: number, offset: number): Promise<FailedCitizenRow[]> {
  if (scanId !== null) {
    return await sql`SELECT * FROM failed_citizens WHERE scan_id = ${scanId} ORDER BY citizen_id LIMIT ${limit} OFFSET ${offset}`;
  }
  return await sql`SELECT * FROM failed_citizens ORDER BY citizen_id LIMIT ${limit} OFFSET ${offset}`;
}

export async function countFailedCitizens(sql: Sql, scanId: number | null): Promise<number> {
  if (scanId !== null) {
    const [row] = await sql`SELECT COUNT(*) AS count FROM failed_citizens WHERE scan_id = ${scanId}`;
    return Number(row.count);
  }
  const [row] = await sql`SELECT COUNT(*) AS count FROM failed_citizens`;
  return Number(row.count);
}

export async function queueFailedCitizensForRetry(sql: Sql, ids: number[]): Promise<void> {
  await sql`
    UPDATE failed_citizens SET retry_queued_at = NOW()
    WHERE id = ANY(${ids}) AND retry_queued_at IS NULL AND retried_at IS NULL
  `;
}

export async function queueAllFailedCitizensForRetry(sql: Sql): Promise<void> {
  await sql`UPDATE failed_citizens SET retry_queued_at = NOW() WHERE retry_queued_at IS NULL AND retried_at IS NULL`;
}

export async function getQueuedRetryIds(sql: Sql): Promise<{ id: number; citizen_id: number }[]> {
  return await sql`
    SELECT id, citizen_id FROM failed_citizens
    WHERE retry_queued_at IS NOT NULL AND retried_at IS NULL
    ORDER BY citizen_id
  `;
}

export async function markCitizenRetried(sql: Sql, id: number): Promise<void> {
  await sql`
    UPDATE failed_citizens SET retried_at = NOW()
    WHERE id = ${id} AND retry_queued_at IS NOT NULL AND retried_at IS NULL
  `;
}
