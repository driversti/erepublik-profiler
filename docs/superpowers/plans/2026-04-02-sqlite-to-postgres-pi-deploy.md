# SQLite to PostgreSQL Migration + Pi Deployment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SQLite with PostgreSQL, make scanner a UI-controlled polling worker, deploy to Raspberry Pi 4.

**Architecture:** postgres.js client connects to PostgreSQL 17. Scanner runs as a long-lived daemon polling for pending scans via the `scans` table. Web UI creates/cancels scans by writing to DB. Both containers share Gluetun VPN network and reach postgres via a shared Docker bridge network.

**Tech Stack:** Bun, TypeScript, postgres.js, PostgreSQL 17, Docker (ARM64), React frontend (unchanged)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add `postgres` dependency |
| `src/config.ts` | Modify | Replace `dbPath` with `databaseUrl`, remove `startId`/`endId` |
| `src/db/database.ts` | Rewrite | postgres.js connection + schema creation |
| `src/db/queries.ts` | Rewrite | Async functions with postgres.js tagged templates |
| `src/scanner/scanner.ts` | Rewrite | Async DB, scan_progress upserts, cancellation checks |
| `src/scanner/worker.ts` | Create | Poll loop: watch for pending scans, dispatch to scanner |
| `src/api/process-manager.ts` | Rewrite | Pure DB reader/writer — no subprocess spawning |
| `src/api/routes.ts` | Modify | Async postgres.js queries, accept `Sql` |
| `src/api/server.ts` | Modify | Pass `sql` instead of `db` |
| `src/index.ts` | Modify | Connect with postgres.js, launch worker or web |
| `docker-compose.yml` | Rewrite | Add postgres, shared network, remove scanner profiles |
| `.env.example` | Modify | Add `DATABASE_URL`, `POSTGRES_PASSWORD`, remove `DB_PATH`/`START_ID`/`END_ID` |
| `Dockerfile` | No change | Already builds Bun app correctly |

---

### Task 1: Add postgres dependency and update config

**Files:**
- Modify: `package.json`
- Modify: `src/config.ts`

- [ ] **Step 1: Install postgres.js**

```bash
cd /Users/driversti/Projects/erepublik/profiler && bun add postgres
```

- [ ] **Step 2: Update config.ts**

Replace the full file content of `src/config.ts` with:

```ts
export interface Config {
  databaseUrl: string;
  baseDelayMs: number;
  checkpointInterval: number;
  apiPort: number;
  botToken: string | null;
  chatId: string | null;
  topicId: string | null;
  homeCountry: string;
  gluetunApiUrl: string;
  jitterPercent: number;
  vpnPollIntervalMs: number;
  vpnPollTimeoutMs: number;
  vpnSleepOnFailureMs: number;
  progressEveryN: number;
}

export function loadConfig(): Config {
  return {
    databaseUrl: process.env.DATABASE_URL || "postgres://profiler:profiler@localhost:5432/profiler",
    baseDelayMs: parseInt(process.env.BASE_DELAY_MS || "10", 10),
    checkpointInterval: parseInt(process.env.CHECKPOINT_INTERVAL || "100", 10),
    apiPort: parseInt(process.env.API_PORT || "3434", 10),
    botToken: process.env.BOT_TOKEN || null,
    chatId: process.env.CHAT_ID || null,
    topicId: process.env.TOPIC_ID || null,
    homeCountry: process.env.HOME_COUNTRY || "PL",
    gluetunApiUrl: process.env.GLUETUN_API_URL || "http://localhost:8000",
    jitterPercent: 0.3,
    vpnPollIntervalMs: 2000,
    vpnPollTimeoutMs: 30000,
    vpnSleepOnFailureMs: 300_000,
    progressEveryN: 10_000,
  };
}
```

Removed: `startId`, `endId`, `dbPath`. Added: `databaseUrl`.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock src/config.ts
git commit -m "feat: add postgres.js dependency, update config for DATABASE_URL"
```

---

### Task 2: Rewrite database.ts — PostgreSQL connection and schema

**Files:**
- Rewrite: `src/db/database.ts`

- [ ] **Step 1: Rewrite database.ts**

Replace the full file content of `src/db/database.ts` with:

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/db/database.ts
git commit -m "feat: rewrite database.ts for PostgreSQL with postgres.js"
```

---

### Task 3: Rewrite queries.ts — async postgres.js functions

**Files:**
- Rewrite: `src/db/queries.ts`

- [ ] **Step 1: Rewrite queries.ts**

Replace the full file content of `src/db/queries.ts` with:

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/db/queries.ts
git commit -m "feat: rewrite queries.ts for async postgres.js"
```

---

### Task 4: Rewrite scanner.ts — async DB, progress tracking, cancellation

**Files:**
- Rewrite: `src/scanner/scanner.ts`

- [ ] **Step 1: Rewrite scanner.ts**

Replace the full file content of `src/scanner/scanner.ts` with:

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/scanner/scanner.ts
git commit -m "feat: rewrite scanner.ts for async postgres.js with progress tracking and cancellation"
```

---

### Task 5: Create scanner worker — polling daemon

**Files:**
- Create: `src/scanner/worker.ts`

- [ ] **Step 1: Create worker.ts**

Create `src/scanner/worker.ts` with:

```ts
import type { Sql } from "../db/database.ts";
import type { Config } from "../config.ts";
import { claimPendingScan, updateScanStatus } from "../db/queries.ts";
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
      const scan = await claimPendingScan(sql);

      if (scan) {
        console.log(`📋 Claimed scan #${scan.id}: ${scan.scan_type} [${scan.start_id}–${scan.end_id}]`);
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
```

- [ ] **Step 2: Commit**

```bash
git add src/scanner/worker.ts
git commit -m "feat: add scanner worker polling daemon"
```

---

### Task 6: Rewrite process-manager.ts — pure DB reader/writer

**Files:**
- Rewrite: `src/api/process-manager.ts`

- [ ] **Step 1: Rewrite process-manager.ts**

Replace the full file content of `src/api/process-manager.ts` with:

```ts
import type { Sql } from "../db/database.ts";

export interface ScanStatusResponse {
  state: "running" | "idle";
  scan_id?: number;
  scan_type?: string;
  start_id?: number;
  end_id?: number;
  current_id?: number;
  progress_pct?: number;
  eta_seconds?: number | null;
  rate_per_min?: number;
  stats?: {
    alive: number;
    dead: number;
    banned: number;
    not_found: number;
    errors: number;
  };
  last_scan?: unknown;
}

const HEARTBEAT_STALE_MS = 2 * 60 * 1000; // 2 minutes

export class ProcessManager {
  constructor(private sql: Sql) {}

  async start(startId: number, endId: number, scanType: string): Promise<void> {
    // Check if there's already a running or pending scan
    const [active] = await this.sql`
      SELECT id FROM scans WHERE status IN ('running', 'pending') LIMIT 1
    `;
    if (active) throw new Error("Scanner already has an active scan");

    await this.sql`
      INSERT INTO scans (started_at, scan_type, start_id, end_id, status)
      VALUES (NOW(), ${scanType}, ${startId}, ${endId}, 'pending')
    `;
  }

  async stop(): Promise<void> {
    const [active] = await this.sql`
      SELECT id FROM scans WHERE status = 'running' LIMIT 1
    `;
    if (!active) throw new Error("No running scan to stop");

    await this.sql`UPDATE scans SET status = 'cancelling' WHERE id = ${active.id}`;
  }

  async getStatus(): Promise<ScanStatusResponse> {
    // Check for running scan
    const [running] = await this.sql`
      SELECT s.*, sp.current_id, sp.alive, sp.dead, sp.banned, sp.not_found, sp.errors, sp.rate_per_min, sp.updated_at AS progress_updated_at
      FROM scans s
      LEFT JOIN scan_progress sp ON s.id = sp.scan_id
      WHERE s.status IN ('running', 'pending', 'cancelling')
      ORDER BY s.id DESC LIMIT 1
    `;

    if (!running || running.status === "pending") {
      // Check if pending (scanner hasn't picked it up yet)
      if (running?.status === "pending") {
        return {
          state: "running",
          scan_id: running.id,
          scan_type: running.scan_type,
          start_id: running.start_id,
          end_id: running.end_id,
        };
      }
      const [lastScan] = await this.sql`SELECT * FROM scans WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`;
      return { state: "idle", last_scan: lastScan ?? null };
    }

    // Check heartbeat — if progress hasn't updated in 2 min, scanner may have crashed
    if (running.progress_updated_at) {
      const staleSince = Date.now() - new Date(running.progress_updated_at).getTime();
      if (staleSince > HEARTBEAT_STALE_MS && running.current_id) {
        // Still report as running but with stale data
      }
    }

    const total = running.end_id - running.start_id + 1;
    const currentId = running.current_id ?? running.start_id;
    const processed = currentId - running.start_id + 1;
    const progressPct = Math.min(100, Math.round((processed / total) * 1000) / 10);

    const ratePerMin = running.rate_per_min ?? 0;
    const remainingIds = running.end_id - currentId;
    const etaSec = ratePerMin > 0 ? Math.round((remainingIds / ratePerMin) * 60) : null;

    return {
      state: "running",
      scan_id: running.id,
      scan_type: running.scan_type,
      start_id: running.start_id,
      end_id: running.end_id,
      current_id: currentId,
      progress_pct: progressPct,
      eta_seconds: etaSec,
      rate_per_min: ratePerMin,
      stats: running.current_id ? {
        alive: running.alive ?? 0,
        dead: running.dead ?? 0,
        banned: running.banned ?? 0,
        not_found: running.not_found ?? 0,
        errors: running.errors ?? 0,
      } : undefined,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/process-manager.ts
git commit -m "feat: rewrite process-manager as pure DB reader/writer"
```

---

### Task 7: Update routes.ts and server.ts for postgres.js

**Files:**
- Modify: `src/api/routes.ts`
- Modify: `src/api/server.ts`

- [ ] **Step 1: Rewrite routes.ts**

Replace the full file content of `src/api/routes.ts` with:

```ts
import { join, resolve } from "node:path";
import type { Sql } from "../db/database.ts";
import type { ProcessManager } from "./process-manager.ts";
import {
  getFailedCitizens,
  countFailedCitizens,
  queueFailedCitizensForRetry,
  queueAllFailedCitizensForRetry,
} from "../db/queries.ts";

const FRONTEND_DIR = resolve(import.meta.dir, "../../frontend/dist");

const LATEST = `
  JOIN (SELECT citizen_id, MAX(scan_id) AS max_scan_id FROM snapshots GROUP BY citizen_id) _lat
    ON s.citizen_id = _lat.citizen_id AND s.scan_id = _lat.max_scan_id
`;

export function createRouteHandler(sql: Sql, processManager: ProcessManager): (req: Request) => Response | Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      // GET /api/stats
      if (path === "/api/stats") {
        const hasData = await sql`SELECT 1 FROM snapshots LIMIT 1`;
        if (hasData.length === 0) {
          return json({ total_alive: 0, total_dead: 0, total_banned: 0, total_not_found: 0, last_scan: null });
        }

        const counts = await sql.unsafe(`
          SELECT s.status, COUNT(*) AS count FROM snapshots s ${LATEST} GROUP BY s.status
        `);

        const stats: Record<string, number> = { alive: 0, dead: 0, banned: 0, not_found: 0 };
        for (const row of counts) stats[row.status] = Number(row.count);

        const [lastScan] = await sql`SELECT * FROM scans WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`;

        return json({
          total_alive: stats.alive,
          total_dead: stats.dead,
          total_banned: stats.banned,
          total_not_found: stats.not_found,
          last_scan: lastScan ?? null,
        });
      }

      // GET /api/citizens/search?name=...
      if (path === "/api/citizens/search") {
        const name = url.searchParams.get("name") || "";
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const offset = parseInt(url.searchParams.get("offset") || "0", 10);
        const pattern = `${name}%`;

        const results = await sql.unsafe(`
          SELECT s.citizen_id, s.name, s.level, s.status, s.citizenship_country_name
          FROM snapshots s ${LATEST}
          WHERE s.name LIKE $1 AND s.status != 'not_found'
          ORDER BY s.level DESC LIMIT $2 OFFSET $3
        `, [pattern, limit, offset]);

        const [total] = await sql.unsafe(`
          SELECT COUNT(*) AS count FROM snapshots s ${LATEST}
          WHERE s.name LIKE $1 AND s.status != 'not_found'
        `, [pattern]);

        return json({ results, total: Number(total.count) });
      }

      // GET /api/citizens/:id/history
      const historyMatch = path.match(/^\/api\/citizens\/(\d+)\/history$/);
      if (historyMatch) {
        const citizenId = parseInt(historyMatch[1], 10);
        const rows = await sql`
          SELECT s.*, sc.scan_type FROM snapshots s
          JOIN scans sc ON s.scan_id = sc.id
          WHERE s.citizen_id = ${citizenId} ORDER BY s.scanned_at
        `;
        return json(rows);
      }

      // GET /api/citizens/:id/achievements
      const achieveMatch = path.match(/^\/api\/citizens\/(\d+)\/achievements$/);
      if (achieveMatch) {
        const citizenId = parseInt(achieveMatch[1], 10);
        const [latestSnap] = await sql`SELECT MAX(scan_id) AS scan_id FROM snapshots WHERE citizen_id = ${citizenId}`;
        if (!latestSnap?.scan_id) return json([]);

        const rows = await sql`
          SELECT medal_type, count FROM achievements
          WHERE citizen_id = ${citizenId} AND scan_id = ${latestSnap.scan_id} ORDER BY medal_type
        `;
        return json(rows);
      }

      // GET /api/citizens/:id
      const citizenMatch = path.match(/^\/api\/citizens\/(\d+)$/);
      if (citizenMatch) {
        const citizenId = parseInt(citizenMatch[1], 10);
        const [row] = await sql`
          SELECT * FROM snapshots WHERE citizen_id = ${citizenId} ORDER BY scanned_at DESC LIMIT 1
        `;
        if (!row) return json({ error: "Citizen not found" }, 404);
        return json(row);
      }

      // GET /api/countries/:id/citizens
      const countryCitizensMatch = path.match(/^\/api\/countries\/(\d+)\/citizens$/);
      if (countryCitizensMatch) {
        const countryId = parseInt(countryCitizensMatch[1], 10);
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const offset = parseInt(url.searchParams.get("offset") || "0", 10);
        const sort = url.searchParams.get("sort") || "level";
        const allowedSorts = ["level", "strength", "ground_rank_points", "air_rank_points"];
        const sortCol = allowedSorts.includes(sort) ? sort : "level";

        const results = await sql.unsafe(`
          SELECT s.* FROM snapshots s ${LATEST}
          WHERE s.citizenship_country_id = $1 AND s.status = 'alive'
          ORDER BY s.${sortCol} DESC LIMIT $2 OFFSET $3
        `, [countryId, limit, offset]);

        const [total] = await sql.unsafe(`
          SELECT COUNT(*) AS count FROM snapshots s ${LATEST}
          WHERE s.citizenship_country_id = $1 AND s.status = 'alive'
        `, [countryId]);

        return json({ results, total: Number(total.count) });
      }

      // GET /api/countries/:id
      const countryMatch = path.match(/^\/api\/countries\/(\d+)$/);
      if (countryMatch) {
        const countryId = parseInt(countryMatch[1], 10);

        const [stats] = await sql.unsafe(`
          SELECT COUNT(*) AS alive_count, AVG(s.level) AS avg_level, AVG(s.strength) AS avg_strength
          FROM snapshots s ${LATEST}
          WHERE s.citizenship_country_id = $1 AND s.status = 'alive'
        `, [countryId]);

        if (!stats || Number(stats.alive_count) === 0) {
          return json({ error: "Country not found" }, 404);
        }

        return json({
          citizenship_country_id: countryId,
          alive_count: Number(stats.alive_count),
          avg_level: Math.round(Number(stats.avg_level)),
          avg_strength: Math.round(Number(stats.avg_strength) || 0),
        });
      }

      // GET /api/countries
      if (path === "/api/countries") {
        const rows = await sql.unsafe(`
          SELECT s.citizenship_country_id, s.citizenship_country_name, COUNT(*) AS alive_count
          FROM snapshots s ${LATEST}
          WHERE s.status = 'alive'
          GROUP BY s.citizenship_country_id, s.citizenship_country_name
          ORDER BY alive_count DESC
        `);
        return json(rows);
      }

      // GET /api/players
      if (path === "/api/players") {
        const status = url.searchParams.get("status") || "all";
        const sort = url.searchParams.get("sort") || "level";
        const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC";
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const offset = parseInt(url.searchParams.get("offset") || "0", 10);

        const allowedSorts: Record<string, string> = {
          id: "s.citizen_id", name: "s.name", level: "s.level",
          xp: "s.xp", strength: "s.strength",
        };
        const sortCol = allowedSorts[sort] ?? "s.level";

        const allowedStatuses = ["alive", "dead", "banned"];
        const whereStatus = allowedStatuses.includes(status)
          ? `AND s.status = '${status}'`
          : "AND s.status != 'not_found'";

        const results = await sql.unsafe(`
          SELECT s.citizen_id, s.name, s.level, s.xp, s.strength, s.status,
                 s.citizenship_country_name, s.division, s.ground_rank_name
          FROM snapshots s ${LATEST}
          WHERE 1=1 ${whereStatus}
          ORDER BY ${sortCol} ${order} LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const [total] = await sql.unsafe(`
          SELECT COUNT(*) AS count FROM snapshots s ${LATEST}
          WHERE 1=1 ${whereStatus}
        `);

        return json({ results, total: Number(total.count) });
      }

      // GET /api/scans/:id
      const scanMatch = path.match(/^\/api\/scans\/(\d+)$/);
      if (scanMatch) {
        const scanId = parseInt(scanMatch[1], 10);
        const [scan] = await sql`SELECT * FROM scans WHERE id = ${scanId}`;
        if (!scan) return json({ error: "Scan not found" }, 404);
        return json(scan);
      }

      // GET /api/scans
      if (path === "/api/scans") {
        const rows = await sql`SELECT * FROM scans ORDER BY id DESC`;
        return json(rows);
      }

      // GET /api/scan/status
      if (path === "/api/scan/status") {
        return json(await processManager.getStatus());
      }

      // POST /api/scan/start
      if (path === "/api/scan/start" && req.method === "POST") {
        let body: { start_id: number; end_id: number; scan_type?: string };
        try {
          body = await req.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (!body.start_id || !body.end_id || body.start_id >= body.end_id) {
          return json({ error: "start_id and end_id required, start_id must be less than end_id" }, 400);
        }
        try {
          await processManager.start(body.start_id, body.end_id, body.scan_type ?? "full");
          return json({ ok: true });
        } catch (err) {
          return json({ error: (err as Error).message }, 409);
        }
      }

      // POST /api/scan/stop
      if (path === "/api/scan/stop" && req.method === "POST") {
        try {
          await processManager.stop();
          return json({ ok: true });
        } catch (err) {
          return json({ error: (err as Error).message }, 409);
        }
      }

      // GET /api/failed-citizens
      if (path === "/api/failed-citizens") {
        const scanId = url.searchParams.get("scan_id") ? parseInt(url.searchParams.get("scan_id")!, 10) : null;
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const offset = parseInt(url.searchParams.get("offset") || "0", 10);
        const results = await getFailedCitizens(sql, scanId, limit, offset);
        const total = await countFailedCitizens(sql, scanId);
        return json({ results, total });
      }

      // POST /api/failed-citizens/retry
      if (path === "/api/failed-citizens/retry" && req.method === "POST") {
        let body: { ids?: number[]; all?: boolean };
        try {
          body = await req.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (body.all) {
          await queueAllFailedCitizensForRetry(sql);
        } else if (Array.isArray(body.ids) && body.ids.length > 0) {
          await queueFailedCitizensForRetry(sql, body.ids);
        } else {
          return json({ error: "Provide ids array or all: true" }, 400);
        }
        return json({ ok: true });
      }

      // Static file serving (frontend)
      const filePath = join(FRONTEND_DIR, path);
      const file = Bun.file(filePath);
      if (await file.exists()) return new Response(file);

      // SPA fallback
      const indexFile = Bun.file(join(FRONTEND_DIR, "index.html"));
      if (await indexFile.exists()) return new Response(indexFile);

      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error("API error:", err);
      return json({ error: "Internal server error" }, 500);
    }
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

- [ ] **Step 2: Rewrite server.ts**

Replace the full file content of `src/api/server.ts` with:

```ts
import type { Sql } from "../db/database.ts";
import type { Config } from "../config.ts";
import { createRouteHandler } from "./routes.ts";
import { ProcessManager } from "./process-manager.ts";

export function startApiServer(sql: Sql, config: Config): void {
  const processManager = new ProcessManager(sql);
  const handler = createRouteHandler(sql, processManager);

  Bun.serve({
    port: config.apiPort,
    fetch: handler,
  });

  console.log(`🚀 Profiler API server running on http://localhost:${config.apiPort}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/api/routes.ts src/api/server.ts
git commit -m "feat: update routes and server for async postgres.js"
```

---

### Task 8: Update index.ts — postgres.js entrypoint with worker mode

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Rewrite index.ts**

Replace the full file content of `src/index.ts` with:

```ts
import { loadConfig } from "./config.ts";
import { initDatabase } from "./db/database.ts";
import { createTelegram } from "./telegram/telegram.ts";
import { createVpn } from "./vpn/vpn.ts";
import { startWorker } from "./scanner/worker.ts";
import { startApiServer } from "./api/server.ts";

const command = process.argv[2];

if (!command || !["scan", "web"].includes(command)) {
  console.log("Usage: bun run src/index.ts <command>");
  console.log("Commands:");
  console.log("  scan  — Start the scanner worker (polls for pending scans)");
  console.log("  web   — Start the web server (API + dashboard)");
  process.exit(1);
}

const config = loadConfig();
const sql = await initDatabase(config.databaseUrl);
const telegram = createTelegram(config);
const vpn = createVpn(config, telegram.send);

if (command === "scan") {
  try {
    const ipInfo = await vpn.checkIpLeak();
    console.log(`Current IP: ${ipInfo.ip} (${ipInfo.country})`);
    await startWorker(sql, config, vpn.rotateVpn, telegram.send, ipInfo.ip);
  } catch (err) {
    const msg = `💀 Fatal error: ${(err as Error).message}`;
    console.error(msg);
    await telegram.send(msg);
    await sql.end();
    process.exit(1);
  }
} else if (command === "web") {
  startApiServer(sql, config);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: update entrypoint for postgres.js and scanner worker mode"
```

---

### Task 9: Update docker-compose.yml and .env.example

**Files:**
- Rewrite: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Rewrite docker-compose.yml**

Replace the full file content of `docker-compose.yml` with:

```yaml
networks:
  db:
    driver: bridge

services:
  postgres:
    image: postgres:17-alpine
    container_name: profiler-postgres
    restart: unless-stopped
    networks: [db]
    environment:
      POSTGRES_DB: profiler
      POSTGRES_USER: profiler
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - ./pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U profiler"]
      interval: 10s
      timeout: 5s
      retries: 5

  gluetun:
    image: qmcgaw/gluetun
    container_name: gluetun-profiler
    restart: unless-stopped
    networks: [db]
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    environment:
      - VPN_SERVICE_PROVIDER=surfshark
      - VPN_TYPE=wireguard
      - WIREGUARD_PRIVATE_KEY=${WIREGUARD_PRIVATE_KEY}
      - WIREGUARD_ADDRESSES=${WIREGUARD_ADDRESSES}
      - SERVER_COUNTRIES=${SERVER_COUNTRIES:-Germany}
      - TZ=America/Los_Angeles
      - HTTP_CONTROL_SERVER_ADDRESS=:8000
      - HTTP_CONTROL_SERVER_AUTH_CONFIG_FILEPATH=/gluetun/auth/config.toml
    ports:
      - "3000:3000"
      - "8000:8000"
    volumes:
      - ./gluetun:/gluetun
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://www.google.com"]
      interval: 30s
      timeout: 10s
      start_period: 60s
      retries: 3

  profiler-web:
    image: registry.yurii.live/profiler:latest
    container_name: profiler-web
    restart: unless-stopped
    command: ["bun", "run", "src/index.ts", "web"]
    environment:
      - DATABASE_URL=postgres://profiler:${POSTGRES_PASSWORD}@postgres:5432/profiler
      - API_PORT=3000
    depends_on:
      postgres:
        condition: service_healthy
      gluetun:
        condition: service_healthy
    network_mode: "service:gluetun"

  profiler-scanner:
    image: registry.yurii.live/profiler:latest
    container_name: profiler-scanner
    restart: unless-stopped
    command: ["bun", "run", "src/index.ts", "scan"]
    environment:
      - DATABASE_URL=postgres://profiler:${POSTGRES_PASSWORD}@postgres:5432/profiler
      - BASE_DELAY_MS=${BASE_DELAY_MS:-10}
      - CHECKPOINT_INTERVAL=${CHECKPOINT_INTERVAL:-100}
      - BOT_TOKEN=${BOT_TOKEN}
      - CHAT_ID=${CHAT_ID}
      - TOPIC_ID=${TOPIC_ID}
      - HOME_COUNTRY=${HOME_COUNTRY:-PL}
      - GLUETUN_API_URL=http://localhost:8000
    depends_on:
      postgres:
        condition: service_healthy
      gluetun:
        condition: service_healthy
    network_mode: "service:gluetun"
```

- [ ] **Step 2: Update .env.example**

Replace the full file content of `.env.example` with:

```bash
# PostgreSQL
POSTGRES_PASSWORD=changeme

# Scanner
BASE_DELAY_MS=10
CHECKPOINT_INTERVAL=100

# API Server
API_PORT=3000

# Telegram (optional — if omitted, notifications are skipped)
BOT_TOKEN=
CHAT_ID=
TOPIC_ID=

# IP Leak Detection
HOME_COUNTRY=PL

# Surfshark WireGuard VPN (for docker-compose)
WIREGUARD_PRIVATE_KEY=
WIREGUARD_ADDRESSES=
SERVER_COUNTRIES=Germany
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: update docker-compose with PostgreSQL, shared network, worker scanner"
```

---

### Task 10: Build ARM64 image and deploy to Raspberry Pi

**Files:** No source changes — deployment only.

- [ ] **Step 1: Build and push ARM64 image**

```bash
cd /Users/driversti/Projects/erepublik/profiler
docker buildx build --platform linux/arm64 -t registry.yurii.live/profiler:latest --push .
```

- [ ] **Step 2: Create project directory on Pi**

```bash
ssh driversti@192.168.10.11 "mkdir -p ~/Projects/profiler"
```

- [ ] **Step 3: Copy deployment files to Pi**

```bash
scp docker-compose.yml driversti@192.168.10.11:~/Projects/profiler/
scp .env driversti@192.168.10.11:~/Projects/profiler/
scp -r gluetun driversti@192.168.10.11:~/Projects/profiler/
```

**Important:** Before copying `.env`, update it for the Pi deployment:
- Remove `START_ID`, `END_ID`, `DB_PATH` entries
- Add `POSTGRES_PASSWORD=<choose-a-password>`
- Keep all other values (BOT_TOKEN, VPN keys, etc.)

- [ ] **Step 4: Start the stack on Pi**

```bash
ssh driversti@192.168.10.11 "cd ~/Projects/profiler && docker compose up -d"
```

- [ ] **Step 5: Verify all containers are running**

```bash
ssh driversti@192.168.10.11 "cd ~/Projects/profiler && docker compose ps"
```

Expected: 4 containers running (postgres, gluetun, profiler-web, profiler-scanner).

- [ ] **Step 6: Verify web UI is accessible**

Open `http://192.168.10.11:3000` in browser. Dashboard should load. Scanner should show "Idle".

- [ ] **Step 7: Test scan from UI**

In the web UI Scan Management page, enter Start ID: `1`, End ID: `9743550`, Type: Full, click "Start Scan". Verify scanner picks it up (check logs):

```bash
ssh driversti@192.168.10.11 "cd ~/Projects/profiler && docker compose logs -f profiler-scanner --tail 20"
```

Expected: Scanner claims the pending scan and starts processing.
