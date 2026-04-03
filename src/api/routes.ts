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
          SELECT s.citizenship_country_name,
                 COUNT(*) AS alive_count, AVG(s.level) AS avg_level, AVG(s.strength) AS avg_strength
          FROM snapshots s ${LATEST}
          WHERE s.citizenship_country_id = $1 AND s.status = 'alive'
          GROUP BY s.citizenship_country_name
        `, [countryId]);

        if (!stats || Number(stats.alive_count) === 0) {
          return json({ error: "Country not found" }, 404);
        }

        return json({
          citizenship_country_id: countryId,
          citizenship_country_name: stats.citizenship_country_name,
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

        // Auto-create a retry scan so the worker picks it up
        try {
          await processManager.start(0, 0, "retry");
        } catch {
          // scan already active — retry will happen after current scan finishes
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
