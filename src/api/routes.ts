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
