import postgres from "postgres";

export type Sql = postgres.Sql;

export async function initDatabase(databaseUrl: string): Promise<Sql> {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  // Verify connection
  await sql`SELECT 1`;

  // Create schema
  await sql`
    CREATE TABLE IF NOT EXISTS scans (
      id SERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ,
      scan_type TEXT NOT NULL,
      start_id INT NOT NULL,
      end_id INT NOT NULL,
      total_scanned INT NOT NULL DEFAULT 0,
      total_found INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS snapshots (
      id SERIAL PRIMARY KEY,
      scan_id INT NOT NULL REFERENCES scans(id),
      citizen_id INT NOT NULL,
      scanned_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      is_organization BOOLEAN,
      name TEXT,
      level INT,
      xp BIGINT,
      created_at TEXT,
      avatar_url TEXT,
      ban_type TEXT,
      ban_reason TEXT,
      citizenship_country_id INT,
      citizenship_country_name TEXT,
      residence_country_id INT,
      residence_country_name TEXT,
      residence_region_id INT,
      residence_region_name TEXT,
      residence_city_id INT,
      residence_city_name TEXT,
      party_id INT,
      party_name TEXT,
      military_unit_id INT,
      military_unit_name TEXT,
      is_president BOOLEAN,
      is_congressman BOOLEAN,
      is_dictator BOOLEAN,
      is_party_president BOOLEAN,
      strength DOUBLE PRECISION,
      division INT,
      ground_rank_name TEXT,
      ground_rank_number INT,
      ground_rank_points DOUBLE PRECISION,
      air_rank_name TEXT,
      air_rank_number INT,
      air_rank_points DOUBLE PRECISION,
      air_perception DOUBLE PRECISION,
      best_damage DOUBLE PRECISION,
      best_damage_battle_id INT,
      friend_count INT,
      newspaper_id INT,
      newspaper_name TEXT,
      pvp_matches_played INT,
      pvp_matches_won INT,
      pvp_matches_lost INT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS achievements (
      id SERIAL PRIMARY KEY,
      scan_id INT NOT NULL REFERENCES scans(id),
      citizen_id INT NOT NULL,
      medal_type TEXT NOT NULL,
      count INT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS scan_errors (
      id SERIAL PRIMARY KEY,
      scan_id INT NOT NULL REFERENCES scans(id),
      citizen_id INT NOT NULL,
      scanned_at TIMESTAMPTZ NOT NULL,
      status_code INT,
      error_message TEXT NOT NULL,
      retryable BOOLEAN NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      scan_id INT NOT NULL REFERENCES scans(id),
      citizen_id INT NOT NULL,
      name TEXT,
      created_at TEXT,
      scanned_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS failed_citizens (
      id SERIAL PRIMARY KEY,
      scan_id INT NOT NULL REFERENCES scans(id),
      citizen_id INT NOT NULL,
      failed_at TIMESTAMPTZ NOT NULL,
      error_message TEXT NOT NULL,
      status_code INT,
      retry_count INT NOT NULL,
      retry_queued_at TIMESTAMPTZ,
      retried_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS checkpoint (
      scan_id INT PRIMARY KEY REFERENCES scans(id),
      last_processed_id INT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS scan_progress (
      scan_id INT PRIMARY KEY REFERENCES scans(id),
      current_id INT NOT NULL,
      alive INT NOT NULL DEFAULT 0,
      dead INT NOT NULL DEFAULT 0,
      banned INT NOT NULL DEFAULT 0,
      not_found INT NOT NULL DEFAULT 0,
      errors INT NOT NULL DEFAULT 0,
      skipped INT NOT NULL DEFAULT 0,
      rate_per_min INT,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `;

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_citizen_id ON snapshots(citizen_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_scan_id ON snapshots(scan_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_citizen_scan ON snapshots(citizen_id, scan_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_status ON snapshots(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snapshots_citizenship ON snapshots(citizenship_country_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_achievements_citizen ON achievements(citizen_id, scan_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_achievements_medal ON achievements(medal_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_scan_errors_scan_id ON scan_errors(scan_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_scan_errors_citizen_id ON scan_errors(citizen_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_scan_errors_status_code ON scan_errors(status_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_organizations_scan_id ON organizations(scan_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_organizations_citizen_id ON organizations(citizen_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_failed_citizens_scan_id ON failed_citizens(scan_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_failed_citizens_citizen_id ON failed_citizens(citizen_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_failed_citizens_retry ON failed_citizens(retry_queued_at, retried_at)`;

  return sql;
}
