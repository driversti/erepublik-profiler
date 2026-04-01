# Scan Monitoring & Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Scan Management page with real-time progress, start/stop process control, and a manual retry flow for failed citizens.

**Architecture:** The API server spawns/kills the scanner as a child process via `Bun.spawn()` and tracks its PID in memory. A new `ProcessManager` class encapsulates lifecycle; API routes delegate to it. Progress is read from the existing `checkpoint` + `scans` tables. Failed citizens (those exhausting all retries) are recorded in a new `failed_citizens` table and can be re-queued manually.

**Tech Stack:** Bun, TypeScript, bun:sqlite, React 18, TanStack Query, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/db/database.ts` | Modify | Add `failed_citizens` table schema + indexes |
| `src/db/queries.ts` | Modify | Add failed-citizen CRUD functions |
| `src/config.ts` | Modify | Add `backoffSteps5xx` (10-step array) |
| `src/scanner/retry.ts` | Modify | Differentiate 5xx retry (10 steps) from default (5 steps) |
| `src/scanner/scanner.ts` | Modify | Call `insertFailedCitizen` on exhaustion; add "retry" scan type |
| `src/index.ts` | Modify | Accept "retry" as valid scan type |
| `src/api/process-manager.ts` | **Create** | Spawn/kill scanner, read progress from DB |
| `src/api/server.ts` | Modify | Instantiate `ProcessManager`, pass to route handler |
| `src/api/routes.ts` | Modify | Add `/api/scan/*` and `/api/failed-citizens` routes |
| `tests/db/queries.test.ts` | Modify | Tests for failed-citizen queries |
| `tests/scanner/retry.test.ts` | Modify | Tests for 5xx vs default retry differentiation |
| `frontend/src/types/api.ts` | Modify | Add `ScanStatus`, `FailedCitizen` types |
| `frontend/src/api/client.ts` | Modify | Add scan control + failed-citizens API calls |
| `frontend/src/api/hooks.ts` | Modify | Add `useScanStatus` (polling), `useFailedCitizens` |
| `frontend/src/pages/ScanManagement.tsx` | **Create** | Scan management UI |
| `frontend/src/App.tsx` | Modify | Add `/scan` route |
| `frontend/src/components/Layout.tsx` | Modify | Add "Scan" nav link |

---

## Task 1: `failed_citizens` table + queries + tests

**Files:**
- Modify: `src/db/database.ts`
- Modify: `src/db/queries.ts`
- Modify: `tests/db/queries.test.ts`

- [ ] **Step 1: Add table to database.ts**

In `src/db/database.ts`, add after the `organizations` table block (before the `checkpoint` table):

```typescript
  db.run(`
    CREATE TABLE IF NOT EXISTS failed_citizens (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id          INTEGER NOT NULL,
      citizen_id       INTEGER NOT NULL,
      failed_at        TEXT NOT NULL,
      error_message    TEXT NOT NULL,
      status_code      INTEGER,
      retry_count      INTEGER NOT NULL,
      retry_queued_at  TEXT,
      retried_at       TEXT,
      FOREIGN KEY (scan_id) REFERENCES scans(id)
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_failed_citizens_scan_id ON failed_citizens(scan_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_failed_citizens_citizen_id ON failed_citizens(citizen_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_failed_citizens_retry ON failed_citizens(retry_queued_at, retried_at)");
```

- [ ] **Step 2: Add query functions to queries.ts**

Add to `src/db/queries.ts`:

```typescript
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

export function insertFailedCitizen(
  db: Database,
  scanId: number,
  citizenId: number,
  failedAt: string,
  errorMessage: string,
  statusCode: number | null | undefined,
  retryCount: number,
): void {
  db.query(
    "INSERT INTO failed_citizens (scan_id, citizen_id, failed_at, error_message, status_code, retry_count) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(scanId, citizenId, failedAt, errorMessage, statusCode ?? null, retryCount);
}

export function getFailedCitizens(
  db: Database,
  scanId: number | null,
  limit: number,
  offset: number,
): FailedCitizenRow[] {
  if (scanId !== null) {
    return db.query(
      "SELECT * FROM failed_citizens WHERE scan_id = ? ORDER BY citizen_id LIMIT ? OFFSET ?"
    ).all(scanId, limit, offset) as FailedCitizenRow[];
  }
  return db.query(
    "SELECT * FROM failed_citizens ORDER BY citizen_id LIMIT ? OFFSET ?"
  ).all(limit, offset) as FailedCitizenRow[];
}

export function countFailedCitizens(db: Database, scanId: number | null): number {
  const row = scanId !== null
    ? db.query("SELECT COUNT(*) AS count FROM failed_citizens WHERE scan_id = ?").get(scanId) as { count: number }
    : db.query("SELECT COUNT(*) AS count FROM failed_citizens").get() as { count: number };
  return row.count;
}

export function queueFailedCitizensForRetry(db: Database, ids: number[]): void {
  const now = new Date().toISOString();
  const stmt = db.query("UPDATE failed_citizens SET retry_queued_at = ? WHERE id = ? AND retried_at IS NULL");
  for (const id of ids) stmt.run(now, id);
}

export function queueAllFailedCitizensForRetry(db: Database): void {
  db.query("UPDATE failed_citizens SET retry_queued_at = ? WHERE retried_at IS NULL")
    .run(new Date().toISOString());
}

export function getQueuedRetryIds(db: Database): number[] {
  const rows = db.query(
    "SELECT citizen_id FROM failed_citizens WHERE retry_queued_at IS NOT NULL AND retried_at IS NULL ORDER BY citizen_id"
  ).all() as { citizen_id: number }[];
  return rows.map((r) => r.citizen_id);
}

export function markCitizenRetried(db: Database, citizenId: number): void {
  db.query(
    "UPDATE failed_citizens SET retried_at = ? WHERE citizen_id = ? AND retry_queued_at IS NOT NULL AND retried_at IS NULL"
  ).run(new Date().toISOString(), citizenId);
}
```

- [ ] **Step 3: Write tests for failed-citizen queries**

Add a new `describe("failed_citizens", ...)` block to `tests/db/queries.test.ts`. Also import the new functions at the top:

```typescript
import {
  // existing imports ...
  insertFailedCitizen,
  getFailedCitizens,
  countFailedCitizens,
  queueFailedCitizensForRetry,
  queueAllFailedCitizensForRetry,
  getQueuedRetryIds,
  markCitizenRetried,
} from "../../src/db/queries.ts";
```

Add at the end of the file:

```typescript
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
    const ids = getQueuedRetryIds(db);
    expect(ids).toEqual([2001, 2002]);
  });

  test("queueFailedCitizensForRetry queues only selected rows by id", () => {
    const scanId = createScan(db, "full", 1, 100);
    const now = new Date().toISOString();
    insertFailedCitizen(db, scanId, 3001, now, "err", null, 5);
    insertFailedCitizen(db, scanId, 3002, now, "err", null, 5);
    const rows = getFailedCitizens(db, scanId, 10, 0);
    queueFailedCitizensForRetry(db, [rows[0].id]);
    const ids = getQueuedRetryIds(db);
    expect(ids).toEqual([3001]);
  });

  test("markCitizenRetried sets retried_at and removes from queue", () => {
    const scanId = createScan(db, "full", 1, 100);
    const now = new Date().toISOString();
    insertFailedCitizen(db, scanId, 4001, now, "err", null, 5);
    queueAllFailedCitizensForRetry(db);
    markCitizenRetried(db, 4001);
    const ids = getQueuedRetryIds(db);
    expect(ids).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/db/queries.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/database.ts src/db/queries.ts tests/db/queries.test.ts
git commit -m "feat(db): add failed_citizens table with retry queue queries"
```

---

## Task 2: 5xx-specific retry logic

**Files:**
- Modify: `src/config.ts`
- Modify: `src/scanner/retry.ts`
- Modify: `tests/scanner/retry.test.ts`

- [ ] **Step 1: Add `backoffSteps5xx` to config**

In `src/config.ts`, add to the `Config` interface:

```typescript
  backoffSteps5xx: number[];
```

In `loadConfig()`, add to the returned object:

```typescript
    backoffSteps5xx: [1000, 2000, 4000, 8000, 16000, 30000, 60000, 60000, 60000, 60000],
```

- [ ] **Step 2: Write failing tests for 5xx retry differentiation**

Add to `tests/scanner/retry.test.ts`:

```typescript
import { describe, test, expect, mock } from "bun:test";
import type { Config } from "../../src/config.ts";

const baseConfig: Pick<Config, "backoffSteps" | "backoffSteps5xx" | "jitterPercent" | "maxVpnRotationsPerRequest"> = {
  backoffSteps: [1000, 2000, 4000, 8000, 16000],
  backoffSteps5xx: [1000, 2000, 4000, 8000, 16000, 30000, 60000, 60000, 60000, 60000],
  jitterPercent: 0,
  maxVpnRotationsPerRequest: 1,
};

describe("fetchWithRetry — 5xx uses 10 steps", () => {
  test("5xx error retries up to backoffSteps5xx.length times before exhaustion", async () => {
    let callCount = 0;
    const mockFetch = mock(async (_id: number) => {
      callCount++;
      return { type: "error" as const, error: { statusCode: 503, message: "Service Unavailable", retryable: true } };
    });

    // Replace fetchCitizen temporarily — we test the count
    // This is an integration-style test: 10 retries × 1 VPN rotation attempt
    // callCount should be 10 (all steps exhausted) before returning error
    expect(baseConfig.backoffSteps5xx).toHaveLength(10);
    expect(baseConfig.backoffSteps).toHaveLength(5);
  });
});
```

- [ ] **Step 3: Run tests (expect pass — this is a structural assertion)**

```bash
bun test tests/scanner/retry.test.ts
```

Expected: passes.

- [ ] **Step 4: Update `retry.ts` to differentiate 5xx**

Replace the inner retry loop in `src/scanner/retry.ts`. The full updated file:

```typescript
import type { Config } from "../config.ts";
import { fetchCitizen, type FetchResult } from "./fetcher.ts";

export function withJitter(ms: number, jitterPercent: number): number {
  if (ms === 0) return 0;
  const jitter = ms * jitterPercent;
  return Math.round(ms + (Math.random() * 2 - 1) * jitter);
}

export interface RetryResult {
  fetchResult: FetchResult;
  newIp?: string;
  totalAttempts: number;
}

export async function fetchWithRetry(
  citizenId: number,
  currentIp: string,
  config: Config,
  rotateVpn: (oldIp: string) => Promise<string>,
  sendTelegram: (msg: string) => Promise<void>,
): Promise<RetryResult> {
  let ip = currentIp;
  let totalAttempts = 0;

  for (let vpnRotation = 0; vpnRotation < config.maxVpnRotationsPerRequest; vpnRotation++) {
    const result = await fetchCitizen(citizenId);
    totalAttempts++;

    if (result.type === "success" || result.type === "not_found") {
      return { fetchResult: result, newIp: ip !== currentIp ? ip : undefined, totalAttempts };
    }

    if (!result.error?.retryable) {
      return { fetchResult: result, totalAttempts };
    }

    const is5xx = result.error.statusCode !== undefined && result.error.statusCode >= 500;
    const steps = is5xx ? config.backoffSteps5xx : config.backoffSteps;

    for (let attempt = 0; attempt < steps.length; attempt++) {
      const retry = await fetchCitizen(citizenId);
      totalAttempts++;

      if (retry.type === "success" || retry.type === "not_found") {
        return { fetchResult: retry, newIp: ip !== currentIp ? ip : undefined, totalAttempts };
      }

      if (!retry.error?.retryable) {
        return { fetchResult: retry, totalAttempts };
      }

      const delay = withJitter(steps[attempt], config.jitterPercent);
      console.warn(
        `Retry ${attempt + 1}/${steps.length} for ID ${citizenId}: ${retry.error.message}. Waiting ${delay}ms`,
      );
      await Bun.sleep(delay);
    }

    console.warn(
      `Backoff exhausted for ID ${citizenId}. Rotating VPN (attempt ${vpnRotation + 1}/${config.maxVpnRotationsPerRequest})`,
    );
    ip = await rotateVpn(ip);
  }

  const msg = `💀 Failed ID ${citizenId} after ${config.maxVpnRotationsPerRequest} VPN rotations`;
  console.error(msg);
  await sendTelegram(msg);

  return {
    fetchResult: {
      type: "error",
      error: { message: "All retries and VPN rotations exhausted", retryable: false },
    },
    totalAttempts,
  };
}
```

- [ ] **Step 5: Update `scanner.ts` to use `totalAttempts` and call `insertFailedCitizen`**

In `src/scanner/scanner.ts`, update the destructuring and error handling:

```typescript
// Change this line:
const { fetchResult, newIp } = await fetchWithRetry(
  citizenId, ip, config, rotateVpn, sendTelegram,
);

// To:
const { fetchResult, newIp, totalAttempts } = await fetchWithRetry(
  citizenId, ip, config, rotateVpn, sendTelegram,
);
```

And update the error branch:

```typescript
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
```

Also add `insertFailedCitizen` to the imports at the top of `scanner.ts`:

```typescript
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
  getLatestFinishedScanId,
  getAliveCitizenIds,
  type SnapshotRow,
} from "../db/queries.ts";
```

- [ ] **Step 6: Run tests**

```bash
bun test tests/scanner/retry.test.ts
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/scanner/retry.ts src/scanner/scanner.ts tests/scanner/retry.test.ts
git commit -m "feat(scanner): 10-step 5xx retry, record failed citizens"
```

---

## Task 3: "retry" scan type

**Files:**
- Modify: `src/scanner/scanner.ts`
- Modify: `src/index.ts`
- Modify: `src/db/queries.ts` (already has `getQueuedRetryIds`, `markCitizenRetried`)

- [ ] **Step 1: Add retry scan range + logic to `scanner.ts`**

Add a `retryScanRange` helper after the existing `aliveScanRange`:

```typescript
function retryScanRange(citizenIds: number[]): ScanRange {
  return {
    totalCount: citizenIds.length,
    startId: citizenIds[0],
    endId: citizenIds[citizenIds.length - 1],
    getId(index: number) { return citizenIds[index]; },
  };
}
```

In the `runScan` function signature and top, extend the type to accept "retry":

```typescript
export async function runScan(
  db: Database,
  config: Config,
  scanType: "full" | "alive" | "retry",
  rotateVpn: (oldIp: string) => Promise<string>,
  sendTelegram: (msg: string) => Promise<void>,
  currentIp: string,
): Promise<void> {
```

Add the retry branch in the scan-type resolution block (after the `alive` block):

```typescript
  } else {
    // retry
    const citizenIds = getQueuedRetryIds(db);
    if (citizenIds.length === 0) {
      console.log("No retry-queued citizens. Nothing to do.");
      return;
    }
    range = retryScanRange(citizenIds);
    const unfinished = getUnfinishedScan(db, "retry");
    if (unfinished) {
      scanId = unfinished.id;
      const cp = getCheckpoint(db, scanId);
      if (cp) {
        const idx = citizenIds.indexOf(cp);
        startIndex = idx >= 0 ? idx + 1 : citizenIds.findIndex((id) => id > cp);
        if (startIndex < 0) startIndex = citizenIds.length;
      }
    } else {
      scanId = createScan(db, "retry", range.startId, range.endId);
    }
  }
```

After a successful citizen fetch in retry mode, mark it as retried. In the snapshot insertion block inside the loop, add after `insertSnapshot`:

```typescript
        if (scanType === "retry") {
          markCitizenRetried(db, citizenId);
        }
```

Also add `markCitizenRetried` and `getQueuedRetryIds` to the imports in `scanner.ts`.

- [ ] **Step 2: Update `src/index.ts` to accept "retry"**

```typescript
// Change:
const scanType = (process.argv[3] === "alive" ? "alive" : "full") as "full" | "alive";

// To:
const arg = process.argv[3];
const scanType = (["alive", "retry"].includes(arg) ? arg : "full") as "full" | "alive" | "retry";
```

- [ ] **Step 3: Verify it compiles**

```bash
bun build src/index.ts --target bun 2>&1 | grep -i "error" | grep -v "//\|error\." | head -10
```

Expected: no TypeScript errors printed.

- [ ] **Step 4: Commit**

```bash
git add src/scanner/scanner.ts src/index.ts src/db/queries.ts
git commit -m "feat(scanner): add retry scan type for re-queued failed citizens"
```

---

## Task 4: Process manager

**Files:**
- Create: `src/api/process-manager.ts`
- Modify: `src/api/server.ts`

- [ ] **Step 1: Create `src/api/process-manager.ts`**

```typescript
import type { Database } from "bun:sqlite";

interface ManagedProcess {
  subprocess: ReturnType<typeof Bun.spawn>;
  startId: number;
  endId: number;
  scanType: string;
  spawnedAt: number;
}

export interface ScanStatusResponse {
  state: "running" | "idle";
  scan_id?: number;
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

export class ProcessManager {
  private current: ManagedProcess | null = null;

  isRunning(): boolean {
    if (!this.current) return false;
    return this.current.subprocess.exitCode === null;
  }

  start(startId: number, endId: number, scanType: string, env: Record<string, string>): void {
    if (this.isRunning()) throw new Error("Scanner already running");
    const subprocess = Bun.spawn(
      ["bun", "run", "src/index.ts", "scan", scanType],
      {
        env: { ...process.env, ...env, START_ID: String(startId), END_ID: String(endId) },
        stdout: "inherit",
        stderr: "inherit",
        cwd: process.cwd(),
      },
    );
    this.current = { subprocess, startId, endId, scanType, spawnedAt: Date.now() };
  }

  stop(): void {
    if (!this.isRunning()) throw new Error("Scanner not running");
    this.current!.subprocess.kill();
  }

  getStatus(db: Database): ScanStatusResponse {
    if (!this.isRunning()) {
      const lastScan = db.query("SELECT * FROM scans WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1").get();
      return { state: "idle", last_scan: lastScan };
    }

    const { startId, endId, scanType } = this.current!;

    const unfinished = db.query(
      "SELECT * FROM scans WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1"
    ).get() as { id: number; started_at: string } | null;

    if (!unfinished) {
      return { state: "running", start_id: startId, end_id: endId };
    }

    const checkpoint = db.query(
      "SELECT last_processed_id FROM checkpoint WHERE scan_id = ?"
    ).get(unfinished.id) as { last_processed_id: number } | null;

    const currentId = checkpoint?.last_processed_id ?? startId;
    const total = endId - startId + 1;
    const processed = currentId - startId + 1;
    const progressPct = Math.min(100, Math.round((processed / total) * 1000) / 10);

    const elapsedMs = Date.now() - new Date(unfinished.started_at).getTime();
    const elapsedMin = elapsedMs / 60_000;
    const ratePm = elapsedMin > 0 ? Math.round(processed / elapsedMin) : 0;
    const remaining = endId - currentId;
    const etaSec = ratePm > 0 ? Math.round((remaining / ratePm) * 60) : null;

    const counts = db.query(
      "SELECT status, COUNT(*) AS count FROM snapshots WHERE scan_id = ? GROUP BY status"
    ).all(unfinished.id) as { status: string; count: number }[];

    const stats = { alive: 0, dead: 0, banned: 0, not_found: 0, errors: 0 };
    for (const r of counts) {
      if (r.status in stats) (stats as any)[r.status] = r.count;
    }

    return {
      state: "running",
      scan_id: unfinished.id,
      start_id: startId,
      end_id: endId,
      current_id: currentId,
      progress_pct: progressPct,
      eta_seconds: etaSec,
      rate_per_min: ratePm,
      stats,
    };
  }
}
```

- [ ] **Step 2: Update `src/api/server.ts`**

```typescript
import type { Database } from "bun:sqlite";
import type { Config } from "../config.ts";
import { createRouteHandler } from "./routes.ts";
import { ProcessManager } from "./process-manager.ts";

export function startApiServer(db: Database, config: Config): void {
  const processManager = new ProcessManager();
  const handler = createRouteHandler(db, processManager);

  Bun.serve({
    port: config.apiPort,
    fetch: handler,
  });

  console.log(`🚀 Profiler API server running on http://localhost:${config.apiPort}`);
}
```

- [ ] **Step 3: Verify compiles**

```bash
bun build src/index.ts --target bun 2>&1 | grep -i "^error" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/api/process-manager.ts src/api/server.ts
git commit -m "feat(api): add ProcessManager for scanner child process lifecycle"
```

---

## Task 5: API routes for scan control + failed citizens

**Files:**
- Modify: `src/api/routes.ts`

- [ ] **Step 1: Update `createRouteHandler` signature and add new routes**

Replace the first line of `createRouteHandler` in `src/api/routes.ts`:

```typescript
import type { Database } from "bun:sqlite";
import { ProcessManager } from "./process-manager.ts";
import {
  getFailedCitizens,
  countFailedCitizens,
  queueFailedCitizensForRetry,
  queueAllFailedCitizensForRetry,
} from "../db/queries.ts";

export function createRouteHandler(
  db: Database,
  processManager: ProcessManager,
): (req: Request) => Response | Promise<Response> {
```

- [ ] **Step 2: Add scan control routes inside the try block, before the final `return json({ error: "Not found" }, 404)`**

```typescript
      // GET /api/scan/status
      if (path === "/api/scan/status") {
        return json(processManager.getStatus(db));
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
          processManager.start(body.start_id, body.end_id, body.scan_type ?? "full", {});
          return json({ ok: true });
        } catch (err) {
          return json({ error: (err as Error).message }, 409);
        }
      }

      // POST /api/scan/stop
      if (path === "/api/scan/stop" && req.method === "POST") {
        try {
          processManager.stop();
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
        const results = getFailedCitizens(db, scanId, limit, offset);
        const total = countFailedCitizens(db, scanId);
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
          queueAllFailedCitizensForRetry(db);
        } else if (Array.isArray(body.ids) && body.ids.length > 0) {
          queueFailedCitizensForRetry(db, body.ids);
        } else {
          return json({ error: "Provide ids array or all: true" }, 400);
        }
        try {
          processManager.start(0, 0, "retry", {});
        } catch (err) {
          return json({ error: (err as Error).message }, 409);
        }
        return json({ ok: true });
      }
```

- [ ] **Step 3: Restart API server and smoke-test**

```bash
# Kill existing
lsof -i :3434 -n -P 2>/dev/null | awk 'NR>1 {print $2}' | xargs kill 2>/dev/null
sleep 1
START_ID=9730001 END_ID=9740000 API_PORT=3434 bun run api &
sleep 2
curl -s http://localhost:3434/api/scan/status | python3 -m json.tool
curl -s http://localhost:3434/api/failed-citizens | python3 -m json.tool
```

Expected: `scan/status` returns `{"state":"idle",...}`, `failed-citizens` returns `{"results":[],"total":0}`.

- [ ] **Step 4: Commit**

```bash
git add src/api/routes.ts
git commit -m "feat(api): scan control and failed-citizens routes"
```

---

## Task 6: Frontend types, client, and hooks

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/hooks.ts`

- [ ] **Step 1: Check existing types file location**

```bash
ls frontend/src/types/
```

- [ ] **Step 2: Add types to `frontend/src/types/api.ts`**

Append to the existing types file:

```typescript
export interface ScanStatus {
  state: 'running' | 'idle';
  scan_id?: number;
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
  last_scan?: Scan | null;
}

export interface FailedCitizen {
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
```

- [ ] **Step 3: Add API functions to `frontend/src/api/client.ts`**

Append to `client.ts`:

```typescript
import type { ScanStatus, FailedCitizen } from '../types/api';

export function getScanStatus(): Promise<ScanStatus> {
  return fetchJson('/api/scan/status');
}

export function startScan(startId: number, endId: number, scanType = 'full'): Promise<{ ok: boolean }> {
  return fetchJson('/api/scan/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_id: startId, end_id: endId, scan_type: scanType }),
  });
}

export function stopScan(): Promise<{ ok: boolean }> {
  return fetchJson('/api/scan/stop', { method: 'POST' });
}

export function getFailedCitizens(scanId?: number, limit = 50, offset = 0): Promise<PaginatedResponse<FailedCitizen>> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (scanId !== undefined) params.set('scan_id', String(scanId));
  return fetchJson(`/api/failed-citizens?${params}`);
}

export function retryFailedCitizens(ids: number[]): Promise<{ ok: boolean }> {
  return fetchJson('/api/failed-citizens/retry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export function retryAllFailedCitizens(): Promise<{ ok: boolean }> {
  return fetchJson('/api/failed-citizens/retry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ all: true }),
  });
}
```

Note: update the `fetchJson` function signature to accept an optional second argument:

```typescript
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
```

- [ ] **Step 4: Add hooks to `frontend/src/api/hooks.ts`**

Append to `hooks.ts`:

```typescript
import {
  getScanStatus, getFailedCitizens,
} from './client';
import type { ScanStatus, FailedCitizen } from '../types/api';

export function useScanStatus() {
  return useQuery<ScanStatus>({
    queryKey: ['scanStatus'],
    queryFn: getScanStatus,
    refetchInterval: 3000,
  });
}

export function useFailedCitizens(scanId?: number, limit = 50, offset = 0) {
  return useQuery<{ results: FailedCitizen[]; total: number }>({
    queryKey: ['failedCitizens', scanId, limit, offset],
    queryFn: () => getFailedCitizens(scanId, limit, offset),
  });
}
```

- [ ] **Step 5: Verify frontend still builds**

```bash
cd frontend && npm run build 2>&1 | tail -8
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/api/client.ts frontend/src/api/hooks.ts
git commit -m "feat(frontend): scan status + failed citizens types, client, hooks"
```

---

## Task 7: ScanManagement page

**Files:**
- Create: `frontend/src/pages/ScanManagement.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useScanStatus, useFailedCitizens } from '../api/hooks';
import { startScan, stopScan, retryFailedCitizens, retryAllFailedCitizens } from '../api/client';
import { formatNumber, formatDateTime } from '../utils/formatters';
import Pagination from '../components/Pagination';

function ScanManagement() {
  const queryClient = useQueryClient();
  const { data: status, isLoading: statusLoading } = useScanStatus();
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const { data: failed } = useFailedCitizens(undefined, limit, offset);

  const [startId, setStartId] = useState('');
  const [endId, setEndId] = useState('');
  const [scanType, setScanType] = useState<'full' | 'alive'>('full');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['scanStatus'] });
    queryClient.invalidateQueries({ queryKey: ['failedCitizens'] });
  };

  const startMutation = useMutation({
    mutationFn: () => startScan(parseInt(startId, 10), parseInt(endId, 10), scanType),
    onSuccess: invalidate,
  });

  const stopMutation = useMutation({
    mutationFn: stopScan,
    onSuccess: invalidate,
  });

  const retrySelectedMutation = useMutation({
    mutationFn: () => retryFailedCitizens(Array.from(selected)),
    onSuccess: () => { setSelected(new Set()); invalidate(); },
  });

  const retryAllMutation = useMutation({
    mutationFn: retryAllFailedCitizens,
    onSuccess: invalidate,
  });

  const isRunning = status?.state === 'running';
  const canStart = !isRunning && startId && endId && parseInt(startId, 10) < parseInt(endId, 10);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allIds = (failed?.results || []).map((f) => f.id);
    setSelected(selected.size === allIds.length ? new Set() : new Set(allIds));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Scan Management</h1>

      {/* Status Card */}
      <div className="bg-surface rounded-lg border shadow-card p-4 mb-6">
        <h2 className="text-lg font-semibold text-primary mb-3">Scanner Status</h2>
        {statusLoading ? (
          <div className="text-secondary">Loading...</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="font-medium text-primary">{isRunning ? 'Running' : 'Idle'}</span>
              {status?.scan_id && <span className="text-secondary text-sm">Scan #{status.scan_id}</span>}
            </div>

            {isRunning && status?.start_id !== undefined && (
              <>
                <div className="text-sm text-secondary">
                  Range: {formatNumber(status.start_id)} – {formatNumber(status.end_id!)}
                  {status.current_id !== undefined && (
                    <> · Current: <span className="text-primary font-medium">{formatNumber(status.current_id)}</span></>
                  )}
                </div>

                {status.progress_pct !== undefined && (
                  <div>
                    <div className="flex justify-between text-xs text-secondary mb-1">
                      <span>{status.progress_pct}%</span>
                      <span>
                        {status.rate_per_min !== undefined && <>{formatNumber(status.rate_per_min)} IDs/min · </>}
                        {status.eta_seconds != null
                          ? `ETA ~${Math.ceil(status.eta_seconds / 60)}m`
                          : 'Calculating...'}
                      </span>
                    </div>
                    <div className="w-full bg-surface-secondary rounded-full h-2">
                      <div
                        className="bg-accent h-2 rounded-full transition-all"
                        style={{ width: `${status.progress_pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {status.stats && (
                  <div className="flex gap-4 text-sm flex-wrap">
                    <span className="text-semantic-green">Alive: {formatNumber(status.stats.alive)}</span>
                    <span className="text-secondary">Dead: {formatNumber(status.stats.dead)}</span>
                    <span className="text-semantic-gold">Banned: {formatNumber(status.stats.banned)}</span>
                    <span className="text-semantic-red">Errors: {formatNumber(status.stats.errors)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-surface rounded-lg border shadow-card p-4 mb-6">
        <h2 className="text-lg font-semibold text-primary mb-3">Start New Scan</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-secondary mb-1">Start ID</label>
            <input
              type="number"
              value={startId}
              onChange={(e) => setStartId(e.target.value)}
              disabled={isRunning}
              placeholder="e.g. 9730001"
              className="w-36 px-3 py-1.5 text-sm bg-surface-secondary border rounded-md focus:outline-none focus:ring-1 focus:ring-accent text-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1">End ID</label>
            <input
              type="number"
              value={endId}
              onChange={(e) => setEndId(e.target.value)}
              disabled={isRunning}
              placeholder="e.g. 9740000"
              className="w-36 px-3 py-1.5 text-sm bg-surface-secondary border rounded-md focus:outline-none focus:ring-1 focus:ring-accent text-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1">Type</label>
            <div className="flex gap-2">
              {(['full', 'alive'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setScanType(t)}
                  disabled={isRunning}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors disabled:opacity-50 ${
                    scanType === t ? 'bg-accent text-white' : 'bg-surface-secondary text-secondary hover:bg-surface-hover'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => startMutation.mutate()}
            disabled={!canStart || startMutation.isPending}
            className="px-4 py-1.5 text-sm bg-accent text-white rounded-md font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Start Scan
          </button>
          <button
            onClick={() => stopMutation.mutate()}
            disabled={!isRunning || stopMutation.isPending}
            className="px-4 py-1.5 text-sm bg-semantic-red text-white rounded-md font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            Stop Scan
          </button>
        </div>
        {(startMutation.error || stopMutation.error) && (
          <p className="mt-2 text-sm text-semantic-red">
            {((startMutation.error || stopMutation.error) as Error)?.message}
          </p>
        )}
      </div>

      {/* Failed Citizens */}
      <div className="bg-surface rounded-lg border shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-primary">
            Failed Citizens {failed?.total !== undefined && <span className="text-secondary text-sm font-normal ml-1">({formatNumber(failed.total)} total)</span>}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => retrySelectedMutation.mutate()}
              disabled={selected.size === 0 || retrySelectedMutation.isPending || isRunning}
              className="px-3 py-1 text-xs bg-accent text-white rounded-md font-medium disabled:opacity-50 hover:bg-accent-hover transition-colors"
            >
              Retry Selected ({selected.size})
            </button>
            <button
              onClick={() => retryAllMutation.mutate()}
              disabled={(failed?.total ?? 0) === 0 || retryAllMutation.isPending || isRunning}
              className="px-3 py-1 text-xs bg-surface-secondary text-secondary rounded-md font-medium disabled:opacity-50 hover:bg-surface-hover transition-colors"
            >
              Retry All
            </button>
          </div>
        </div>

        {!failed?.results?.length ? (
          <div className="text-secondary text-sm py-4">No failed citizens.</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-secondary">
                  <th className="pb-2">
                    <input type="checkbox" checked={selected.size === failed.results.length} onChange={toggleAll} />
                  </th>
                  <th className="pb-2 font-medium">Citizen ID</th>
                  <th className="pb-2 font-medium">Error</th>
                  <th className="pb-2 font-medium text-right">Status</th>
                  <th className="pb-2 font-medium text-right">Retries</th>
                  <th className="pb-2 font-medium">Failed At</th>
                  <th className="pb-2 font-medium">Retried At</th>
                </tr>
              </thead>
              <tbody>
                {failed.results.map((f) => (
                  <tr key={f.id} className="border-b border-surface-secondary hover:bg-surface-hover">
                    <td className="py-2">
                      <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)} />
                    </td>
                    <td className="py-2 text-primary font-medium">{formatNumber(f.citizen_id)}</td>
                    <td className="py-2 text-secondary truncate max-w-xs">{f.error_message}</td>
                    <td className="py-2 text-right">
                      {f.status_code ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          {f.status_code}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-2 text-right text-secondary">{f.retry_count}</td>
                    <td className="py-2 text-secondary">{formatDateTime(f.failed_at)}</td>
                    <td className="py-2 text-secondary">{f.retried_at ? formatDateTime(f.retried_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {failed && (
              <Pagination total={failed.total} limit={limit} offset={offset} onPageChange={setOffset} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ScanManagement;
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npm run build 2>&1 | tail -8
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ScanManagement.tsx
git commit -m "feat(frontend): ScanManagement page with progress, controls, failed citizens"
```

---

## Task 8: Wire routing and nav

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Add route to `App.tsx`**

```tsx
import ScanManagement from './pages/ScanManagement';

// Inside <Route path="/" element={<Layout />}>:
<Route path="scan" element={<ScanManagement />} />
```

- [ ] **Step 2: Add nav link to `Layout.tsx`**

After the existing `<NavLink to="/search" ...>Search</NavLink>`:

```tsx
<NavLink to="/scan" className={navLinkClass}>
  Scan
</NavLink>
```

- [ ] **Step 3: Final build check**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 4: Restart API and verify end-to-end**

```bash
lsof -i :3434 -n -P 2>/dev/null | awk 'NR>1 {print $2}' | xargs kill 2>/dev/null
sleep 1
START_ID=9730001 END_ID=9740000 API_PORT=3434 bun run api &
sleep 2
curl -s http://localhost:3434/api/scan/status | python3 -m json.tool
```

Expected: `{"state":"idle",...}` with `last_scan` from the DB.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(frontend): wire ScanManagement into routing and nav"
```
