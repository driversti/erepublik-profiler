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
