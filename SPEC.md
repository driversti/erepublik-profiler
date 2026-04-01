# Profiler — Specification

## Overview

**Profiler** is a TypeScript/Bun application that scans all eRepublik citizen IDs, collects player profile data, and stores snapshots to a SQLite database. It tracks player progression over time and serves a web dashboard with player, country, and global statistics.

## Goals

1. **Discover all player accounts** by scanning the full ID range (configurable, up to ~10M)
2. **Store curated profile data** as typed columns — no raw JSON storage
3. **Take full snapshots** of every account on each scan, enabling time-series analysis
4. **Track alive accounts daily** to monitor progression (level, rank, strength, etc.)
5. **Serve a web dashboard** with player profiles, country analytics, and global stats

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Language | TypeScript |
| Database | SQLite (via `bun:sqlite`) |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| HTTP client | `got-scraping` (browser-like TLS fingerprint rotation) |
| VPN | Gluetun + Surfshark WireGuard (Docker) |
| Deployment | Docker (multi-arch), deployment target TBD |
| Notifications | Telegram Bot API |

## Architecture

```
profiler/
├── src/
│   ├── scanner/         # Crawling logic, rate limiting, VPN rotation
│   ├── db/              # SQLite schema, migrations, queries
│   ├── api/             # REST API for the dashboard
│   └── telegram/        # Notification sender
├── frontend/            # React dashboard (separate Vite project)
├── data/                # SQLite DB file, checkpoint (Docker volume)
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Data Source

### API Endpoint

```
GET https://www.erepublik.com/en/main/citizen-profile-json-global/{citizenId}
```

- **Authentication**: Not required (public endpoint)
- **Header**: `X-Requested-With: XMLHttpRequest`
- **Response**: ~50KB JSON per citizen
- **Rate limiting**: eRepublik blocks IPs after heavy scraping; VPN rotation required
- **404**: Returned for non-existent citizen IDs (gaps in ID sequence)

---

## Database Schema

### Storage Engine

SQLite with WAL mode for concurrent read/write support.

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

### Tables

#### `scans`

Tracks each scan cycle.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment scan ID |
| `started_at` | TEXT (ISO8601) | When the scan started |
| `finished_at` | TEXT (ISO8601) | When the scan finished (null if in progress) |
| `scan_type` | TEXT | `'full'`, `'alive'`, `'dead'` |
| `start_id` | INTEGER | First citizen ID in range |
| `end_id` | INTEGER | Last citizen ID in range |
| `total_scanned` | INTEGER | Number of IDs processed |
| `total_found` | INTEGER | Number of accounts found (non-404) |

#### `snapshots`

One row per citizen per scan. This is the primary data table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment row ID |
| `scan_id` | INTEGER NOT NULL | FK → `scans.id` |
| `citizen_id` | INTEGER NOT NULL | eRepublik citizen ID |
| `scanned_at` | TEXT (ISO8601) | Timestamp of this snapshot |
| **Status** | | |
| `status` | TEXT NOT NULL | `'alive'`, `'dead'`, `'banned'`, `'not_found'` |
| `is_organization` | INTEGER | 0 or 1 (null if not_found) |
| **Identity** | | |
| `name` | TEXT | Display name |
| `level` | INTEGER | Experience level |
| `xp` | INTEGER | Total experience points |
| `created_at` | TEXT | Account creation date (YYYY-MM-DD) |
| `avatar_url` | TEXT | Full CDN URL to avatar |
| `ban_type` | TEXT | Ban type (null if not banned) |
| `ban_reason` | TEXT | Ban reason (null if not banned) |
| **Location** | | |
| `citizenship_country_id` | INTEGER | Citizenship country ID |
| `citizenship_country_name` | TEXT | Citizenship country name |
| `residence_country_id` | INTEGER | Residence country ID |
| `residence_country_name` | TEXT | Residence country name |
| `residence_region_id` | INTEGER | Residence region ID |
| `residence_region_name` | TEXT | Residence region name |
| `residence_city_id` | INTEGER | Residence city ID |
| `residence_city_name` | TEXT | Residence city name |
| **Politics** | | |
| `party_id` | INTEGER | Political party ID (null if none) |
| `party_name` | TEXT | Political party name |
| `military_unit_id` | INTEGER | Military unit ID (null if none) |
| `military_unit_name` | TEXT | Military unit name |
| `is_president` | INTEGER | 0 or 1 |
| `is_congressman` | INTEGER | 0 or 1 |
| `is_dictator` | INTEGER | 0 or 1 |
| `is_party_president` | INTEGER | 0 or 1 |
| **Military — Ground** | | |
| `strength` | REAL | Battle strength |
| `division` | INTEGER | Division number (1–4) |
| `ground_rank_name` | TEXT | Ground rank name |
| `ground_rank_number` | INTEGER | Ground rank numeric ID (1–89+) |
| `ground_rank_points` | REAL | Ground combat points |
| **Military — Air** | | |
| `air_rank_name` | TEXT | Aviation rank name |
| `air_rank_number` | INTEGER | Aviation rank numeric ID |
| `air_rank_points` | REAL | Aviation combat points |
| `air_perception` | REAL | Aviation perception/coordination |
| **Military — Best Damage** | | |
| `best_damage` | REAL | Highest single-battle damage |
| `best_damage_battle_id` | INTEGER | Battle ID of best damage |
| **Social** | | |
| `friend_count` | INTEGER | Number of friends |
| `newspaper_id` | INTEGER | Newspaper ID (null if none) |
| `newspaper_name` | TEXT | Newspaper name |
| **PvP** | | |
| `pvp_matches_played` | INTEGER | Total PvP matches |
| `pvp_matches_won` | INTEGER | PvP wins |
| `pvp_matches_lost` | INTEGER | PvP losses |

**Indexes:**

```sql
CREATE INDEX idx_snapshots_citizen_id ON snapshots(citizen_id);
CREATE INDEX idx_snapshots_scan_id ON snapshots(scan_id);
CREATE INDEX idx_snapshots_citizen_scan ON snapshots(citizen_id, scan_id);
CREATE INDEX idx_snapshots_status ON snapshots(status);
CREATE INDEX idx_snapshots_citizenship ON snapshots(citizenship_country_id);
```

#### `achievements`

Normalized medal/achievement counts per citizen per scan.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment |
| `scan_id` | INTEGER NOT NULL | FK → `scans.id` |
| `citizen_id` | INTEGER NOT NULL | eRepublik citizen ID |
| `medal_type` | TEXT NOT NULL | Medal identifier (e.g., `'battle_hero'`, `'super_soldier'`) |
| `count` | INTEGER NOT NULL | Number of times earned |

**Indexes:**

```sql
CREATE INDEX idx_achievements_citizen ON achievements(citizen_id, scan_id);
CREATE INDEX idx_achievements_medal ON achievements(medal_type);
```

#### `checkpoint`

Tracks scan progress for resumption.

| Column | Type | Description |
|--------|------|-------------|
| `scan_id` | INTEGER PRIMARY KEY | FK → `scans.id` |
| `last_processed_id` | INTEGER NOT NULL | Last citizen ID processed |
| `updated_at` | TEXT (ISO8601) | When checkpoint was last updated |

---

## Scan Strategy

### Account Statuses

| API Response | Stored Status | Description |
|---|---|---|
| 200 + `is_alive: true` | `alive` | Active player account |
| 200 + `is_alive: false` | `dead` | Inactive/fallen account |
| 200 + `banStatus` present | `banned` | Banned account |
| 404 | `not_found` | ID does not exist |

**Note:** Organization accounts (`is_organization: true`) are **skipped entirely** — not stored. The existing org-crawler handles those.

### Initial Full Scan

1. Scan the entire configurable ID range (e.g., 1 → 13,000,000)
2. For each ID:
   - Fetch profile from API
   - If 404 → insert snapshot with `status = 'not_found'`, all other fields null
   - If organization → skip (do not store)
   - Otherwise → extract curated fields, insert snapshot + achievements
3. Checkpoint saved every N IDs (configurable, default: 100)
4. On restart: resume from checkpoint
5. Estimated duration: ~12 days at 10ms base delay (current max known ID: 9,743,537)

### Daily Alive Scan

1. Query the latest scan's snapshots for all `citizen_id` where `status = 'alive'`
2. Re-scan only those IDs (~20–30K accounts)
3. Store new snapshot rows with a new `scan_id`
4. Estimated duration: ~50 minutes at 10ms delay

### Dead Account Re-scan

- **Strategy: TBD** — deferred until after the initial scan reveals the actual count of dead vs alive accounts
- The system should support configurable scan types: `full`, `alive`, `dead`
- Dead re-scan frequency will be decided based on data (weekly, monthly, quarterly, or never)

---

## Anti-Detection & Resilience

### VPN (Gluetun)

Reuses the proven org-crawler pattern:

- Docker container routes all traffic through Gluetun (Surfshark WireGuard)
- VPN rotation via Gluetun HTTP API (`localhost:8000`)
- IP leak check on startup (reject if IP matches home country)

### Rate Limiting

- Configurable base delay between requests (default: 100ms)
- Jitter: ±30% random variance on base delay

### Error Handling & Retry

| Error | Action |
|-------|--------|
| 404 | Store as `not_found`, continue |
| 403 / 429 | Exponential backoff (1s → 2s → 4s → 8s → 16s) with ±30% jitter |
| 5xx | Same backoff as 403/429 |
| Cloudflare challenge | Treat as retryable → backoff → VPN rotation |
| Network timeout | Treat as retryable |
| After 5 retries | Trigger VPN rotation, reset backoff |
| After 3 VPN rotations | Log to failed list, send Telegram alert, skip ID |

### Request Configuration

- HTTP client: `got-scraping` — provides automatic TLS fingerprint rotation and browser-like header ordering to evade anti-bot detection
- Timeout: 15 seconds per API request
- Header: `X-Requested-With: XMLHttpRequest`

---

## Telegram Notifications

Same pattern as org-crawler. Configurable via env vars (BOT_TOKEN, CHAT_ID, TOPIC_ID). Failures are logged but never thrown.

### Events

| Event | Message |
|-------|---------|
| Scan started | `🚀 Profiler scan started. Type: {type}. Range: {start}–{end}. IP: {ip}` |
| Progress | `📊 Progress: {current}/{end} ({pct}%) · Alive: {n} · Dead: {n} · 404: {n} · Speed: {ids/min}/min` (every 10,000 IDs) |
| VPN rotated | `🔄 VPN rotated: {old} → {new}` |
| VPN failure | `⚠️ VPN reconnect failed. Sleeping 5min.` |
| Scan complete | `✅ Scan complete. Type: {type}. Alive: {n}. Dead: {n}. Duration: {time}` |
| Graceful shutdown | `🛑 Profiler stopped at ID {id}` |
| IP leak | `🚨 IP LEAK detected. Exiting.` |
| Fatal error | `💀 Fatal error: {msg}` |

---

## REST API

Backend serves both the dashboard frontend and exposes data for potential future consumers.

### Endpoints

#### Global Stats

```
GET /api/stats
```

Returns: total accounts (alive, dead, banned, not_found), last scan info, new accounts trend.

#### Player Profile

```
GET /api/citizens/:id
```

Returns: latest snapshot for a citizen.

```
GET /api/citizens/:id/history
```

Returns: all snapshots for a citizen, ordered by `scanned_at`. Enables progression charts.

```
GET /api/citizens/:id/achievements
```

Returns: latest achievement counts for a citizen.

#### Search

```
GET /api/citizens/search?name=:query
```

Returns: citizens matching name (from latest scan). Paginated.

#### Country Analytics

```
GET /api/countries/:id
```

Returns: country stats from latest scan — active player count, avg level, avg strength, top players.

```
GET /api/countries/:id/citizens
```

Returns: all alive citizens for a country (latest scan). Paginated, sortable by level/strength/rank.

```
GET /api/countries
```

Returns: list of all countries with alive citizen counts.

#### Scan Management

```
GET /api/scans
```

Returns: list of all scan cycles with metadata.

```
GET /api/scans/:id
```

Returns: scan details and summary stats.

---

## Dashboard (Frontend)

React 18 + TypeScript + Vite + Tailwind CSS. Mirrors the battle-stats frontend architecture.

### Pages

1. **Home / Global Dashboard**
   - Total alive/dead/banned counts
   - New accounts trend (line chart)
   - Most active countries (bar chart)
   - Last scan summary

2. **Country View** (`/countries/:id`)
   - Active player count + trend
   - Top players by level, strength, ground rank, air rank
   - New citizens / citizens who left (diff between scans)
   - Population distribution by division

3. **Player Profile** (`/citizens/:id`)
   - Current profile data
   - Progression charts: level over time, strength over time, rank over time
   - Country/party/MU change history (derived from snapshot diffs)
   - Achievement/medal counts

4. **Search** (`/search`)
   - Search citizens by name
   - Results with basic info (level, country, status)

---

## Configuration

All configuration via environment variables.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `START_ID` | Yes | — | First citizen ID to scan |
| `END_ID` | Yes | — | Last citizen ID to scan |
| `BASE_DELAY_MS` | No | `10` | Delay between requests (ms) |
| `CHECKPOINT_INTERVAL` | No | `100` | Save checkpoint every N IDs |
| `DB_PATH` | No | `./data/profiler.db` | SQLite database file path |
| `API_PORT` | No | `3000` | REST API server port |
| `BOT_TOKEN` | No | — | Telegram bot token |
| `CHAT_ID` | No | — | Telegram chat ID |
| `TOPIC_ID` | No | — | Telegram topic/thread ID |
| `HOME_COUNTRY` | No | `PL` | Country code for IP leak detection |

---

## Docker Deployment

```yaml
services:
  profiler:
    image: registry.yurii.live/profiler:latest
    network_mode: "service:gluetun"
    volumes:
      - ./data:/app/data
    depends_on:
      gluetun:
        condition: service_healthy
    restart: unless-stopped
    environment:
      - START_ID=1
      - END_ID=10000000
      - BASE_DELAY_MS=10
      - BOT_TOKEN=${BOT_TOKEN}
      - CHAT_ID=${CHAT_ID}
      - TOPIC_ID=${TOPIC_ID}

  gluetun:
    image: qmcgaw/gluetun
    cap_add:
      - NET_ADMIN
    environment:
      - VPN_SERVICE_PROVIDER=surfshark
      - VPN_TYPE=wireguard
      - WIREGUARD_PRIVATE_KEY=${WIREGUARD_PRIVATE_KEY}
      - WIREGUARD_ADDRESSES=${WIREGUARD_ADDRESSES}
      - SERVER_COUNTRIES=${SERVER_COUNTRIES}
    ports:
      - "3000:3000"  # Profiler API (exposed through Gluetun)
      - "8000:8000"  # Gluetun control API
    healthcheck:
      test: wget -q -O- http://www.google.com || exit 1
      interval: 30s
      timeout: 10s
      retries: 3
    volumes:
      - ./gluetun:/gluetun
```

### Build & Release

```bash
# Multi-arch build + push
./release.sh
# → registry.yurii.live/profiler:latest (linux/amd64 + linux/arm64)
```

---

## Scan Scheduling

**Deferred** — to be designed after the initial full scan is complete and data patterns are understood. Options include:

- Built-in scheduler (node-cron / Bun equivalent)
- External cron + one-shot CLI command
- Long-running process with API-triggered scans

The initial implementation will support manual scan triggers via CLI arguments or API endpoint.

---

## Design Decisions & Tradeoffs

| Decision | Rationale |
|----------|-----------|
| **SQLite over PostgreSQL** | Single-writer workload (crawler). Portable file. No server infrastructure. Can migrate to PostgreSQL later if needed. |
| **bun:sqlite** | Zero dependencies, fastest SQLite driver for Bun. Accepted lock-in to Bun runtime. |
| **Curated columns, no raw JSON** | Clean schema, strong typing, fast queries. Tradeoff: new API fields require code change + migration. Accepted. |
| **Full snapshots** | Enables time-series queries without complex changelog logic. At ~30K alive accounts, storage is manageable (~11GB/year). |
| **Query-time diffs** | No diff-on-insert or changelog table. Diffs computed by comparing two snapshot rows. Simpler writes. |
| **Skip organizations** | Org-crawler already handles those. Avoids mixing player and org data. |
| **Separate achievements table** | Normalized storage for 15-20 medal types. Enables queries like "all citizens with 5+ BH medals" without JSON parsing. |
| **scan_id grouping** | Each scan cycle gets a unique ID. Makes it easy to query "show me the March 15 scan" or diff between specific scans. |
| **Gluetun VPN reuse** | Proven pattern from org-crawler. Same Docker + Surfshark WireGuard setup. |
| **Store not_found IDs** | Records "we checked, nobody home" so future scans can skip known-404 IDs without re-checking. |
| **Monorepo placement** | Consistent with existing project structure. Lives at `erepublik/profiler/`. |

---

## Open Questions (Post-Initial Scan)

1. **Dead account re-scan frequency** — depends on how many dead accounts exist
2. **Scan scheduling mechanism** — depends on operational experience
3. **Dashboard deployment** — same server as crawler or separate? Through VPN or direct?
4. **Data sync to battle-stats** — if/when to integrate profiler data into battle-stats' PostgreSQL
5. **Max ID auto-detection** — could binary-search for the current max citizen ID instead of hardcoding END_ID (most recent known ID as of 2026-04-01: 9,743,537)
