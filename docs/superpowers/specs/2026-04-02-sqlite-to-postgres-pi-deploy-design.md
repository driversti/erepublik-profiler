# SQLite to PostgreSQL Migration + Raspberry Pi Deployment

## Goal

Replace SQLite with PostgreSQL to support multi-process writes (scanner + web in separate containers, future multiple scanners). Deploy to Raspberry Pi 4 (ARM64) at `192.168.10.11` for always-on scanning.

## Non-Goals

- Migrating existing scanned data (fresh start)
- Multiple parallel scanners (future work)
- Changing the frontend

## Architecture

```
Raspberry Pi (192.168.10.11:~/Projects/profiler)
├── docker-compose.yml
├── .env
├── pgdata/              # PostgreSQL data volume (bind mount)
└── gluetun/             # VPN config

Containers:
  postgres        ← PostgreSQL 17, stores all data
  gluetun         ← Surfshark VPN, ports 3000 + 8000
  profiler-web    ← API + frontend (network: gluetun)
  profiler-scanner← Scan worker (network: gluetun)
```

Both `profiler-web` and `profiler-scanner` connect to `postgres:5432` via Docker internal network. They share the Gluetun network for outbound VPN traffic.

## Database Changes

### New dependency

Replace `bun:sqlite` with `postgres` (postgres.js) — zero-dependency, fast PostgreSQL client for Node/Bun.

### Schema translation

| SQLite | PostgreSQL |
|--------|------------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `TEXT` (dates) | `TIMESTAMPTZ` |
| `INTEGER` (booleans) | `BOOLEAN` |
| `REAL` | `DOUBLE PRECISION` |
| `ON CONFLICT(scan_id) DO UPDATE` | `ON CONFLICT (scan_id) DO UPDATE` (same syntax) |

### New table: `scan_progress`

```sql
CREATE TABLE IF NOT EXISTS scan_progress (
  scan_id       INT PRIMARY KEY REFERENCES scans(id),
  current_id    INT NOT NULL,
  alive         INT NOT NULL DEFAULT 0,
  dead          INT NOT NULL DEFAULT 0,
  banned        INT NOT NULL DEFAULT 0,
  not_found     INT NOT NULL DEFAULT 0,
  errors        INT NOT NULL DEFAULT 0,
  skipped       INT NOT NULL DEFAULT 0,
  rate_per_min  INT,
  updated_at    TIMESTAMPTZ NOT NULL
);
```

The scanner upserts this row at every checkpoint interval. The web reads it for `/api/scan/status`.

### Query layer changes

All functions in `queries.ts` become `async` and accept `postgres.Sql` instead of `bun:sqlite.Database`.

SQLite binding style (`$param`, `.run()`, `.get()`, `.all()`) → postgres.js tagged templates:
```ts
// Before (SQLite)
db.query("SELECT * FROM scans WHERE id = ?").get(scanId)

// After (PostgreSQL)  
const [row] = await sql`SELECT * FROM scans WHERE id = ${scanId}`
```

Manual `BEGIN`/`COMMIT` in scanner → postgres.js transactions:
```ts
await sql.begin(async (tx) => {
  // batch inserts using tx instead of sql
});
```

### `scans` table: new `status` column

Add a `status` column to the existing `scans` table to coordinate between web and scanner:

```sql
ALTER TABLE scans ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
-- Values: 'pending', 'running', 'cancelling', 'completed', 'cancelled', 'failed'
```

This replaces the old convention of checking `finished_at IS NULL` to determine if a scan is active.

## Scanner as a Polling Worker (`src/scanner/scanner.ts` + `src/index.ts`)

The scanner container starts with `docker compose up` and stays running as a **long-lived worker daemon**. It does not auto-start a scan.

**Lifecycle:**
1. Scanner starts, connects to DB, verifies VPN
2. Enters a poll loop: every 5 seconds, queries for `scans WHERE status = 'pending' ORDER BY id LIMIT 1`
3. When a pending scan is found:
   - Sets `status = 'running'`
   - Executes the scan (same logic as before, but async with postgres.js)
   - During scan loop, periodically checks if `status` changed to `'cancelling'` (every checkpoint interval)
   - On completion: sets `status = 'completed'` and `finished_at`
   - On cancellation: sets `status = 'cancelled'` and `finished_at`
   - On fatal error: sets `status = 'failed'` and `finished_at`
4. Returns to poll loop

**Changes:**
1. All DB calls become `await`-ed
2. Replace manual `db.run("BEGIN")`/`db.run("COMMIT")` with postgres.js `sql.begin()`
3. At each checkpoint interval, upsert `scan_progress` with current stats and speed
4. At each checkpoint interval, check scan `status` for cancellation request
5. Batch inserts within transaction for performance
6. `src/index.ts` scan command: instead of running a single scan and exiting, enters the poll loop

**`START_ID` and `END_ID` env vars are no longer needed** — the web UI provides them when creating a scan request.

## Web/API Changes

### `src/api/process-manager.ts`

Simplify to a pure DB reader/writer. Remove subprocess spawning logic entirely.

- `start(startId, endId, scanType)`: inserts a new row into `scans` with `status = 'pending'`. The scanner worker picks it up.
- `stop(scanId)`: sets `status = 'cancelling'` on the active scan. The scanner checks this flag and stops gracefully.
- `getStatus()`: reads from `scans` + `scan_progress` + `checkpoint` tables. A scan is considered "running" if `status = 'running'` and `scan_progress.updated_at` is within the last 2 minutes (heartbeat check — if stale, the scanner likely crashed).

### `src/api/routes.ts`

All query functions become `async`. Accept `postgres.Sql` instead of `Database`. Same API endpoints, same response shapes.

### `src/api/server.ts`

Accept `postgres.Sql`, pass to route handler and process manager.

## Config Changes (`src/config.ts`)

Replace `dbPath` with `databaseUrl`:
```ts
databaseUrl: process.env.DATABASE_URL || "postgres://profiler:profiler@localhost:5432/profiler"
```

Remove `DB_PATH` references.

## Docker Compose

```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: profiler-postgres
    restart: unless-stopped
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
    depends_on:
      postgres:
        condition: service_healthy
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
      - HTTP_CONTROL_SERVER_AUTH_CONFIG_FILEPATH=/gluetun/auth/config.toml
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

**Note:** `profiler-web` and `profiler-scanner` use `network_mode: "service:gluetun"`, so they can reach `postgres` via Docker's internal DNS only if postgres is on the default network. Since gluetun isolates networking, we need postgres accessible. Solution: postgres runs on the default bridge network and gluetun adds an `extra_hosts` or we use `container_name` with Docker links. Alternative: put postgres on a shared internal network and attach gluetun to it as well.

**Revised networking:** Add a shared network for DB access:
```yaml
networks:
  db:
    driver: bridge

services:
  postgres:
    networks: [db]

  gluetun:
    networks: [db]
    # gluetun joins db network so containers using its network stack can reach postgres
```

## Build & Deploy

1. Build multi-arch image: `docker buildx build --platform linux/arm64 -t registry.yurii.live/profiler:latest --push .`
2. Create `~/Projects/profiler` on Pi
3. Copy `docker-compose.yml`, `.env`, `gluetun/` config to Pi
4. `ssh driversti@192.168.10.11 "cd ~/Projects/profiler && docker compose up -d"`

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Add `postgres` dependency |
| `src/db/database.ts` | Full rewrite: postgres.js connection + schema creation |
| `src/db/queries.ts` | Full rewrite: async functions, postgres.js tagged templates |
| `src/scanner/scanner.ts` | Async DB calls, write scan_progress, postgres transactions |
| `src/api/routes.ts` | Async queries with postgres.js |
| `src/api/process-manager.ts` | Simplify to DB-based status reader |
| `src/api/server.ts` | Pass sql instead of db |
| `src/config.ts` | Replace dbPath with databaseUrl |
| `src/index.ts` | Use postgres.js connection, pass sql object |
| `docker-compose.yml` | Add postgres service, shared network, update env vars |
