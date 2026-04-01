# Profiler Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React dashboard for the profiler app — 4 pages showing global stats, country analytics, player profiles with progression charts, and citizen search.

**Architecture:** React 18 + TypeScript SPA with Vite, Tailwind CSS, TanStack React Query for data fetching, React Router v6 for navigation, Recharts for charts. Mirrors battle-stats frontend patterns: CSS variable theming, useQuery hooks, Layout wrapper with nested routes.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS 3, TanStack React Query 5, React Router 6, Recharts

---

## File Structure

```
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── src/
│   ├── main.tsx                # App entry with providers
│   ├── App.tsx                 # Router + routes
│   ├── index.css               # Tailwind + CSS variables (light/dark)
│   ├── types/
│   │   └── api.ts              # TypeScript types for API responses
│   ├── api/
│   │   ├── client.ts           # Fetch wrappers for each endpoint
│   │   └── hooks.ts            # TanStack Query hooks
│   ├── context/
│   │   └── ThemeContext.tsx     # Dark/light mode toggle
│   ├── components/
│   │   ├── Layout.tsx          # Nav + footer + Outlet
│   │   ├── StatCard.tsx        # Reusable stat display card
│   │   └── Pagination.tsx      # Page controls
│   ├── pages/
│   │   ├── Dashboard.tsx       # Global stats + charts
│   │   ├── CountriesList.tsx   # Countries with alive counts
│   │   ├── CountryDetail.tsx   # Country stats + top players
│   │   ├── CitizenProfile.tsx  # Player profile + history charts
│   │   └── Search.tsx          # Search by name
│   └── utils/
│       └── formatters.ts       # Number/date formatting helpers
```

---

### Task 1: Frontend Scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/index.css`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "profiler-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.60.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "recharts": "^2.15.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.3",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: 'var(--color-surface)',
          secondary: 'var(--color-surface-secondary)',
          hover: 'var(--color-surface-hover)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
        },
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        tertiary: 'var(--color-text-tertiary)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          light: 'var(--color-accent-light)',
        },
        semantic: {
          gold: 'var(--color-gold)',
          green: 'var(--color-green)',
          red: 'var(--color-red)',
        },
      },
      backgroundColor: {
        page: 'var(--color-page)',
        nav: 'var(--color-nav-bg)',
      },
      borderColor: {
        nav: 'var(--color-nav-border)',
        DEFAULT: 'var(--color-border)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 6: Create postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 7: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0070F3" />
    <title>Profiler — eRepublik Player Analytics</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --color-page: #FAFAFA;
    --color-surface: #FFFFFF;
    --color-surface-secondary: #F5F5F5;
    --color-surface-hover: #F0F0F0;
    --color-nav-bg: #FFFFFF;
    --color-nav-border: #EAEAEA;
    --color-border: #EAEAEA;
    --color-border-strong: #D4D4D4;
    --color-text-primary: #171717;
    --color-text-secondary: #666666;
    --color-text-tertiary: #999999;
    --color-accent: #0070F3;
    --color-accent-hover: #005BC4;
    --color-accent-light: #EBF5FF;
    --color-gold: #CA8A04;
    --color-green: #16A34A;
    --color-red: #DC2626;
    --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04);
  }

  .dark {
    --color-page: #0A0A0A;
    --color-surface: #1A1A1A;
    --color-surface-secondary: #141414;
    --color-surface-hover: #222222;
    --color-nav-bg: rgba(26, 26, 26, 0.8);
    --color-nav-border: #2E2E2E;
    --color-border: #2E2E2E;
    --color-border-strong: #404040;
    --color-text-primary: #EDEDED;
    --color-text-secondary: #A1A1A1;
    --color-text-tertiary: #707070;
    --color-accent: #3291FF;
    --color-accent-hover: #5BA4FF;
    --color-accent-light: #0D2847;
    --color-gold: #EAB308;
    --color-green: #22C55E;
    --color-red: #EF4444;
    --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.2), 0 1px 2px -1px rgb(0 0 0 / 0.2);
  }
}

body {
  background-color: var(--color-page);
  color: var(--color-text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 9: Create placeholder src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 10: Create placeholder src/App.tsx**

```tsx
function App() {
  return <div className="p-8 text-primary">Profiler frontend</div>;
}

export default App;
```

- [ ] **Step 11: Install dependencies and verify**

```bash
cd frontend && npm install
npm run dev
```

Visit http://localhost:5173 — should show "Profiler frontend" with correct styling.

- [ ] **Step 12: Commit**

```bash
cd /Users/driversti/Projects/erepublik/profiler
git add frontend/
git commit -m "feat(profiler): frontend scaffold with React + Vite + Tailwind"
```

---

### Task 2: Types + API Client + Hooks

**Files:**
- Create: `frontend/src/types/api.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/hooks.ts`
- Create: `frontend/src/utils/formatters.ts`

- [ ] **Step 1: Create TypeScript types**

Create `frontend/src/types/api.ts`:
```typescript
export interface Scan {
  id: number;
  started_at: string;
  finished_at: string | null;
  scan_type: string;
  start_id: number;
  end_id: number;
  total_scanned: number;
  total_found: number;
}

export interface Snapshot {
  id: number;
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

export interface SnapshotWithScanType extends Snapshot {
  scan_type: string;
}

export interface Achievement {
  medal_type: string;
  count: number;
}

export interface GlobalStats {
  total_alive: number;
  total_dead: number;
  total_banned: number;
  total_not_found: number;
  last_scan: Scan | null;
}

export interface CountrySummary {
  citizenship_country_id: number;
  citizenship_country_name: string;
  alive_count: number;
}

export interface CountryStats {
  citizenship_country_id: number;
  alive_count: number;
  avg_level: number;
  avg_strength: number;
}

export interface SearchResult {
  citizen_id: number;
  name: string;
  level: number;
  status: string;
  citizenship_country_name: string;
}

export interface PaginatedResponse<T> {
  results: T[];
  total: number;
}
```

- [ ] **Step 2: Create API client functions**

Create `frontend/src/api/client.ts`:
```typescript
import type {
  GlobalStats,
  Snapshot,
  SnapshotWithScanType,
  Achievement,
  CountrySummary,
  CountryStats,
  SearchResult,
  PaginatedResponse,
  Scan,
} from '../types/api';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export function getStats(): Promise<GlobalStats> {
  return fetchJson('/api/stats');
}

export function getCitizen(id: number): Promise<Snapshot> {
  return fetchJson(`/api/citizens/${id}`);
}

export function getCitizenHistory(id: number): Promise<SnapshotWithScanType[]> {
  return fetchJson(`/api/citizens/${id}/history`);
}

export function getCitizenAchievements(id: number): Promise<Achievement[]> {
  return fetchJson(`/api/citizens/${id}/achievements`);
}

export function searchCitizens(name: string, limit = 50, offset = 0): Promise<PaginatedResponse<SearchResult>> {
  return fetchJson(`/api/citizens/search?name=${encodeURIComponent(name)}&limit=${limit}&offset=${offset}`);
}

export function getCountries(): Promise<CountrySummary[]> {
  return fetchJson('/api/countries');
}

export function getCountryStats(id: number): Promise<CountryStats> {
  return fetchJson(`/api/countries/${id}`);
}

export function getCountryCitizens(
  id: number,
  sort = 'level',
  limit = 50,
  offset = 0,
): Promise<PaginatedResponse<Snapshot>> {
  return fetchJson(`/api/countries/${id}/citizens?sort=${sort}&limit=${limit}&offset=${offset}`);
}

export function getScans(): Promise<Scan[]> {
  return fetchJson('/api/scans');
}
```

- [ ] **Step 3: Create TanStack Query hooks**

Create `frontend/src/api/hooks.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import {
  getStats,
  getCitizen,
  getCitizenHistory,
  getCitizenAchievements,
  searchCitizens,
  getCountries,
  getCountryStats,
  getCountryCitizens,
  getScans,
} from './client';

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  });
}

export function useCitizen(id: number) {
  return useQuery({
    queryKey: ['citizen', id],
    queryFn: () => getCitizen(id),
    enabled: !!id,
  });
}

export function useCitizenHistory(id: number) {
  return useQuery({
    queryKey: ['citizenHistory', id],
    queryFn: () => getCitizenHistory(id),
    enabled: !!id,
  });
}

export function useCitizenAchievements(id: number) {
  return useQuery({
    queryKey: ['citizenAchievements', id],
    queryFn: () => getCitizenAchievements(id),
    enabled: !!id,
  });
}

export function useSearchCitizens(name: string, limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['searchCitizens', name, limit, offset],
    queryFn: () => searchCitizens(name, limit, offset),
    enabled: name.length >= 2,
  });
}

export function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: getCountries,
  });
}

export function useCountryStats(id: number) {
  return useQuery({
    queryKey: ['countryStats', id],
    queryFn: () => getCountryStats(id),
    enabled: !!id,
  });
}

export function useCountryCitizens(id: number, sort = 'level', limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['countryCitizens', id, sort, limit, offset],
    queryFn: () => getCountryCitizens(id, sort, limit, offset),
    enabled: !!id,
  });
}

export function useScans() {
  return useQuery({
    queryKey: ['scans'],
    queryFn: getScans,
  });
}
```

- [ ] **Step 4: Create formatting utilities**

Create `frontend/src/utils/formatters.ts`:
```typescript
export function formatNumber(n: number | null): string {
  if (n === null) return '—';
  return n.toLocaleString('en-US');
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCompact(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/driversti/Projects/erepublik/profiler
git add frontend/src/types/ frontend/src/api/ frontend/src/utils/
git commit -m "feat(profiler): API types, client, hooks, and formatters"
```

---

### Task 3: Theme Context + Layout + Shared Components

**Files:**
- Create: `frontend/src/context/ThemeContext.tsx`
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/StatCard.tsx`
- Create: `frontend/src/components/Pagination.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Create ThemeContext**

Create `frontend/src/context/ThemeContext.tsx`:
```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('profiler-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('profiler-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 2: Create Layout component**

Create `frontend/src/components/Layout.tsx`:
```tsx
import { NavLink, Outlet, useNavigate, useState } from 'react-router-dom';
import { useState as useStateReact } from 'react';
import { useTheme } from '../context/ThemeContext';

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'text-accent bg-accent-light'
      : 'text-secondary hover:text-primary hover:bg-surface-hover'
  }`;

function Layout() {
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useStateReact('');
  const navigate = (window as any).__navigate;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) {
      window.location.href = `/search?name=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  return (
    <div className="min-h-screen bg-page">
      <nav className="sticky top-0 z-50 bg-nav border-b border-nav backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-1">
              <NavLink to="/" className="text-lg font-bold text-primary mr-4">
                Profiler
              </NavLink>
              <NavLink to="/" className={navLinkClass} end>
                Dashboard
              </NavLink>
              <NavLink to="/countries" className={navLinkClass}>
                Countries
              </NavLink>
              <NavLink to="/search" className={navLinkClass}>
                Search
              </NavLink>
            </div>

            <div className="flex items-center gap-2">
              <form onSubmit={handleSearch} className="hidden sm:flex items-center">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search player..."
                    className="w-48 pl-8 pr-3 py-1.5 text-sm bg-surface-secondary border border rounded-md focus:outline-none focus:ring-1 focus:ring-accent text-primary placeholder:text-tertiary"
                  />
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 text-tertiary">
                    <SearchIcon />
                  </div>
                </div>
              </form>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-secondary hover:text-primary hover:bg-surface-hover transition-colors"
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? <MoonIcon /> : <SunIcon />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      <footer className="border-t border mt-8 py-6 text-center text-sm text-tertiary">
        Profiler — eRepublik Player Analytics
      </footer>
    </div>
  );
}

export default Layout;
```

- [ ] **Step 3: Create StatCard component**

Create `frontend/src/components/StatCard.tsx`:
```tsx
interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}

function StatCard({ label, value, subtitle, color }: StatCardProps) {
  return (
    <div className="bg-surface rounded-lg border shadow-card p-4">
      <div className="text-sm text-secondary mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color || 'text-primary'}`}>{value}</div>
      {subtitle && <div className="text-xs text-tertiary mt-1">{subtitle}</div>}
    </div>
  );
}

export default StatCard;
```

- [ ] **Step 4: Create Pagination component**

Create `frontend/src/components/Pagination.tsx`:
```tsx
interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
}

function Pagination({ total, limit, offset, onPageChange }: PaginationProps) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <div className="text-secondary">
        Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          disabled={currentPage === 1}
          className="px-3 py-1 rounded border bg-surface text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="px-3 py-1 text-secondary">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(offset + limit)}
          disabled={currentPage === totalPages}
          className="px-3 py-1 rounded border bg-surface text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default Pagination;
```

- [ ] **Step 5: Update main.tsx with providers**

Replace `frontend/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 6: Verify layout renders**

Update `frontend/src/App.tsx` temporarily to use Layout:
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div className="text-primary">Dashboard coming soon</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

Run: `cd frontend && npm run dev`
Verify: Nav bar renders with Profiler logo, Dashboard/Countries/Search links, dark mode toggle, search input.

- [ ] **Step 7: Commit**

```bash
cd /Users/driversti/Projects/erepublik/profiler
git add frontend/src/
git commit -m "feat(profiler): theme context, layout, stat card, pagination components"
```

---

### Task 4: Dashboard Page

**Files:**
- Create: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create Dashboard page**

Create `frontend/src/pages/Dashboard.tsx`:
```tsx
import { useStats, useCountries, useScans } from '../api/hooks';
import { formatNumber, formatDateTime } from '../utils/formatters';
import StatCard from '../components/StatCard';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const STATUS_COLORS = ['#16A34A', '#DC2626', '#CA8A04', '#999999'];

function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: countries, isLoading: countriesLoading } = useCountries();
  const { data: scans } = useScans();

  if (statsLoading) {
    return <div className="text-secondary">Loading...</div>;
  }

  if (!stats) {
    return <div className="text-secondary">No scan data available. Run a scan first.</div>;
  }

  const statusData = [
    { name: 'Alive', value: stats.total_alive },
    { name: 'Dead', value: stats.total_dead },
    { name: 'Banned', value: stats.total_banned },
    { name: 'Not Found', value: stats.total_not_found },
  ].filter((d) => d.value > 0);

  const topCountries = (countries || []).slice(0, 15);

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Alive Players" value={formatNumber(stats.total_alive)} color="text-semantic-green" />
        <StatCard label="Dead Accounts" value={formatNumber(stats.total_dead)} color="text-semantic-red" />
        <StatCard label="Banned" value={formatNumber(stats.total_banned)} color="text-semantic-gold" />
        <StatCard
          label="Last Scan"
          value={stats.last_scan?.scan_type || '—'}
          subtitle={formatDateTime(stats.last_scan?.finished_at || stats.last_scan?.started_at || null)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {statusData.length > 0 && (
          <div className="bg-surface rounded-lg border shadow-card p-4">
            <h2 className="text-lg font-semibold text-primary mb-4">Account Status Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatNumber(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {!countriesLoading && topCountries.length > 0 && (
          <div className="bg-surface rounded-lg border shadow-card p-4">
            <h2 className="text-lg font-semibold text-primary mb-4">Top Countries by Active Players</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topCountries} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <YAxis type="category" dataKey="citizenship_country_name" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} width={75} />
                <Tooltip formatter={(value: number) => formatNumber(value)} />
                <Bar dataKey="alive_count" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {scans && scans.length > 0 && (
        <div className="mt-8 bg-surface rounded-lg border shadow-card p-4">
          <h2 className="text-lg font-semibold text-primary mb-4">Recent Scans</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-secondary">
                <th className="pb-2 font-medium">ID</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Started</th>
                <th className="pb-2 font-medium">Finished</th>
                <th className="pb-2 font-medium text-right">Scanned</th>
                <th className="pb-2 font-medium text-right">Found</th>
              </tr>
            </thead>
            <tbody>
              {scans.slice(0, 10).map((scan) => (
                <tr key={scan.id} className="border-b border-surface-secondary">
                  <td className="py-2 text-primary">{scan.id}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${scan.scan_type === 'full' ? 'bg-accent-light text-accent' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {scan.scan_type}
                    </span>
                  </td>
                  <td className="py-2 text-secondary">{formatDateTime(scan.started_at)}</td>
                  <td className="py-2 text-secondary">{formatDateTime(scan.finished_at)}</td>
                  <td className="py-2 text-primary text-right">{formatNumber(scan.total_scanned)}</td>
                  <td className="py-2 text-primary text-right">{formatNumber(scan.total_found)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
```

- [ ] **Step 2: Update App.tsx with routing**

Replace `frontend/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="*" element={<div className="text-secondary">Page not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run dev`
Visit http://localhost:5173 — Dashboard should render with stat cards. If the profiler API is running on port 3000, it will show real data; otherwise it shows loading/error state.

- [ ] **Step 4: Commit**

```bash
cd /Users/driversti/Projects/erepublik/profiler
git add frontend/src/pages/Dashboard.tsx frontend/src/App.tsx
git commit -m "feat(profiler): dashboard page with stats, charts, scan history"
```

---

### Task 5: Countries List + Country Detail Pages

**Files:**
- Create: `frontend/src/pages/CountriesList.tsx`
- Create: `frontend/src/pages/CountryDetail.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create CountriesList page**

Create `frontend/src/pages/CountriesList.tsx`:
```tsx
import { Link } from 'react-router-dom';
import { useCountries } from '../api/hooks';
import { formatNumber } from '../utils/formatters';

function CountriesList() {
  const { data: countries, isLoading } = useCountries();

  if (isLoading) return <div className="text-secondary">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Countries</h1>
      <div className="bg-surface rounded-lg border shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-secondary bg-surface-secondary">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Country</th>
              <th className="px-4 py-3 font-medium text-right">Active Players</th>
            </tr>
          </thead>
          <tbody>
            {(countries || []).map((country, i) => (
              <tr key={country.citizenship_country_id} className="border-b border-surface-secondary hover:bg-surface-hover transition-colors">
                <td className="px-4 py-3 text-tertiary">{i + 1}</td>
                <td className="px-4 py-3">
                  <Link
                    to={`/countries/${country.citizenship_country_id}`}
                    className="text-accent hover:text-accent-hover font-medium"
                  >
                    {country.citizenship_country_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right text-primary font-medium">
                  {formatNumber(country.alive_count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CountriesList;
```

- [ ] **Step 2: Create CountryDetail page**

Create `frontend/src/pages/CountryDetail.tsx`:
```tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCountryStats, useCountryCitizens } from '../api/hooks';
import { formatNumber } from '../utils/formatters';
import StatCard from '../components/StatCard';
import Pagination from '../components/Pagination';

type SortField = 'level' | 'strength' | 'ground_rank_points' | 'air_rank_points';

function CountryDetail() {
  const { id } = useParams<{ id: string }>();
  const countryId = parseInt(id || '0', 10);
  const [sort, setSort] = useState<SortField>('level');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data: stats, isLoading: statsLoading } = useCountryStats(countryId);
  const { data: citizens, isLoading: citizensLoading } = useCountryCitizens(countryId, sort, limit, offset);

  if (statsLoading) return <div className="text-secondary">Loading...</div>;
  if (!stats) return <div className="text-secondary">Country not found</div>;

  const sortOptions: { value: SortField; label: string }[] = [
    { value: 'level', label: 'Level' },
    { value: 'strength', label: 'Strength' },
    { value: 'ground_rank_points', label: 'Ground Rank' },
    { value: 'air_rank_points', label: 'Air Rank' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Country #{countryId}</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Active Players" value={formatNumber(stats.alive_count)} color="text-semantic-green" />
        <StatCard label="Avg Level" value={formatNumber(stats.avg_level)} />
        <StatCard label="Avg Strength" value={formatNumber(stats.avg_strength)} />
      </div>

      <div className="bg-surface rounded-lg border shadow-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary">Citizens</h2>
          <div className="flex gap-1">
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setSort(opt.value); setOffset(0); }}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  sort === opt.value
                    ? 'bg-accent text-white'
                    : 'bg-surface-secondary text-secondary hover:bg-surface-hover'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {citizensLoading ? (
          <div className="text-secondary py-4">Loading...</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-secondary">
                  <th className="pb-2 font-medium">Player</th>
                  <th className="pb-2 font-medium text-right">Level</th>
                  <th className="pb-2 font-medium text-right">Strength</th>
                  <th className="pb-2 font-medium text-right">Ground Rank</th>
                  <th className="pb-2 font-medium text-right">Air Rank</th>
                </tr>
              </thead>
              <tbody>
                {(citizens?.results || []).map((c) => (
                  <tr key={c.citizen_id} className="border-b border-surface-secondary hover:bg-surface-hover">
                    <td className="py-2">
                      <Link to={`/citizens/${c.citizen_id}`} className="text-accent hover:text-accent-hover font-medium">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2 text-right text-primary">{c.level}</td>
                    <td className="py-2 text-right text-primary">{formatNumber(c.strength)}</td>
                    <td className="py-2 text-right text-secondary">{c.ground_rank_name}</td>
                    <td className="py-2 text-right text-secondary">{c.air_rank_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {citizens && (
              <Pagination total={citizens.total} limit={limit} offset={offset} onPageChange={setOffset} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default CountryDetail;
```

- [ ] **Step 3: Add routes to App.tsx**

Add imports and routes for CountriesList and CountryDetail:
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CountriesList from './pages/CountriesList';
import CountryDetail from './pages/CountryDetail';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="countries" element={<CountriesList />} />
          <Route path="countries/:id" element={<CountryDetail />} />
          <Route path="*" element={<div className="text-secondary">Page not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 4: Commit**

```bash
cd /Users/driversti/Projects/erepublik/profiler
git add frontend/src/pages/CountriesList.tsx frontend/src/pages/CountryDetail.tsx frontend/src/App.tsx
git commit -m "feat(profiler): countries list and country detail pages"
```

---

### Task 6: Search Page

**Files:**
- Create: `frontend/src/pages/Search.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create Search page**

Create `frontend/src/pages/Search.tsx`:
```tsx
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSearchCitizens } from '../api/hooks';
import Pagination from '../components/Pagination';

function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('name') || '');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const searchTerm = searchParams.get('name') || '';
  const { data, isLoading } = useSearchCitizens(searchTerm, limit, offset);

  useEffect(() => {
    setOffset(0);
  }, [searchTerm]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      setSearchParams({ name: query.trim() });
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Search Citizens</h1>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter player name (min 2 characters)..."
            className="flex-1 px-4 py-2 bg-surface border rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
            autoFocus
          />
          <button
            type="submit"
            disabled={query.trim().length < 2}
            className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Search
          </button>
        </div>
      </form>

      {isLoading && <div className="text-secondary">Searching...</div>}

      {data && searchTerm && (
        <>
          <div className="text-sm text-secondary mb-4">
            {data.total} result{data.total !== 1 ? 's' : ''} for "{searchTerm}"
          </div>

          {data.results.length > 0 ? (
            <div className="bg-surface rounded-lg border shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-secondary bg-surface-secondary">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium text-right">Level</th>
                    <th className="px-4 py-3 font-medium">Country</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((citizen) => (
                    <tr key={citizen.citizen_id} className="border-b border-surface-secondary hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/citizens/${citizen.citizen_id}`} className="text-accent hover:text-accent-hover font-medium">
                          {citizen.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-primary">{citizen.level}</td>
                      <td className="px-4 py-3 text-secondary">{citizen.citizenship_country_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          citizen.status === 'alive'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : citizen.status === 'banned'
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {citizen.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2">
                <Pagination total={data.total} limit={limit} offset={offset} onPageChange={setOffset} />
              </div>
            </div>
          ) : (
            <div className="text-secondary">No citizens found matching "{searchTerm}"</div>
          )}
        </>
      )}
    </div>
  );
}

export default Search;
```

- [ ] **Step 2: Add search route to App.tsx**

Add import `Search` and route `<Route path="search" element={<Search />} />` after the countries routes.

- [ ] **Step 3: Commit**

```bash
cd /Users/driversti/Projects/erepublik/profiler
git add frontend/src/pages/Search.tsx frontend/src/App.tsx
git commit -m "feat(profiler): search page with name-based citizen search"
```

---

### Task 7: Citizen Profile Page

**Files:**
- Create: `frontend/src/pages/CitizenProfile.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create CitizenProfile page**

Create `frontend/src/pages/CitizenProfile.tsx`:
```tsx
import { useParams, Link } from 'react-router-dom';
import { useCitizen, useCitizenHistory, useCitizenAchievements } from '../api/hooks';
import { formatNumber, formatDate, formatCompact } from '../utils/formatters';
import StatCard from '../components/StatCard';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function CitizenProfile() {
  const { id } = useParams<{ id: string }>();
  const citizenId = parseInt(id || '0', 10);

  const { data: citizen, isLoading } = useCitizen(citizenId);
  const { data: history } = useCitizenHistory(citizenId);
  const { data: achievements } = useCitizenAchievements(citizenId);

  if (isLoading) return <div className="text-secondary">Loading...</div>;
  if (!citizen || !citizen.name) return <div className="text-secondary">Citizen not found</div>;

  const levelHistory = (history || [])
    .filter((h) => h.level !== null)
    .map((h) => ({
      date: new Date(h.scanned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      level: h.level,
    }));

  const strengthHistory = (history || [])
    .filter((h) => h.strength !== null)
    .map((h) => ({
      date: new Date(h.scanned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      strength: h.strength,
    }));

  const statusColor = citizen.status === 'alive'
    ? 'text-semantic-green'
    : citizen.status === 'banned'
    ? 'text-semantic-gold'
    : 'text-semantic-red';

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        {citizen.avatar_url && (
          <img src={citizen.avatar_url} alt={citizen.name} className="w-16 h-16 rounded-full border-2 border" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-primary">{citizen.name}</h1>
          <div className="flex items-center gap-3 text-sm text-secondary">
            <span className={`font-medium ${statusColor}`}>{citizen.status}</span>
            <span>·</span>
            <span>Level {citizen.level}</span>
            {citizen.citizenship_country_name && (
              <>
                <span>·</span>
                <Link
                  to={`/countries/${citizen.citizenship_country_id}`}
                  className="text-accent hover:text-accent-hover"
                >
                  {citizen.citizenship_country_name}
                </Link>
              </>
            )}
            <span>·</span>
            <span>Registered {formatDate(citizen.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="XP" value={formatCompact(citizen.xp)} />
        <StatCard label="Strength" value={formatNumber(citizen.strength)} />
        <StatCard label="Division" value={citizen.division ?? '—'} />
        <StatCard label="Friends" value={formatNumber(citizen.friend_count)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-surface rounded-lg border shadow-card p-4">
          <h2 className="text-sm font-semibold text-secondary mb-3">GROUND COMBAT</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-secondary">Rank</span><span className="text-primary font-medium">{citizen.ground_rank_name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-secondary">Rank Points</span><span className="text-primary">{formatCompact(citizen.ground_rank_points)}</span></div>
            <div className="flex justify-between"><span className="text-secondary">Best Damage</span><span className="text-primary">{formatCompact(citizen.best_damage)}</span></div>
          </div>
        </div>

        <div className="bg-surface rounded-lg border shadow-card p-4">
          <h2 className="text-sm font-semibold text-secondary mb-3">AIR COMBAT</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-secondary">Rank</span><span className="text-primary font-medium">{citizen.air_rank_name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-secondary">Rank Points</span><span className="text-primary">{formatCompact(citizen.air_rank_points)}</span></div>
            <div className="flex justify-between"><span className="text-secondary">Perception</span><span className="text-primary">{formatNumber(citizen.air_perception)}</span></div>
          </div>
        </div>
      </div>

      {citizen.party_name && (
        <div className="bg-surface rounded-lg border shadow-card p-4 mb-6">
          <h2 className="text-sm font-semibold text-secondary mb-3">AFFILIATIONS</h2>
          <div className="space-y-2 text-sm">
            {citizen.party_name && <div className="flex justify-between"><span className="text-secondary">Party</span><span className="text-primary">{citizen.party_name} {citizen.is_party_president ? '(President)' : ''}</span></div>}
            {citizen.military_unit_name && <div className="flex justify-between"><span className="text-secondary">Military Unit</span><span className="text-primary">{citizen.military_unit_name}</span></div>}
            {citizen.newspaper_name && <div className="flex justify-between"><span className="text-secondary">Newspaper</span><span className="text-primary">{citizen.newspaper_name}</span></div>}
          </div>
          <div className="flex gap-2 mt-3">
            {citizen.is_president === 1 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">President</span>}
            {citizen.is_congressman === 1 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Congress</span>}
            {citizen.is_dictator === 1 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Dictator</span>}
          </div>
        </div>
      )}

      {achievements && achievements.length > 0 && (
        <div className="bg-surface rounded-lg border shadow-card p-4 mb-6">
          <h2 className="text-sm font-semibold text-secondary mb-3">ACHIEVEMENTS</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {achievements.map((a) => (
              <div key={a.medal_type} className="flex justify-between items-center text-sm py-1">
                <span className="text-secondary">{a.medal_type}</span>
                <span className="text-primary font-medium">{a.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {levelHistory.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface rounded-lg border shadow-card p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">LEVEL OVER TIME</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={levelHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="level" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {strengthHistory.length > 1 && (
            <div className="bg-surface rounded-lg border shadow-card p-4">
              <h2 className="text-sm font-semibold text-secondary mb-3">STRENGTH OVER TIME</h2>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={strengthHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="strength" stroke="var(--color-green)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CitizenProfile;
```

- [ ] **Step 2: Add citizen route to App.tsx**

Add import `CitizenProfile` and route `<Route path="citizens/:id" element={<CitizenProfile />} />`.

Final `App.tsx`:
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CountriesList from './pages/CountriesList';
import CountryDetail from './pages/CountryDetail';
import Search from './pages/Search';
import CitizenProfile from './pages/CitizenProfile';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="countries" element={<CountriesList />} />
          <Route path="countries/:id" element={<CountryDetail />} />
          <Route path="search" element={<Search />} />
          <Route path="citizens/:id" element={<CitizenProfile />} />
          <Route path="*" element={<div className="text-secondary p-8">Page not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 3: Commit**

```bash
cd /Users/driversti/Projects/erepublik/profiler
git add frontend/src/pages/CitizenProfile.tsx frontend/src/App.tsx
git commit -m "feat(profiler): citizen profile page with history charts and achievements"
```

---

### Task 8: Fix Layout Navigation + Final Verification

**Files:**
- Modify: `frontend/src/components/Layout.tsx` (fix search navigation to use React Router)

- [ ] **Step 1: Fix Layout search to use React Router navigate**

The Layout component used `window.location.href` for search which causes a full page reload. Fix it to use React Router's `useNavigate`:

Update the import line and search handler in `Layout.tsx`:

Replace the search handler with:
```tsx
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
```

And the search form handler:
```tsx
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) {
      navigate(`/search?name=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };
```

- [ ] **Step 2: Verify the full frontend builds**

```bash
cd frontend && npm run build
```

Expected: No TypeScript errors, builds to `dist/`.

- [ ] **Step 3: Verify dev server**

```bash
cd frontend && npm run dev
```

Visit: http://localhost:5173 — verify:
- Dashboard loads (shows "No scan data" if API not running, or real data if it is)
- Countries page lists countries
- Search page searches by name
- Citizen profile shows detail + charts
- Dark mode toggle works
- Nav links highlight when active

- [ ] **Step 4: Commit**

```bash
cd /Users/driversti/Projects/erepublik/profiler
git add frontend/src/components/Layout.tsx
git commit -m "fix(profiler): use React Router navigate for search instead of page reload"
```
