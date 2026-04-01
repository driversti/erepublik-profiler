import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { unlinkSync, existsSync } from "fs";
import { initDatabase } from "../../src/db/database.ts";
import {
  createScan,
  finishScan,
  insertSnapshot,
  insertAchievements,
  getCheckpoint,
  saveCheckpoint,
  getLatestScanId,
  getAliveCitizenIds,
  incrementScanCounters,
  insertFailedCitizen,
  getFailedCitizens,
  countFailedCitizens,
  queueFailedCitizensForRetry,
  queueAllFailedCitizensForRetry,
  getQueuedRetryIds,
  markCitizenRetried,
} from "../../src/db/queries.ts";

const TEST_DB = "./data/test-queries.db";
let db: Database;

beforeEach(() => {
  db = initDatabase(TEST_DB);
});

afterEach(() => {
  db.close();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync(TEST_DB + "-wal")) unlinkSync(TEST_DB + "-wal");
  if (existsSync(TEST_DB + "-shm")) unlinkSync(TEST_DB + "-shm");
});

describe("scans", () => {
  test("createScan returns auto-incremented id", () => {
    const id = createScan(db, "full", 1, 10000000);
    expect(id).toBe(1);
    const id2 = createScan(db, "alive", 1, 30000);
    expect(id2).toBe(2);
  });

  test("finishScan updates finished_at and counters", () => {
    const id = createScan(db, "full", 1, 100);
    incrementScanCounters(db, id, { scanned: 5, found: 3 });
    finishScan(db, id);
    const scan = db.query("SELECT * FROM scans WHERE id = ?").get(id) as any;
    expect(scan.finished_at).not.toBeNull();
    expect(scan.total_scanned).toBe(5);
    expect(scan.total_found).toBe(3);
  });

  test("getLatestScanId returns most recent scan", () => {
    createScan(db, "full", 1, 100);
    createScan(db, "alive", 1, 100);
    expect(getLatestScanId(db)).toBe(2);
  });

  test("getLatestScanId returns null when no scans", () => {
    expect(getLatestScanId(db)).toBeNull();
  });
});

describe("snapshots", () => {
  test("insertSnapshot stores a full citizen snapshot", () => {
    const scanId = createScan(db, "full", 1, 100);
    insertSnapshot(db, {
      scan_id: scanId, citizen_id: 1234, scanned_at: new Date().toISOString(),
      status: "alive", is_organization: 0,
      name: "TestPlayer", level: 72, xp: 150000, created_at: "2009-01-15",
      avatar_url: "https://example.com/avatar.png", ban_type: null, ban_reason: null,
      citizenship_country_id: 35, citizenship_country_name: "Poland",
      residence_country_id: 35, residence_country_name: "Poland",
      residence_region_id: 100, residence_region_name: "Mazovia",
      residence_city_id: 50, residence_city_name: "Warsaw",
      party_id: 1000, party_name: "Test Party",
      military_unit_id: 500, military_unit_name: "Test MU",
      is_president: 0, is_congressman: 0, is_dictator: 0, is_party_president: 1,
      strength: 50000.5, division: 4,
      ground_rank_name: "God of War", ground_rank_number: 70, ground_rank_points: 1000000,
      air_rank_name: "Airman", air_rank_number: 10, air_rank_points: 50000, air_perception: 100,
      best_damage: 5000000, best_damage_battle_id: 99999,
      friend_count: 150, newspaper_id: 200, newspaper_name: "Test News",
      pvp_matches_played: 50, pvp_matches_won: 30, pvp_matches_lost: 20,
    });
    const row = db.query("SELECT * FROM snapshots WHERE citizen_id = 1234").get() as any;
    expect(row.name).toBe("TestPlayer");
    expect(row.level).toBe(72);
    expect(row.status).toBe("alive");
    expect(row.strength).toBe(50000.5);
  });

  test("insertSnapshot stores not_found with null fields", () => {
    const scanId = createScan(db, "full", 1, 100);
    insertSnapshot(db, {
      scan_id: scanId, citizen_id: 9999, scanned_at: new Date().toISOString(),
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
    const row = db.query("SELECT * FROM snapshots WHERE citizen_id = 9999").get() as any;
    expect(row.status).toBe("not_found");
    expect(row.name).toBeNull();
  });
});

describe("achievements", () => {
  test("insertAchievements stores multiple medals", () => {
    const scanId = createScan(db, "full", 1, 100);
    insertAchievements(db, scanId, 1234, [
      { medal_type: "battle_hero", count: 15 },
      { medal_type: "super_soldier", count: 300 },
    ]);
    const rows = db
      .query("SELECT * FROM achievements WHERE citizen_id = 1234 ORDER BY medal_type")
      .all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].medal_type).toBe("battle_hero");
    expect(rows[0].count).toBe(15);
    expect(rows[1].medal_type).toBe("super_soldier");
    expect(rows[1].count).toBe(300);
  });
});

describe("checkpoint", () => {
  test("saveCheckpoint and getCheckpoint round-trip", () => {
    const scanId = createScan(db, "full", 1, 100);
    saveCheckpoint(db, scanId, 5000);
    expect(getCheckpoint(db, scanId)).toBe(5000);
  });

  test("getCheckpoint returns null for missing scan", () => {
    expect(getCheckpoint(db, 999)).toBeNull();
  });

  test("saveCheckpoint updates existing checkpoint", () => {
    const scanId = createScan(db, "full", 1, 100);
    saveCheckpoint(db, scanId, 100);
    saveCheckpoint(db, scanId, 200);
    expect(getCheckpoint(db, scanId)).toBe(200);
  });
});

describe("getAliveCitizenIds", () => {
  test("returns citizen IDs with alive status from given scan", () => {
    const scanId = createScan(db, "full", 1, 100);
    const now = new Date().toISOString();
    const base = {
      scanned_at: now, is_organization: null,
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
    };
    insertSnapshot(db, { ...base, scan_id: scanId, citizen_id: 1, status: "alive" });
    insertSnapshot(db, { ...base, scan_id: scanId, citizen_id: 2, status: "dead" });
    insertSnapshot(db, { ...base, scan_id: scanId, citizen_id: 3, status: "alive" });
    insertSnapshot(db, { ...base, scan_id: scanId, citizen_id: 4, status: "not_found" });

    const aliveIds = getAliveCitizenIds(db, scanId);
    expect(aliveIds).toEqual([1, 3]);
  });
});

describe("failed_citizens", () => {
  test("insertFailedCitizen stores row", () => {
    const scanId = createScan(db, "full", 1, 100);
    const now = new Date().toISOString();
    insertFailedCitizen(db, scanId, 1001, now, "HTTP 503", 503, 10);
    const rows = getFailedCitizens(db, scanId, 10, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].citizen_id).toBe(1001);
    expect(rows[0].status_code).toBe(503);
    expect(rows[0].retry_count).toBe(10);
  });

  test("countFailedCitizens returns correct count", () => {
    const scanId = createScan(db, "full", 1, 100);
    const now = new Date().toISOString();
    insertFailedCitizen(db, scanId, 1001, now, "err", null, 5);
    insertFailedCitizen(db, scanId, 1002, now, "err", 503, 10);
    expect(countFailedCitizens(db, scanId)).toBe(2);
    expect(countFailedCitizens(db, null)).toBe(2);
  });

  test("queueAllFailedCitizensForRetry sets retry_queued_at", () => {
    const scanId = createScan(db, "full", 1, 100);
    const now = new Date().toISOString();
    insertFailedCitizen(db, scanId, 2001, now, "err", null, 5);
    insertFailedCitizen(db, scanId, 2002, now, "err", null, 5);
    queueAllFailedCitizensForRetry(db);
    const items = getQueuedRetryIds(db);
    expect(items.map((r) => r.citizen_id)).toEqual([2001, 2002]);
  });

  test("queueFailedCitizensForRetry queues only selected rows by id", () => {
    const scanId = createScan(db, "full", 1, 100);
    const now = new Date().toISOString();
    insertFailedCitizen(db, scanId, 3001, now, "err", null, 5);
    insertFailedCitizen(db, scanId, 3002, now, "err", null, 5);
    const rows = getFailedCitizens(db, scanId, 10, 0);
    queueFailedCitizensForRetry(db, [rows[0].id]);
    const items = getQueuedRetryIds(db);
    expect(items.map((r) => r.citizen_id)).toEqual([3001]);
  });

  test("markCitizenRetried sets retried_at and removes from queue", () => {
    const scanId = createScan(db, "full", 1, 100);
    const now = new Date().toISOString();
    insertFailedCitizen(db, scanId, 4001, now, "err", null, 5);
    queueAllFailedCitizensForRetry(db);
    const items = getQueuedRetryIds(db);
    markCitizenRetried(db, items[0].id);
    expect(getQueuedRetryIds(db)).toHaveLength(0);
  });
});
