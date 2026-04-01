import { Database } from "bun:sqlite";

export interface SnapshotRow {
  scan_id: number;
  citizen_id: number;
  scanned_at: string;
  status: string;
  is_organization: number | null;
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
  is_president: number | null;
  is_congressman: number | null;
  is_dictator: number | null;
  is_party_president: number | null;
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

export function createScan(db: Database, scanType: string, startId: number, endId: number): number {
  const result = db
    .query("INSERT INTO scans (started_at, scan_type, start_id, end_id) VALUES (?, ?, ?, ?)")
    .run(new Date().toISOString(), scanType, startId, endId);
  return Number(result.lastInsertRowid);
}

export function finishScan(db: Database, scanId: number): void {
  db.query("UPDATE scans SET finished_at = ? WHERE id = ?").run(new Date().toISOString(), scanId);
}

export function incrementScanCounters(db: Database, scanId: number, counts: { scanned: number; found: number }): void {
  db.query("UPDATE scans SET total_scanned = total_scanned + ?, total_found = total_found + ? WHERE id = ?")
    .run(counts.scanned, counts.found, scanId);
}

export function insertSnapshot(db: Database, row: SnapshotRow): void {
  db.query(`
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
      $scan_id, $citizen_id, $scanned_at, $status, $is_organization,
      $name, $level, $xp, $created_at, $avatar_url, $ban_type, $ban_reason,
      $citizenship_country_id, $citizenship_country_name,
      $residence_country_id, $residence_country_name,
      $residence_region_id, $residence_region_name,
      $residence_city_id, $residence_city_name,
      $party_id, $party_name, $military_unit_id, $military_unit_name,
      $is_president, $is_congressman, $is_dictator, $is_party_president,
      $strength, $division,
      $ground_rank_name, $ground_rank_number, $ground_rank_points,
      $air_rank_name, $air_rank_number, $air_rank_points, $air_perception,
      $best_damage, $best_damage_battle_id,
      $friend_count, $newspaper_id, $newspaper_name,
      $pvp_matches_played, $pvp_matches_won, $pvp_matches_lost
    )
  `).run({
    $scan_id: row.scan_id, $citizen_id: row.citizen_id, $scanned_at: row.scanned_at,
    $status: row.status, $is_organization: row.is_organization,
    $name: row.name, $level: row.level, $xp: row.xp,
    $created_at: row.created_at, $avatar_url: row.avatar_url,
    $ban_type: row.ban_type, $ban_reason: row.ban_reason,
    $citizenship_country_id: row.citizenship_country_id, $citizenship_country_name: row.citizenship_country_name,
    $residence_country_id: row.residence_country_id, $residence_country_name: row.residence_country_name,
    $residence_region_id: row.residence_region_id, $residence_region_name: row.residence_region_name,
    $residence_city_id: row.residence_city_id, $residence_city_name: row.residence_city_name,
    $party_id: row.party_id, $party_name: row.party_name,
    $military_unit_id: row.military_unit_id, $military_unit_name: row.military_unit_name,
    $is_president: row.is_president, $is_congressman: row.is_congressman,
    $is_dictator: row.is_dictator, $is_party_president: row.is_party_president,
    $strength: row.strength, $division: row.division,
    $ground_rank_name: row.ground_rank_name, $ground_rank_number: row.ground_rank_number,
    $ground_rank_points: row.ground_rank_points,
    $air_rank_name: row.air_rank_name, $air_rank_number: row.air_rank_number,
    $air_rank_points: row.air_rank_points, $air_perception: row.air_perception,
    $best_damage: row.best_damage, $best_damage_battle_id: row.best_damage_battle_id,
    $friend_count: row.friend_count, $newspaper_id: row.newspaper_id, $newspaper_name: row.newspaper_name,
    $pvp_matches_played: row.pvp_matches_played, $pvp_matches_won: row.pvp_matches_won,
    $pvp_matches_lost: row.pvp_matches_lost,
  });
}

export function insertAchievements(db: Database, scanId: number, citizenId: number, achievements: AchievementEntry[]): void {
  const stmt = db.query("INSERT INTO achievements (scan_id, citizen_id, medal_type, count) VALUES (?, ?, ?, ?)");
  for (const a of achievements) {
    stmt.run(scanId, citizenId, a.medal_type, a.count);
  }
}

export function getCheckpoint(db: Database, scanId: number): number | null {
  const row = db.query("SELECT last_processed_id FROM checkpoint WHERE scan_id = ?").get(scanId) as { last_processed_id: number } | null;
  return row?.last_processed_id ?? null;
}

export function saveCheckpoint(db: Database, scanId: number, lastProcessedId: number): void {
  db.query(`
    INSERT INTO checkpoint (scan_id, last_processed_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(scan_id) DO UPDATE SET
      last_processed_id = excluded.last_processed_id,
      updated_at = excluded.updated_at
  `).run(scanId, lastProcessedId, new Date().toISOString());
}

export function getLatestScanId(db: Database): number | null {
  const row = db.query("SELECT id FROM scans ORDER BY id DESC LIMIT 1").get() as { id: number } | null;
  return row?.id ?? null;
}

export function getAliveCitizenIds(db: Database, scanId: number): number[] {
  const rows = db.query("SELECT citizen_id FROM snapshots WHERE scan_id = ? AND status = 'alive' ORDER BY citizen_id").all(scanId) as { citizen_id: number }[];
  return rows.map((r) => r.citizen_id);
}
