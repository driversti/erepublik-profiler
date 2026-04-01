# Profiler Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript/Bun scanner that crawls all eRepublik citizen IDs, stores profile snapshots to SQLite, and serves a REST API for the future dashboard.

**Architecture:** Modular scanner with separated concerns: config, database, HTTP fetching, response parsing, retry/backoff, VPN rotation, Telegram notifications, and REST API. Mirrors org-crawler's proven patterns but in TypeScript with Bun runtime and SQLite storage instead of CSV.

**Tech Stack:** Bun, TypeScript, bun:sqlite, got-scraping, Gluetun VPN, Telegram Bot API, Docker

**Scope:** Scanner + REST API backend only. Frontend dashboard is a separate follow-up plan.

---

## File Structure

```
profiler/
├── src/
│   ├── index.ts              # Entry point — CLI arg parsing, starts scanner or API server
│   ├── config.ts             # Env var parsing and validation
│   ├── db/
│   │   ├── database.ts       # SQLite connection, schema init, PRAGMA setup
│   │   └── queries.ts        # Prepared statements for all DB operations
│   ├── scanner/
│   │   ├── scanner.ts        # Main scan loop orchestration
│   │   ├── fetcher.ts        # got-scraping HTTP client wrapper
│   │   ├── parser.ts         # API JSON response → typed snapshot object
│   │   └── retry.ts          # Exponential backoff + VPN rotation retry logic
│   ├── vpn/
│   │   └── vpn.ts            # Gluetun API client + IP leak check
│   ├── telegram/
│   │   └── telegram.ts       # Telegram Bot API notification sender
│   └── api/
│       ├── server.ts         # Bun.serve HTTP server + router
│       └── routes.ts         # REST endpoint handlers
├── tests/
│   ├── config.test.ts
│   ├── db/
│   │   ├── database.test.ts
│   │   └── queries.test.ts
│   ├── scanner/
│   │   ├── parser.test.ts
│   │   └── retry.test.ts
│   └── api/
│       └── routes.test.ts
├── data/                     # SQLite DB file (Docker volume mount)
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── release.sh
├── .env.example
├── .gitignore
├── CLAUDE.md
└── SPEC.md                   # Already exists
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `profiler/package.json`
- Create: `profiler/tsconfig.json`
- Create: `profiler/.gitignore`
- Create: `profiler/.env.example`
- Create: `profiler/CLAUDE.md`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "profiler",
  "version": "1.0.0",
  "description": "eRepublik citizen profile scanner and analytics",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test",
    "scan": "bun run src/index.ts scan",
    "api": "bun run src/index.ts api"
  },
  "dependencies": {
    "got-scraping": "^4.1.2"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
data/
.env
gluetun/
```

- [ ] **Step 4: Create .env.example**

```bash
# Scanner
START_ID=1
END_ID=10000000
BASE_DELAY_MS=10
CHECKPOINT_INTERVAL=100
DB_PATH=./data/profiler.db

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
WIREGUARD_ADDRESSES=10.14.0.2/16
SERVER_COUNTRIES=Germany
```

- [ ] **Step 5: Create CLAUDE.md**

```markdown
# Profiler

eRepublik citizen profile scanner. See SPEC.md for full specification.

## Stack
- Runtime: Bun
- Language: TypeScript
- Database: SQLite (bun:sqlite)
- HTTP: got-scraping

## Commands
\`\`\`bash
bun install                    # install deps
bun test                       # run tests
bun run scan                   # start scanner
bun run api                    # start API server
bun run dev                    # dev mode with watch
\`\`\`

## Architecture
- `src/config.ts` — env var parsing
- `src/db/` — SQLite schema + queries
- `src/scanner/` — crawl logic, fetcher, parser, retry
- `src/vpn/` — Gluetun VPN rotation
- `src/telegram/` — notifications
- `src/api/` — REST API server
```

- [ ] **Step 6: Install dependencies**

Run: `cd profiler && bun install`
Expected: `node_modules/` created, `bun.lock` generated

- [ ] **Step 7: Create placeholder entry point and verify Bun runs**

Create `src/index.ts`:
```typescript
console.log("profiler starting...");
```

Run: `bun run src/index.ts`
Expected: prints "profiler starting..."

- [ ] **Step 8: Commit**

```bash
git add package.json bun.lock tsconfig.json .gitignore .env.example CLAUDE.md src/index.ts
git commit -m "feat(profiler): project scaffold with Bun + TypeScript"
```

---

### Task 2: Config Module

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write failing tests for config parsing**

Create `tests/config.test.ts`:
```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.START_ID = "1";
    process.env.END_ID = "10000000";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("parses required env vars", async () => {
    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();
    expect(config.startId).toBe(1);
    expect(config.endId).toBe(10000000);
  });

  test("uses defaults for optional vars", async () => {
    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();
    expect(config.baseDelayMs).toBe(10);
    expect(config.checkpointInterval).toBe(100);
    expect(config.dbPath).toBe("./data/profiler.db");
    expect(config.apiPort).toBe(3000);
    expect(config.homeCountry).toBe("PL");
  });

  test("parses optional telegram vars as null when missing", async () => {
    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();
    expect(config.botToken).toBeNull();
    expect(config.chatId).toBeNull();
    expect(config.topicId).toBeNull();
  });

  test("throws when required vars missing", async () => {
    delete process.env.START_ID;
    const { loadConfig } = await import("../src/config.ts");
    expect(() => loadConfig()).toThrow("START_ID");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd profiler && bun test tests/config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement config module**

Create `src/config.ts`:
```typescript
export interface Config {
  startId: number;
  endId: number;
  baseDelayMs: number;
  checkpointInterval: number;
  dbPath: string;
  apiPort: number;
  botToken: string | null;
  chatId: string | null;
  topicId: string | null;
  homeCountry: string;
  gluetunApiUrl: string;
  backoffSteps: number[];
  jitterPercent: number;
  maxVpnRotationsPerRequest: number;
  vpnPollIntervalMs: number;
  vpnPollTimeoutMs: number;
  vpnSleepOnFailureMs: number;
  progressEveryN: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    startId: parseInt(required("START_ID"), 10),
    endId: parseInt(required("END_ID"), 10),
    baseDelayMs: parseInt(process.env.BASE_DELAY_MS || "10", 10),
    checkpointInterval: parseInt(process.env.CHECKPOINT_INTERVAL || "100", 10),
    dbPath: process.env.DB_PATH || "./data/profiler.db",
    apiPort: parseInt(process.env.API_PORT || "3000", 10),
    botToken: process.env.BOT_TOKEN || null,
    chatId: process.env.CHAT_ID || null,
    topicId: process.env.TOPIC_ID || null,
    homeCountry: process.env.HOME_COUNTRY || "PL",
    gluetunApiUrl: process.env.GLUETUN_API_URL || "http://localhost:8000",
    backoffSteps: [1000, 2000, 4000, 8000, 16000],
    jitterPercent: 0.3,
    maxVpnRotationsPerRequest: 3,
    vpnPollIntervalMs: 2000,
    vpnPollTimeoutMs: 30000,
    vpnSleepOnFailureMs: 300_000,
    progressEveryN: 10_000,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd profiler && bun test tests/config.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat(profiler): config module with env var parsing"
```

---

### Task 3: Database Schema + Connection

**Files:**
- Create: `src/db/database.ts`
- Create: `tests/db/database.test.ts`

- [ ] **Step 1: Write failing tests for database initialization**

Create `tests/db/database.test.ts`:
```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { unlinkSync, existsSync } from "fs";

const TEST_DB = "./data/test-database.db";

afterEach(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("initDatabase", () => {
  test("creates database file and tables", async () => {
    const { initDatabase } = await import("../../src/db/database.ts");
    const db = initDatabase(TEST_DB);

    // Verify tables exist by querying sqlite_master
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("scans");
    expect(tableNames).toContain("snapshots");
    expect(tableNames).toContain("achievements");
    expect(tableNames).toContain("checkpoint");

    db.close();
  });

  test("sets WAL journal mode", async () => {
    const { initDatabase } = await import("../../src/db/database.ts");
    const db = initDatabase(TEST_DB);

    const result = db.query("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    expect(result.journal_mode).toBe("wal");

    db.close();
  });

  test("is idempotent — can be called twice", async () => {
    const { initDatabase } = await import("../../src/db/database.ts");
    const db1 = initDatabase(TEST_DB);
    db1.close();
    const db2 = initDatabase(TEST_DB);

    const tables = db2
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.length).toBeGreaterThanOrEqual(4);

    db2.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd profiler && bun test tests/db/database.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement database module**

Create `src/db/database.ts`:
```typescript
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

  // Create indexes (IF NOT EXISTS for idempotency)
  db.run("CREATE INDEX IF NOT EXISTS idx_snapshots_citizen_id ON snapshots(citizen_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_snapshots_scan_id ON snapshots(scan_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_snapshots_citizen_scan ON snapshots(citizen_id, scan_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_snapshots_status ON snapshots(status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_snapshots_citizenship ON snapshots(citizenship_country_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_achievements_citizen ON achievements(citizen_id, scan_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_achievements_medal ON achievements(medal_type)");

  return db;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd profiler && bun test tests/db/database.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/database.ts tests/db/database.test.ts
git commit -m "feat(profiler): SQLite database schema with WAL mode"
```

---

### Task 4: Database Query Operations

**Files:**
- Create: `src/db/queries.ts`
- Create: `tests/db/queries.test.ts`

- [ ] **Step 1: Write failing tests for scan and snapshot operations**

Create `tests/db/queries.test.ts`:
```typescript
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
} from "../../src/db/queries.ts";

const TEST_DB = "./data/test-queries.db";
let db: Database;

beforeEach(() => {
  db = initDatabase(TEST_DB);
});

afterEach(() => {
  db.close();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  // Clean up WAL files
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

    const latest = getLatestScanId(db);
    expect(latest).toBe(2);
  });

  test("getLatestScanId returns null when no scans", () => {
    expect(getLatestScanId(db)).toBeNull();
  });
});

describe("snapshots", () => {
  test("insertSnapshot stores a full citizen snapshot", () => {
    const scanId = createScan(db, "full", 1, 100);
    insertSnapshot(db, {
      scan_id: scanId,
      citizen_id: 1234,
      scanned_at: new Date().toISOString(),
      status: "alive",
      is_organization: 0,
      name: "TestPlayer",
      level: 72,
      xp: 150000,
      created_at: "2009-01-15",
      avatar_url: "https://example.com/avatar.png",
      ban_type: null,
      ban_reason: null,
      citizenship_country_id: 35,
      citizenship_country_name: "Poland",
      residence_country_id: 35,
      residence_country_name: "Poland",
      residence_region_id: 100,
      residence_region_name: "Mazovia",
      residence_city_id: 50,
      residence_city_name: "Warsaw",
      party_id: 1000,
      party_name: "Test Party",
      military_unit_id: 500,
      military_unit_name: "Test MU",
      is_president: 0,
      is_congressman: 0,
      is_dictator: 0,
      is_party_president: 1,
      strength: 50000.5,
      division: 4,
      ground_rank_name: "God of War",
      ground_rank_number: 70,
      ground_rank_points: 1000000,
      air_rank_name: "Airman",
      air_rank_number: 10,
      air_rank_points: 50000,
      air_perception: 100,
      best_damage: 5000000,
      best_damage_battle_id: 99999,
      friend_count: 150,
      newspaper_id: 200,
      newspaper_name: "Test News",
      pvp_matches_played: 50,
      pvp_matches_won: 30,
      pvp_matches_lost: 20,
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
      scan_id: scanId,
      citizen_id: 9999,
      scanned_at: new Date().toISOString(),
      status: "not_found",
      is_organization: null,
      name: null,
      level: null,
      xp: null,
      created_at: null,
      avatar_url: null,
      ban_type: null,
      ban_reason: null,
      citizenship_country_id: null,
      citizenship_country_name: null,
      residence_country_id: null,
      residence_country_name: null,
      residence_region_id: null,
      residence_region_name: null,
      residence_city_id: null,
      residence_city_name: null,
      party_id: null,
      party_name: null,
      military_unit_id: null,
      military_unit_name: null,
      is_president: null,
      is_congressman: null,
      is_dictator: null,
      is_party_president: null,
      strength: null,
      division: null,
      ground_rank_name: null,
      ground_rank_number: null,
      ground_rank_points: null,
      air_rank_name: null,
      air_rank_number: null,
      air_rank_points: null,
      air_perception: null,
      best_damage: null,
      best_damage_battle_id: null,
      friend_count: null,
      newspaper_id: null,
      newspaper_name: null,
      pvp_matches_played: null,
      pvp_matches_won: null,
      pvp_matches_lost: null,
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

    const cp = getCheckpoint(db, scanId);
    expect(cp).toBe(5000);
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

    const baseSnapshot = {
      scanned_at: now,
      is_organization: null,
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

    insertSnapshot(db, { ...baseSnapshot, scan_id: scanId, citizen_id: 1, status: "alive" });
    insertSnapshot(db, { ...baseSnapshot, scan_id: scanId, citizen_id: 2, status: "dead" });
    insertSnapshot(db, { ...baseSnapshot, scan_id: scanId, citizen_id: 3, status: "alive" });
    insertSnapshot(db, { ...baseSnapshot, scan_id: scanId, citizen_id: 4, status: "not_found" });

    const aliveIds = getAliveCitizenIds(db, scanId);
    expect(aliveIds).toEqual([1, 3]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd profiler && bun test tests/db/queries.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement query operations**

Create `src/db/queries.ts`:
```typescript
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

export function createScan(
  db: Database,
  scanType: string,
  startId: number,
  endId: number,
): number {
  const result = db
    .query(
      "INSERT INTO scans (started_at, scan_type, start_id, end_id) VALUES (?, ?, ?, ?)",
    )
    .run(new Date().toISOString(), scanType, startId, endId);
  return Number(result.lastInsertRowid);
}

export function finishScan(db: Database, scanId: number): void {
  db.query("UPDATE scans SET finished_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    scanId,
  );
}

export function incrementScanCounters(
  db: Database,
  scanId: number,
  counts: { scanned: number; found: number },
): void {
  db.query(
    "UPDATE scans SET total_scanned = total_scanned + ?, total_found = total_found + ? WHERE id = ?",
  ).run(counts.scanned, counts.found, scanId);
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
    $scan_id: row.scan_id,
    $citizen_id: row.citizen_id,
    $scanned_at: row.scanned_at,
    $status: row.status,
    $is_organization: row.is_organization,
    $name: row.name,
    $level: row.level,
    $xp: row.xp,
    $created_at: row.created_at,
    $avatar_url: row.avatar_url,
    $ban_type: row.ban_type,
    $ban_reason: row.ban_reason,
    $citizenship_country_id: row.citizenship_country_id,
    $citizenship_country_name: row.citizenship_country_name,
    $residence_country_id: row.residence_country_id,
    $residence_country_name: row.residence_country_name,
    $residence_region_id: row.residence_region_id,
    $residence_region_name: row.residence_region_name,
    $residence_city_id: row.residence_city_id,
    $residence_city_name: row.residence_city_name,
    $party_id: row.party_id,
    $party_name: row.party_name,
    $military_unit_id: row.military_unit_id,
    $military_unit_name: row.military_unit_name,
    $is_president: row.is_president,
    $is_congressman: row.is_congressman,
    $is_dictator: row.is_dictator,
    $is_party_president: row.is_party_president,
    $strength: row.strength,
    $division: row.division,
    $ground_rank_name: row.ground_rank_name,
    $ground_rank_number: row.ground_rank_number,
    $ground_rank_points: row.ground_rank_points,
    $air_rank_name: row.air_rank_name,
    $air_rank_number: row.air_rank_number,
    $air_rank_points: row.air_rank_points,
    $air_perception: row.air_perception,
    $best_damage: row.best_damage,
    $best_damage_battle_id: row.best_damage_battle_id,
    $friend_count: row.friend_count,
    $newspaper_id: row.newspaper_id,
    $newspaper_name: row.newspaper_name,
    $pvp_matches_played: row.pvp_matches_played,
    $pvp_matches_won: row.pvp_matches_won,
    $pvp_matches_lost: row.pvp_matches_lost,
  });
}

export function insertAchievements(
  db: Database,
  scanId: number,
  citizenId: number,
  achievements: AchievementEntry[],
): void {
  const stmt = db.query(
    "INSERT INTO achievements (scan_id, citizen_id, medal_type, count) VALUES (?, ?, ?, ?)",
  );
  for (const a of achievements) {
    stmt.run(scanId, citizenId, a.medal_type, a.count);
  }
}

export function getCheckpoint(
  db: Database,
  scanId: number,
): number | null {
  const row = db
    .query("SELECT last_processed_id FROM checkpoint WHERE scan_id = ?")
    .get(scanId) as { last_processed_id: number } | null;
  return row?.last_processed_id ?? null;
}

export function saveCheckpoint(
  db: Database,
  scanId: number,
  lastProcessedId: number,
): void {
  db.query(`
    INSERT INTO checkpoint (scan_id, last_processed_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(scan_id) DO UPDATE SET
      last_processed_id = excluded.last_processed_id,
      updated_at = excluded.updated_at
  `).run(scanId, lastProcessedId, new Date().toISOString());
}

export function getLatestScanId(db: Database): number | null {
  const row = db
    .query("SELECT id FROM scans ORDER BY id DESC LIMIT 1")
    .get() as { id: number } | null;
  return row?.id ?? null;
}

export function getAliveCitizenIds(
  db: Database,
  scanId: number,
): number[] {
  const rows = db
    .query(
      "SELECT citizen_id FROM snapshots WHERE scan_id = ? AND status = 'alive' ORDER BY citizen_id",
    )
    .all(scanId) as { citizen_id: number }[];
  return rows.map((r) => r.citizen_id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd profiler && bun test tests/db/queries.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.ts tests/db/queries.test.ts
git commit -m "feat(profiler): database query operations for scans, snapshots, achievements"
```

---

### Task 5: API Response Parser

**Files:**
- Create: `src/scanner/parser.ts`
- Create: `tests/scanner/parser.test.ts`

- [ ] **Step 1: Write failing tests for parsing citizen profiles**

Create `tests/scanner/parser.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { parseCitizenResponse, type ParseResult } from "../../src/scanner/parser.ts";

const aliveResponse = {
  citizen: {
    id: 1234,
    name: "TestPlayer",
    is_organization: false,
    is_alive: true,
    created_at: "2009-01-15",
    avatar: "https://cdn.erepublik.com/avatars/1234.png",
    level: 72,
    banStatus: false,
  },
  citizenAttributes: {
    experience_points: 150000,
  },
  location: {
    citizenshipCountry: { id: 35, name: "Poland" },
    residenceCountry: { id: 35, name: "Poland" },
    residenceRegion: { id: 100, name: "Mazovia" },
  },
  city: {
    residenceCityId: 50,
    residenceCity: { id: 50, name: "Warsaw" },
  },
  partyData: { id: 1000, name: "Test Party", is_party_president: true },
  military: {
    militaryUnit: { id: 500, name: "Test MU" },
    militaryData: {
      strength: 50000.5,
      divisionData: { division: 4 },
      name: "God of War",
      rankNumber: 70,
      points: 1000000,
      aircraft: {
        name: "Airman",
        rankNumber: 10,
        points: 50000,
        coordination: 100,
      },
    },
    bestDamageData: { damage: 5000000, battle_id: 99999 },
  },
  isPresident: false,
  isCongressman: true,
  isDictator: false,
  friends: { number: 150 },
  newspaper: { id: 200, name: "Test News" },
  pvpStats: { matches_played: 50, matches_won: 30, matches_lost: 20 },
  achievements: [
    { name: "Battle Hero", count: 15 },
    { name: "Super Soldier", count: 300 },
    { name: "True Patriot", count: 5 },
  ],
};

describe("parseCitizenResponse", () => {
  test("parses alive citizen with full fields", () => {
    const result = parseCitizenResponse(aliveResponse);

    expect(result.type).toBe("citizen");
    if (result.type !== "citizen") return;

    expect(result.snapshot.status).toBe("alive");
    expect(result.snapshot.name).toBe("TestPlayer");
    expect(result.snapshot.level).toBe(72);
    expect(result.snapshot.xp).toBe(150000);
    expect(result.snapshot.citizenship_country_id).toBe(35);
    expect(result.snapshot.citizenship_country_name).toBe("Poland");
    expect(result.snapshot.party_id).toBe(1000);
    expect(result.snapshot.is_congressman).toBe(1);
    expect(result.snapshot.is_party_president).toBe(1);
    expect(result.snapshot.strength).toBe(50000.5);
    expect(result.snapshot.division).toBe(4);
    expect(result.snapshot.ground_rank_name).toBe("God of War");
    expect(result.snapshot.ground_rank_number).toBe(70);
    expect(result.snapshot.ground_rank_points).toBe(1000000);
    expect(result.snapshot.air_rank_name).toBe("Airman");
    expect(result.snapshot.air_rank_number).toBe(10);
    expect(result.snapshot.air_perception).toBe(100);
    expect(result.snapshot.best_damage).toBe(5000000);
    expect(result.snapshot.friend_count).toBe(150);
    expect(result.snapshot.newspaper_id).toBe(200);
    expect(result.snapshot.pvp_matches_played).toBe(50);

    expect(result.achievements).toHaveLength(3);
    expect(result.achievements[0]).toEqual({ medal_type: "Battle Hero", count: 15 });
  });

  test("returns skip for organization accounts", () => {
    const orgResponse = {
      ...aliveResponse,
      citizen: { ...aliveResponse.citizen, is_organization: true },
    };
    const result = parseCitizenResponse(orgResponse);
    expect(result.type).toBe("skip");
  });

  test("parses dead citizen", () => {
    const deadResponse = {
      ...aliveResponse,
      citizen: { ...aliveResponse.citizen, is_alive: false },
    };
    const result = parseCitizenResponse(deadResponse);
    if (result.type !== "citizen") throw new Error("expected citizen");
    expect(result.snapshot.status).toBe("dead");
  });

  test("parses banned citizen", () => {
    const bannedResponse = {
      ...aliveResponse,
      citizen: {
        ...aliveResponse.citizen,
        banStatus: { type: "permanent", reason: "multi-account" },
      },
    };
    const result = parseCitizenResponse(bannedResponse);
    if (result.type !== "citizen") throw new Error("expected citizen");
    expect(result.snapshot.status).toBe("banned");
    expect(result.snapshot.ban_type).toBe("permanent");
    expect(result.snapshot.ban_reason).toBe("multi-account");
  });

  test("handles missing optional fields gracefully", () => {
    const minimal = {
      citizen: {
        id: 5,
        name: "Min",
        is_organization: false,
        is_alive: true,
        created_at: "2010-01-01",
        avatar: "",
        level: 1,
        banStatus: false,
      },
      citizenAttributes: { experience_points: 0 },
      location: {
        citizenshipCountry: { id: 1, name: "Romania" },
        residenceCountry: { id: 1, name: "Romania" },
        residenceRegion: { id: 1, name: "Bucharest" },
      },
      city: {},
      partyData: false,
      military: {
        militaryUnit: false,
        militaryData: {
          strength: 0,
          divisionData: { division: 1 },
          name: "Recruit",
          rankNumber: 1,
          points: 0,
          aircraft: { name: "Airman", rankNumber: 1, points: 0, coordination: 0 },
        },
        bestDamageData: false,
      },
      isPresident: false,
      isCongressman: false,
      isDictator: false,
      friends: { number: 0 },
      newspaper: false,
      pvpStats: false,
      achievements: [],
    };

    const result = parseCitizenResponse(minimal);
    if (result.type !== "citizen") throw new Error("expected citizen");
    expect(result.snapshot.party_id).toBeNull();
    expect(result.snapshot.military_unit_id).toBeNull();
    expect(result.snapshot.best_damage).toBeNull();
    expect(result.snapshot.newspaper_id).toBeNull();
    expect(result.snapshot.pvp_matches_played).toBeNull();
    expect(result.snapshot.residence_city_id).toBeNull();
    expect(result.achievements).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd profiler && bun test tests/scanner/parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement parser**

Create `src/scanner/parser.ts`:
```typescript
import type { SnapshotRow, AchievementEntry } from "../db/queries.ts";

type CitizenResult = {
  type: "citizen";
  snapshot: Omit<SnapshotRow, "scan_id" | "scanned_at">;
  achievements: AchievementEntry[];
};

type SkipResult = { type: "skip" };

export type ParseResult = CitizenResult | SkipResult;

export function parseCitizenResponse(data: any): ParseResult {
  const citizen = data.citizen;

  if (citizen.is_organization) {
    return { type: "skip" };
  }

  const banStatus = citizen.banStatus && citizen.banStatus !== false
    ? citizen.banStatus
    : null;

  let status: string;
  if (banStatus) {
    status = "banned";
  } else if (!citizen.is_alive) {
    status = "dead";
  } else {
    status = "alive";
  }

  const party = data.partyData && data.partyData !== false ? data.partyData : null;
  const mu = data.military?.militaryUnit && data.military.militaryUnit !== false
    ? data.military.militaryUnit
    : null;
  const bestDmg = data.military?.bestDamageData && data.military.bestDamageData !== false
    ? data.military.bestDamageData
    : null;
  const newspaper = data.newspaper && data.newspaper !== false ? data.newspaper : null;
  const pvp = data.pvpStats && data.pvpStats !== false ? data.pvpStats : null;
  const city = data.city?.residenceCity || null;
  const mil = data.military?.militaryData;

  const snapshot: Omit<SnapshotRow, "scan_id" | "scanned_at"> = {
    citizen_id: citizen.id,
    status,
    is_organization: 0,
    name: citizen.name,
    level: citizen.level,
    xp: data.citizenAttributes?.experience_points ?? null,
    created_at: citizen.created_at,
    avatar_url: citizen.avatar || null,
    ban_type: banStatus?.type ?? null,
    ban_reason: banStatus?.reason ?? null,
    citizenship_country_id: data.location?.citizenshipCountry?.id ?? null,
    citizenship_country_name: data.location?.citizenshipCountry?.name ?? null,
    residence_country_id: data.location?.residenceCountry?.id ?? null,
    residence_country_name: data.location?.residenceCountry?.name ?? null,
    residence_region_id: data.location?.residenceRegion?.id ?? null,
    residence_region_name: data.location?.residenceRegion?.name ?? null,
    residence_city_id: city?.id ?? data.city?.residenceCityId ?? null,
    residence_city_name: city?.name ?? null,
    party_id: party?.id ?? null,
    party_name: party?.name ?? null,
    military_unit_id: mu?.id ?? null,
    military_unit_name: mu?.name ?? null,
    is_president: data.isPresident ? 1 : 0,
    is_congressman: data.isCongressman ? 1 : 0,
    is_dictator: data.isDictator ? 1 : 0,
    is_party_president: party?.is_party_president ? 1 : 0,
    strength: mil?.strength ?? null,
    division: mil?.divisionData?.division ?? null,
    ground_rank_name: mil?.name ?? null,
    ground_rank_number: mil?.rankNumber ?? null,
    ground_rank_points: mil?.points ?? null,
    air_rank_name: mil?.aircraft?.name ?? null,
    air_rank_number: mil?.aircraft?.rankNumber ?? null,
    air_rank_points: mil?.aircraft?.points ?? null,
    air_perception: mil?.aircraft?.coordination ?? null,
    best_damage: bestDmg?.damage ?? null,
    best_damage_battle_id: bestDmg?.battle_id ?? null,
    friend_count: data.friends?.number ?? null,
    newspaper_id: newspaper?.id ?? null,
    newspaper_name: newspaper?.name ?? null,
    pvp_matches_played: pvp?.matches_played ?? null,
    pvp_matches_won: pvp?.matches_won ?? null,
    pvp_matches_lost: pvp?.matches_lost ?? null,
  };

  const achievements: AchievementEntry[] = (data.achievements || []).map(
    (a: any) => ({
      medal_type: a.name,
      count: a.count,
    }),
  );

  return { type: "citizen", snapshot, achievements };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd profiler && bun test tests/scanner/parser.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scanner/parser.ts tests/scanner/parser.test.ts
git commit -m "feat(profiler): API response parser for citizen profiles"
```

---

### Task 6: Telegram Notifications

**Files:**
- Create: `src/telegram/telegram.ts`

- [ ] **Step 1: Implement Telegram module**

Create `src/telegram/telegram.ts`:
```typescript
import type { Config } from "../config.ts";

export function createTelegram(config: Config) {
  const canSend = Boolean(config.botToken && config.chatId);

  async function send(message: string): Promise<void> {
    if (!canSend) return;

    try {
      const body: Record<string, unknown> = {
        chat_id: config.chatId,
        text: message,
        parse_mode: "HTML",
      };
      if (config.topicId) {
        body.message_thread_id = parseInt(config.topicId, 10);
      }

      const response = await fetch(
        `https://api.telegram.org/bot${config.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) {
        console.error(`Telegram API error: ${response.status}`);
      }
    } catch (err) {
      console.error("Telegram send failed:", (err as Error).message);
    }
  }

  return { send };
}
```

No tests for Telegram — it's a thin wrapper over an external API with silent failure semantics (matching org-crawler pattern). Testing would require mocking `fetch` for minimal value.

- [ ] **Step 2: Commit**

```bash
git add src/telegram/telegram.ts
git commit -m "feat(profiler): Telegram notification module"
```

---

### Task 7: VPN Module

**Files:**
- Create: `src/vpn/vpn.ts`

- [ ] **Step 1: Implement VPN module**

Create `src/vpn/vpn.ts`:
```typescript
import type { Config } from "../config.ts";

export interface IpInfo {
  ip: string;
  country: string;
}

export function createVpn(
  config: Config,
  sendTelegram: (msg: string) => Promise<void>,
) {
  async function getCurrentIpInfo(): Promise<IpInfo> {
    const response = await fetch("https://ipinfo.io/json", {
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await response.json()) as { ip: string; country: string };
    return { ip: data.ip, country: data.country };
  }

  async function checkIpLeak(): Promise<IpInfo> {
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const info = await getCurrentIpInfo();
        if (info.country === config.homeCountry) {
          const msg = `🚨 IP LEAK: detected ${config.homeCountry} IP (${info.ip}). Exiting immediately.`;
          console.error(msg);
          await sendTelegram(msg);
          process.exit(1);
        }
        return info;
      } catch (err) {
        console.error(`IP check attempt ${i + 1}/${maxRetries} failed:`, (err as Error).message);
        if (i < maxRetries - 1) {
          await Bun.sleep(5000);
        }
      }
    }
    throw new Error("Failed to verify IP after all retries");
  }

  async function setVpnStatus(status: "stopped" | "running"): Promise<void> {
    await fetch(`${config.gluetunApiUrl}/v1/vpn/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(10_000),
    });
  }

  async function getVpnStatus(): Promise<string> {
    const response = await fetch(`${config.gluetunApiUrl}/v1/vpn/status`, {
      signal: AbortSignal.timeout(5_000),
    });
    const data = (await response.json()) as { status: string };
    return data.status;
  }

  async function pollVpnUntilRunning(): Promise<boolean> {
    const deadline = Date.now() + config.vpnPollTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const status = await getVpnStatus();
        if (status === "running") return true;
      } catch {
        // ignore poll errors
      }
      await Bun.sleep(config.vpnPollIntervalMs);
    }
    return false;
  }

  async function attemptRotation(): Promise<{ success: boolean; newIp?: string }> {
    try {
      await setVpnStatus("stopped");
      await Bun.sleep(2000);
      await setVpnStatus("running");

      const ready = await pollVpnUntilRunning();
      if (!ready) return { success: false };

      await Bun.sleep(2000);
      const info = await getCurrentIpInfo();
      return { success: true, newIp: info.ip };
    } catch (err) {
      console.error("VPN rotation attempt failed:", (err as Error).message);
      return { success: false };
    }
  }

  async function rotateVpn(oldIp: string): Promise<string> {
    while (true) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await attemptRotation();
        if (result.success && result.newIp) {
          const msg = `🔄 VPN rotated: ${oldIp} → ${result.newIp}`;
          console.log(msg);
          await sendTelegram(msg);
          return result.newIp;
        }
        console.error(`VPN rotation attempt ${attempt + 1}/3 failed`);
      }

      const msg = "⚠️ VPN reconnect failed 3x. Sleeping 5min.";
      console.error(msg);
      await sendTelegram(msg);
      await Bun.sleep(config.vpnSleepOnFailureMs);
    }
  }

  return { getCurrentIpInfo, checkIpLeak, rotateVpn };
}
```

No unit tests for VPN — it wraps external HTTP APIs (Gluetun, ipinfo.io). Same rationale as org-crawler: tested through integration in production. The retry/backoff logic that uses VPN is tested in Task 8.

- [ ] **Step 2: Commit**

```bash
git add src/vpn/vpn.ts
git commit -m "feat(profiler): VPN rotation module (Gluetun API)"
```

---

### Task 8: HTTP Fetcher + Retry Logic

**Files:**
- Create: `src/scanner/fetcher.ts`
- Create: `src/scanner/retry.ts`
- Create: `tests/scanner/retry.test.ts`

- [ ] **Step 1: Implement the HTTP fetcher**

Create `src/scanner/fetcher.ts`:
```typescript
import { gotScraping } from "got-scraping";

export interface FetchResult {
  type: "success" | "not_found" | "error";
  data?: any;
  error?: FetchError;
}

export interface FetchError {
  statusCode?: number;
  message: string;
  retryable: boolean;
}

function isCloudflareResponse(body: string): boolean {
  return (
    typeof body === "string" &&
    (body.includes("Cloudflare") ||
      body.includes("cf-browser-verification") ||
      body.includes("challenge-platform"))
  );
}

export async function fetchCitizen(citizenId: number): Promise<FetchResult> {
  try {
    const response = await gotScraping({
      url: `https://www.erepublik.com/en/main/citizen-profile-json-global/${citizenId}`,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout: { request: 15_000 },
      responseType: "text",
    });

    if (isCloudflareResponse(response.body)) {
      return {
        type: "error",
        error: { message: "Cloudflare challenge", retryable: true },
      };
    }

    try {
      const data = JSON.parse(response.body);
      return { type: "success", data };
    } catch {
      return {
        type: "error",
        error: { message: "Non-JSON response", retryable: true },
      };
    }
  } catch (err: any) {
    const statusCode = err.response?.statusCode;

    if (statusCode === 404) {
      return { type: "not_found" };
    }

    const retryable =
      statusCode === 403 ||
      statusCode === 429 ||
      (statusCode && statusCode >= 500) ||
      ["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET"].includes(err.code);

    return {
      type: "error",
      error: {
        statusCode,
        message: err.message || "Unknown error",
        retryable: Boolean(retryable),
      },
    };
  }
}
```

- [ ] **Step 2: Write failing tests for retry logic**

Create `tests/scanner/retry.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { withJitter, isRetryExhausted } from "../../src/scanner/retry.ts";

describe("withJitter", () => {
  test("returns value within ±30% of input", () => {
    const base = 1000;
    for (let i = 0; i < 100; i++) {
      const result = withJitter(base, 0.3);
      expect(result).toBeGreaterThanOrEqual(700);
      expect(result).toBeLessThanOrEqual(1300);
    }
  });

  test("returns 0 for 0 input", () => {
    expect(withJitter(0, 0.3)).toBe(0);
  });
});

describe("isRetryExhausted", () => {
  test("returns false when retries remain", () => {
    const steps = [1000, 2000, 4000, 8000, 16000];
    expect(isRetryExhausted(0, steps)).toBe(false);
    expect(isRetryExhausted(4, steps)).toBe(false);
  });

  test("returns true when all retries used", () => {
    const steps = [1000, 2000, 4000, 8000, 16000];
    expect(isRetryExhausted(5, steps)).toBe(true);
    expect(isRetryExhausted(6, steps)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd profiler && bun test tests/scanner/retry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement retry module**

Create `src/scanner/retry.ts`:
```typescript
import type { Config } from "../config.ts";
import { fetchCitizen, type FetchResult } from "./fetcher.ts";

export function withJitter(ms: number, jitterPercent: number): number {
  if (ms === 0) return 0;
  const jitter = ms * jitterPercent;
  return Math.round(ms + (Math.random() * 2 - 1) * jitter);
}

export function isRetryExhausted(attempt: number, backoffSteps: number[]): boolean {
  return attempt >= backoffSteps.length;
}

export interface RetryResult {
  fetchResult: FetchResult;
  newIp?: string;
}

export async function fetchWithRetry(
  citizenId: number,
  currentIp: string,
  config: Config,
  rotateVpn: (oldIp: string) => Promise<string>,
  sendTelegram: (msg: string) => Promise<void>,
): Promise<RetryResult> {
  let ip = currentIp;

  for (let vpnRotation = 0; vpnRotation < config.maxVpnRotationsPerRequest; vpnRotation++) {
    for (let attempt = 0; attempt < config.backoffSteps.length; attempt++) {
      const result = await fetchCitizen(citizenId);

      if (result.type === "success" || result.type === "not_found") {
        return { fetchResult: result, newIp: ip !== currentIp ? ip : undefined };
      }

      if (!result.error?.retryable) {
        return { fetchResult: result };
      }

      const delay = withJitter(config.backoffSteps[attempt], config.jitterPercent);
      console.warn(
        `Retry ${attempt + 1}/${config.backoffSteps.length} for ID ${citizenId}: ${result.error.message}. Waiting ${delay}ms`,
      );
      await Bun.sleep(delay);
    }

    // All backoff retries exhausted — rotate VPN
    console.warn(`Backoff exhausted for ID ${citizenId}. Rotating VPN (attempt ${vpnRotation + 1}/${config.maxVpnRotationsPerRequest})`);
    ip = await rotateVpn(ip);
  }

  // All VPN rotations exhausted
  const msg = `💀 Failed ID ${citizenId} after ${config.maxVpnRotationsPerRequest} VPN rotations`;
  console.error(msg);
  await sendTelegram(msg);

  return {
    fetchResult: {
      type: "error",
      error: { message: "All retries and VPN rotations exhausted", retryable: false },
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd profiler && bun test tests/scanner/retry.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/scanner/fetcher.ts src/scanner/retry.ts tests/scanner/retry.test.ts
git commit -m "feat(profiler): HTTP fetcher with got-scraping and retry/backoff logic"
```

---

### Task 9: Scanner Main Loop

**Files:**
- Create: `src/scanner/scanner.ts`

- [ ] **Step 1: Implement the scanner**

Create `src/scanner/scanner.ts`:
```typescript
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
import { fetchWithRetry } from "./retry.ts";
import { withJitter } from "./retry.ts";

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
      citizenId,
      ip,
      config,
      rotateVpn,
      sendTelegram,
    );
    if (newIp) ip = newIp;

    const now = new Date().toISOString();
    batchScanned++;

    if (fetchResult.type === "not_found") {
      insertSnapshot(db, {
        scan_id: scanId,
        citizen_id: citizenId,
        scanned_at: now,
        status: "not_found",
        is_organization: null,
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
```

- [ ] **Step 2: Commit**

```bash
git add src/scanner/scanner.ts
git commit -m "feat(profiler): main scan loop with checkpoint resume and progress reporting"
```

---

### Task 10: Entry Point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Implement the CLI entry point**

Replace `src/index.ts` with:
```typescript
import { loadConfig } from "./config.ts";
import { initDatabase } from "./db/database.ts";
import { createTelegram } from "./telegram/telegram.ts";
import { createVpn } from "./vpn/vpn.ts";
import { runScan } from "./scanner/scanner.ts";
import { startApiServer } from "./api/server.ts";

const command = process.argv[2];

if (!command || !["scan", "api"].includes(command)) {
  console.log("Usage: bun run src/index.ts <command>");
  console.log("Commands:");
  console.log("  scan [full|alive]  — Run a scan (default: full)");
  console.log("  api                — Start the REST API server");
  process.exit(1);
}

const config = loadConfig();
const db = initDatabase(config.dbPath);
const telegram = createTelegram(config);
const vpn = createVpn(config, telegram.send);

if (command === "scan") {
  const scanType = (process.argv[3] === "alive" ? "alive" : "full") as "full" | "alive";

  try {
    const ipInfo = await vpn.checkIpLeak();
    console.log(`Current IP: ${ipInfo.ip} (${ipInfo.country})`);
    await runScan(db, config, scanType, vpn.rotateVpn, telegram.send, ipInfo.ip);
  } catch (err) {
    const msg = `💀 Fatal error: ${(err as Error).message}`;
    console.error(msg);
    await telegram.send(msg);
    process.exit(1);
  } finally {
    db.close();
  }
} else if (command === "api") {
  startApiServer(db, config);
}
```

- [ ] **Step 2: Create a placeholder API server (to avoid import error)**

Create `src/api/server.ts`:
```typescript
import type { Database } from "bun:sqlite";
import type { Config } from "../config.ts";

export function startApiServer(db: Database, config: Config): void {
  console.log(`API server placeholder — will be implemented in Task 11`);
  console.log(`Would listen on port ${config.apiPort}`);
}
```

- [ ] **Step 3: Verify it compiles and shows usage**

Run: `cd profiler && bun run src/index.ts`
Expected: Prints usage message and exits with code 1

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/api/server.ts
git commit -m "feat(profiler): CLI entry point with scan and api commands"
```

---

### Task 11: REST API Server — Global Stats + Scan Endpoints

**Files:**
- Modify: `src/api/server.ts`
- Create: `src/api/routes.ts`
- Create: `tests/api/routes.test.ts`

- [ ] **Step 1: Write failing tests for API endpoints**

Create `tests/api/routes.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd profiler && bun test tests/api/routes.test.ts`
Expected: FAIL — module not found / createRouteHandler not found

- [ ] **Step 3: Implement routes**

Create `src/api/routes.ts`:
```typescript
import type { Database } from "bun:sqlite";

export function createRouteHandler(db: Database): (req: Request) => Response | Promise<Response> {
  return (req: Request): Response => {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      // GET /api/stats
      if (path === "/api/stats") {
        const latestScan = db.query("SELECT id FROM scans ORDER BY id DESC LIMIT 1").get() as { id: number } | null;
        if (!latestScan) {
          return json({ total_alive: 0, total_dead: 0, total_banned: 0, total_not_found: 0, last_scan: null });
        }
        const counts = db.query(`
          SELECT status, COUNT(*) as count FROM snapshots WHERE scan_id = ? GROUP BY status
        `).all(latestScan.id) as { status: string; count: number }[];

        const stats: Record<string, number> = { alive: 0, dead: 0, banned: 0, not_found: 0 };
        for (const row of counts) stats[row.status] = row.count;

        const scan = db.query("SELECT * FROM scans WHERE id = ?").get(latestScan.id);

        return json({
          total_alive: stats.alive,
          total_dead: stats.dead,
          total_banned: stats.banned,
          total_not_found: stats.not_found,
          last_scan: scan,
        });
      }

      // GET /api/citizens/search?name=...
      if (path === "/api/citizens/search") {
        const name = url.searchParams.get("name") || "";
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const offset = parseInt(url.searchParams.get("offset") || "0", 10);
        const latestScan = db.query("SELECT id FROM scans ORDER BY id DESC LIMIT 1").get() as { id: number } | null;
        if (!latestScan) return json({ results: [], total: 0 });

        const results = db.query(`
          SELECT citizen_id, name, level, status, citizenship_country_name
          FROM snapshots WHERE scan_id = ? AND name LIKE ? AND status != 'not_found'
          ORDER BY level DESC LIMIT ? OFFSET ?
        `).all(latestScan.id, `${name}%`, limit, offset);

        const total = db.query(`
          SELECT COUNT(*) as count FROM snapshots WHERE scan_id = ? AND name LIKE ? AND status != 'not_found'
        `).get(latestScan.id, `${name}%`) as { count: number };

        return json({ results, total: total.count });
      }

      // GET /api/citizens/:id/history
      const historyMatch = path.match(/^\/api\/citizens\/(\d+)\/history$/);
      if (historyMatch) {
        const citizenId = parseInt(historyMatch[1], 10);
        const rows = db.query(`
          SELECT s.*, sc.scan_type FROM snapshots s
          JOIN scans sc ON s.scan_id = sc.id
          WHERE s.citizen_id = ? ORDER BY s.scanned_at
        `).all(citizenId);
        return json(rows);
      }

      // GET /api/citizens/:id/achievements
      const achieveMatch = path.match(/^\/api\/citizens\/(\d+)\/achievements$/);
      if (achieveMatch) {
        const citizenId = parseInt(achieveMatch[1], 10);
        const latestScan = db.query("SELECT id FROM scans ORDER BY id DESC LIMIT 1").get() as { id: number } | null;
        if (!latestScan) return json([]);

        const rows = db.query(`
          SELECT medal_type, count FROM achievements
          WHERE citizen_id = ? AND scan_id = ? ORDER BY medal_type
        `).all(citizenId, latestScan.id);
        return json(rows);
      }

      // GET /api/citizens/:id
      const citizenMatch = path.match(/^\/api\/citizens\/(\d+)$/);
      if (citizenMatch) {
        const citizenId = parseInt(citizenMatch[1], 10);
        const row = db.query(`
          SELECT * FROM snapshots WHERE citizen_id = ? ORDER BY scanned_at DESC LIMIT 1
        `).get(citizenId);
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

        const latestScan = db.query("SELECT id FROM scans ORDER BY id DESC LIMIT 1").get() as { id: number } | null;
        if (!latestScan) return json({ results: [], total: 0 });

        const results = db.query(`
          SELECT * FROM snapshots
          WHERE scan_id = ? AND citizenship_country_id = ? AND status = 'alive'
          ORDER BY ${sortCol} DESC LIMIT ? OFFSET ?
        `).all(latestScan.id, countryId, limit, offset);

        const total = db.query(`
          SELECT COUNT(*) as count FROM snapshots
          WHERE scan_id = ? AND citizenship_country_id = ? AND status = 'alive'
        `).get(latestScan.id, countryId) as { count: number };

        return json({ results, total: total.count });
      }

      // GET /api/countries/:id
      const countryMatch = path.match(/^\/api\/countries\/(\d+)$/);
      if (countryMatch) {
        const countryId = parseInt(countryMatch[1], 10);
        const latestScan = db.query("SELECT id FROM scans ORDER BY id DESC LIMIT 1").get() as { id: number } | null;
        if (!latestScan) return json({ error: "No scan data" }, 404);

        const stats = db.query(`
          SELECT
            COUNT(*) as alive_count,
            AVG(level) as avg_level,
            AVG(strength) as avg_strength
          FROM snapshots
          WHERE scan_id = ? AND citizenship_country_id = ? AND status = 'alive'
        `).get(latestScan.id, countryId) as any;

        if (!stats || stats.alive_count === 0) {
          return json({ error: "Country not found" }, 404);
        }

        return json({
          citizenship_country_id: countryId,
          alive_count: stats.alive_count,
          avg_level: Math.round(stats.avg_level),
          avg_strength: Math.round(stats.avg_strength || 0),
        });
      }

      // GET /api/countries
      if (path === "/api/countries") {
        const latestScan = db.query("SELECT id FROM scans ORDER BY id DESC LIMIT 1").get() as { id: number } | null;
        if (!latestScan) return json([]);

        const rows = db.query(`
          SELECT citizenship_country_id, citizenship_country_name,
                 COUNT(*) as alive_count
          FROM snapshots
          WHERE scan_id = ? AND status = 'alive'
          GROUP BY citizenship_country_id, citizenship_country_name
          ORDER BY alive_count DESC
        `).all(latestScan.id);
        return json(rows);
      }

      // GET /api/scans/:id
      const scanMatch = path.match(/^\/api\/scans\/(\d+)$/);
      if (scanMatch) {
        const scanId = parseInt(scanMatch[1], 10);
        const scan = db.query("SELECT * FROM scans WHERE id = ?").get(scanId);
        if (!scan) return json({ error: "Scan not found" }, 404);
        return json(scan);
      }

      // GET /api/scans
      if (path === "/api/scans") {
        const rows = db.query("SELECT * FROM scans ORDER BY id DESC").all();
        return json(rows);
      }

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

- [ ] **Step 4: Update server.ts to use the route handler**

Replace `src/api/server.ts` with:
```typescript
import type { Database } from "bun:sqlite";
import type { Config } from "../config.ts";
import { createRouteHandler } from "./routes.ts";

export function startApiServer(db: Database, config: Config): void {
  const handler = createRouteHandler(db);

  Bun.serve({
    port: config.apiPort,
    fetch: handler,
  });

  console.log(`🚀 Profiler API server running on http://localhost:${config.apiPort}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd profiler && bun test tests/api/routes.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/server.ts src/api/routes.ts tests/api/routes.test.ts
git commit -m "feat(profiler): REST API with stats, citizens, countries, scans endpoints"
```

---

### Task 12: Docker + Deployment Files

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `release.sh`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY src/ ./src/

CMD ["bun", "run", "src/index.ts", "scan"]
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  profiler:
    image: registry.yurii.live/profiler:latest
    container_name: profiler
    restart: unless-stopped
    environment:
      - START_ID=${START_ID}
      - END_ID=${END_ID}
      - BASE_DELAY_MS=${BASE_DELAY_MS:-10}
      - CHECKPOINT_INTERVAL=${CHECKPOINT_INTERVAL:-100}
      - DB_PATH=/app/data/profiler.db
      - API_PORT=3000
      - BOT_TOKEN=${BOT_TOKEN}
      - CHAT_ID=${CHAT_ID}
      - TOPIC_ID=${TOPIC_ID}
      - HOME_COUNTRY=${HOME_COUNTRY:-PL}
    volumes:
      - ./data:/app/data
    depends_on:
      gluetun:
        condition: service_healthy
    network_mode: "service:gluetun"

  gluetun:
    image: qmcgaw/gluetun
    container_name: gluetun-profiler
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
    ports:
      - "3000:3000"
      - "8000:8000"
    volumes:
      - ./gluetun:/gluetun
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://www.google.com"]
      interval: 30s
      timeout: 10s
      start_period: 60s
      retries: 3
```

- [ ] **Step 3: Create release.sh**

```bash
#!/bin/bash
set -e

REGISTRY="${REGISTRY_URL:-registry.yurii.live}"
IMAGE_NAME="profiler"
TAG="${1:-latest}"

docker buildx inspect multiarch >/dev/null 2>&1 || \
    docker buildx create --name multiarch --use

if [ -n "$REGISTRY_USER" ] && [ -n "$REGISTRY_PASSWORD" ]; then
    echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY" -u "$REGISTRY_USER" --password-stdin
fi

docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --tag "$REGISTRY/$IMAGE_NAME:$TAG" \
    --tag "$REGISTRY/$IMAGE_NAME:latest" \
    --push \
    .

echo "Pushed $REGISTRY/$IMAGE_NAME:$TAG"
```

- [ ] **Step 4: Make release.sh executable**

Run: `chmod +x profiler/release.sh`

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml release.sh
git commit -m "feat(profiler): Docker deployment with Gluetun VPN"
```

---

### Task 13: Run All Tests + Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `cd profiler && bun test`
Expected: All tests pass (config, database, queries, parser, retry, routes)

- [ ] **Step 2: Verify scan command shows usage without env vars**

Run: `cd profiler && bun run src/index.ts`
Expected: Prints usage message

- [ ] **Step 3: Verify scan command with env vars (dry check)**

Run: `cd profiler && START_ID=1 END_ID=5 bun run src/index.ts scan 2>&1 | head -5`
Expected: Attempts to check IP (will fail without VPN, which is expected locally). Confirms the app wires together correctly.

- [ ] **Step 4: Verify API server starts**

Run: `cd profiler && START_ID=1 END_ID=5 DB_PATH=./data/test-server.db bun run src/index.ts api &`
Then: `curl -s http://localhost:3000/api/stats | head`
Expected: Returns JSON with zeros (empty DB). Kill the background process after.

- [ ] **Step 5: Clean up test artifacts**

Run: `rm -f profiler/data/test-*.db profiler/data/test-*.db-wal profiler/data/test-*.db-shm`

- [ ] **Step 6: Final commit with all files verified**

Ensure all files are tracked. No additional commit needed if all prior commits succeeded.
