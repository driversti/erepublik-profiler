# Profiler

eRepublik citizen profile scanner and analytics dashboard. Scans all ~10M citizen IDs, stores profile snapshots, and serves a web dashboard with player, country, and global statistics.

## Features

- Full-range citizen ID scanning with checkpoint-based resume
- Profile snapshots with time-series tracking (level, rank, strength, achievements)
- VPN rotation via Gluetun to avoid IP bans
- REST API with search, country analytics, and player history
- React dashboard with player profiles, country breakdowns, and scan management
- Telegram notifications for scan progress and alerts

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript |
| Database | PostgreSQL 17 |
| Frontend | React 18 + Vite + Tailwind CSS |
| HTTP Client | [got-scraping](https://github.com/apify/got-scraping) (TLS fingerprint rotation) |
| VPN | [Gluetun](https://github.com/qdm12/gluetun) + Surfshark WireGuard |
| Deployment | Docker (multi-arch: amd64 + arm64) |

## Quick Start

```bash
bun install                    # install dependencies
bun run scan                   # start the scanner
bun run web                    # start the web server (API + dashboard)
bun run dev                    # dev mode with watch
bun test                       # run tests
```

## Docker Deployment

```bash
cp .env.example .env           # configure environment variables
docker compose up -d           # start all services
```

Services:
- **profiler-scanner** — crawls citizen profiles through VPN
- **profiler-web** — serves the API and dashboard (port 3000)
- **gluetun** — VPN gateway with WireGuard
- **postgres** — PostgreSQL 17 database

## Architecture

```
src/
├── scanner/         # Crawl logic, fetcher, parser, retry, rate limiting
├── db/              # PostgreSQL schema, migrations, queries
├── api/             # REST API server + scan process management
├── vpn/             # Gluetun VPN rotation
└── telegram/        # Notification sender
frontend/            # React 18 + TypeScript + Vite + Tailwind CSS
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/stats` | Global statistics (alive, dead, banned counts) |
| `GET /api/citizens/:id` | Player profile (latest snapshot) |
| `GET /api/citizens/:id/history` | Player snapshot history |
| `GET /api/citizens/:id/achievements` | Player achievements |
| `GET /api/citizens/search?name=:query` | Search citizens by name |
| `GET /api/countries` | All countries with citizen counts |
| `GET /api/countries/:id` | Country analytics |
| `GET /api/countries/:id/citizens` | Country citizen list (paginated, sortable) |
| `GET /api/scans` | Scan history |
| `POST /api/scans` | Start/stop scans |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `BASE_DELAY_MS` | `10` | Delay between requests (ms) |
| `CHECKPOINT_INTERVAL` | `100` | Save progress every N IDs |
| `API_PORT` | `3000` | Web server port |
| `BOT_TOKEN` | — | Telegram bot token |
| `CHAT_ID` | — | Telegram chat ID |
| `TOPIC_ID` | — | Telegram topic/thread ID |
| `HOME_COUNTRY` | `PL` | Country code for IP leak detection |
| `GLUETUN_API_URL` | — | Gluetun control API URL |

## License

Private project. Not for redistribution.
