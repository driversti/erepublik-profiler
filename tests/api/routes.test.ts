import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { unlinkSync, existsSync } from "fs";
import { initDatabase } from "../../src/db/database.ts";
import { createScan, finishScan, insertSnapshot, insertAchievements, incrementScanCounters } from "../../src/db/queries.ts";
import { createRouteHandler } from "../../src/api/routes.ts";

const TEST_DB = "./data/test-api.db";
let db: Database;
let handler: (req: Request) => Response | Promise<Response>;

function seedTestData() {
  const scanId = createScan(db, "full", 1, 100);
  incrementScanCounters(db, scanId, { scanned: 4, found: 3 });
  finishScan(db, scanId);

  const now = new Date().toISOString();
  const base = {
    scan_id: scanId, scanned_at: now, is_organization: 0,
    avatar_url: null, ban_type: null, ban_reason: null,
    residence_region_id: null, residence_region_name: null,
    residence_city_id: null, residence_city_name: null,
    party_id: null, party_name: null, military_unit_id: null, military_unit_name: null,
    is_president: 0, is_congressman: 0, is_dictator: 0, is_party_president: 0,
    strength: 1000, division: 4,
    ground_rank_name: "Recruit", ground_rank_number: 1, ground_rank_points: 100,
    air_rank_name: "Airman", air_rank_number: 1, air_rank_points: 0, air_perception: 0,
    best_damage: null, best_damage_battle_id: null,
    friend_count: 5, newspaper_id: null, newspaper_name: null,
    pvp_matches_played: null, pvp_matches_won: null, pvp_matches_lost: null,
  };

  insertSnapshot(db, { ...base, citizen_id: 1, status: "alive", name: "Player1", level: 50, xp: 10000, created_at: "2010-01-01", citizenship_country_id: 35, citizenship_country_name: "Poland", residence_country_id: 35, residence_country_name: "Poland" });
  insertSnapshot(db, { ...base, citizen_id: 2, status: "alive", name: "Player2", level: 30, xp: 5000, created_at: "2012-06-15", citizenship_country_id: 35, citizenship_country_name: "Poland", residence_country_id: 35, residence_country_name: "Poland" });
  insertSnapshot(db, { ...base, citizen_id: 3, status: "dead", name: "DeadGuy", level: 10, xp: 500, created_at: "2008-01-01", citizenship_country_id: 1, citizenship_country_name: "Romania", residence_country_id: 1, residence_country_name: "Romania" });
  insertSnapshot(db, { ...base, citizen_id: 4, status: "not_found", name: null, level: null, xp: null, created_at: null, citizenship_country_id: null, citizenship_country_name: null, residence_country_id: null, residence_country_name: null, is_organization: null });

  insertAchievements(db, scanId, 1, [
    { medal_type: "Battle Hero", count: 10 },
    { medal_type: "Super Soldier", count: 50 },
  ]);
}

beforeAll(() => {
  db = initDatabase(TEST_DB);
  seedTestData();
  handler = createRouteHandler(db);
});

afterAll(() => {
  db.close();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync(TEST_DB + "-wal")) unlinkSync(TEST_DB + "-wal");
  if (existsSync(TEST_DB + "-shm")) unlinkSync(TEST_DB + "-shm");
});

async function get(path: string): Promise<any> {
  const res = await handler(new Request(`http://localhost${path}`));
  return res.json();
}

describe("GET /api/stats", () => {
  test("returns global statistics", async () => {
    const data = await get("/api/stats");
    expect(data.total_alive).toBe(2);
    expect(data.total_dead).toBe(1);
    expect(data.total_not_found).toBe(1);
  });
});

describe("GET /api/citizens/:id", () => {
  test("returns latest snapshot for a citizen", async () => {
    const data = await get("/api/citizens/1");
    expect(data.name).toBe("Player1");
    expect(data.level).toBe(50);
    expect(data.citizenship_country_name).toBe("Poland");
  });

  test("returns 404 for unknown citizen", async () => {
    const res = await handler(new Request("http://localhost/api/citizens/99999"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/citizens/:id/achievements", () => {
  test("returns achievement counts", async () => {
    const data = await get("/api/citizens/1/achievements");
    expect(data).toHaveLength(2);
    expect(data[0].medal_type).toBe("Battle Hero");
  });
});

describe("GET /api/citizens/search", () => {
  test("searches by name prefix", async () => {
    const data = await get("/api/citizens/search?name=Player");
    expect(data.results).toHaveLength(2);
  });
});

describe("GET /api/countries", () => {
  test("returns countries with alive counts", async () => {
    const data = await get("/api/countries");
    expect(data).toBeInstanceOf(Array);
    const poland = data.find((c: any) => c.citizenship_country_name === "Poland");
    expect(poland.alive_count).toBe(2);
  });
});

describe("GET /api/countries/:id", () => {
  test("returns country stats", async () => {
    const data = await get("/api/countries/35");
    expect(data.alive_count).toBe(2);
    expect(data.avg_level).toBe(40);
  });
});

describe("GET /api/scans", () => {
  test("returns list of scans", async () => {
    const data = await get("/api/scans");
    expect(data).toHaveLength(1);
    expect(data[0].scan_type).toBe("full");
    expect(data[0].total_scanned).toBe(4);
  });
});
