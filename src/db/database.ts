import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

export function initDatabase(dbPath: string): Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });

  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      scan_type TEXT NOT NULL,
      start_id INTEGER NOT NULL,
      end_id INTEGER NOT NULL,
      total_scanned INTEGER NOT NULL DEFAULT 0,
      total_found INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      citizen_id INTEGER NOT NULL,
      scanned_at TEXT NOT NULL,
      status TEXT NOT NULL,
      is_organization INTEGER,
      name TEXT,
      level INTEGER,
      xp INTEGER,
      created_at TEXT,
      avatar_url TEXT,
      ban_type TEXT,
      ban_reason TEXT,
      citizenship_country_id INTEGER,
      citizenship_country_name TEXT,
      residence_country_id INTEGER,
      residence_country_name TEXT,
      residence_region_id INTEGER,
      residence_region_name TEXT,
      residence_city_id INTEGER,
      residence_city_name TEXT,
      party_id INTEGER,
      party_name TEXT,
      military_unit_id INTEGER,
      military_unit_name TEXT,
      is_president INTEGER,
      is_congressman INTEGER,
      is_dictator INTEGER,
      is_party_president INTEGER,
      strength REAL,
      division INTEGER,
      ground_rank_name TEXT,
      ground_rank_number INTEGER,
      ground_rank_points REAL,
      air_rank_name TEXT,
      air_rank_number INTEGER,
      air_rank_points REAL,
      air_perception REAL,
      best_damage REAL,
      best_damage_battle_id INTEGER,
      friend_count INTEGER,
      newspaper_id INTEGER,
      newspaper_name TEXT,
      pvp_matches_played INTEGER,
      pvp_matches_won INTEGER,
      pvp_matches_lost INTEGER,
      FOREIGN KEY (scan_id) REFERENCES scans(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      citizen_id INTEGER NOT NULL,
      medal_type TEXT NOT NULL,
      count INTEGER NOT NULL,
      FOREIGN KEY (scan_id) REFERENCES scans(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS checkpoint (
      scan_id INTEGER PRIMARY KEY,
      last_processed_id INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (scan_id) REFERENCES scans(id)
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_snapshots_citizen_id ON snapshots(citizen_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_snapshots_scan_id ON snapshots(scan_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_snapshots_citizen_scan ON snapshots(citizen_id, scan_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_snapshots_status ON snapshots(status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_snapshots_citizenship ON snapshots(citizenship_country_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_achievements_citizen ON achievements(citizen_id, scan_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_achievements_medal ON achievements(medal_type)");

  return db;
}
