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

    const { startId, endId } = this.current!;

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
