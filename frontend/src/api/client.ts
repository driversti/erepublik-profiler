import type {
  GlobalStats, Snapshot, SnapshotWithScanType, Achievement,
  CountrySummary, CountryStats, SearchResult, PaginatedResponse, Scan,
  ScanStatus, FailedCitizen, PlayerRow,
} from '../types/api';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
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

export function getCountryCitizens(id: number, sort = 'level', limit = 50, offset = 0): Promise<PaginatedResponse<Snapshot>> {
  return fetchJson(`/api/countries/${id}/citizens?sort=${sort}&limit=${limit}&offset=${offset}`);
}

export function getScans(): Promise<Scan[]> {
  return fetchJson('/api/scans');
}

export function getPlayers(status = 'all', sort = 'id', order = 'asc', limit = 50, offset = 0): Promise<PaginatedResponse<PlayerRow>> {
  const params = new URLSearchParams({ status, sort, order, limit: String(limit), offset: String(offset) });
  return fetchJson(`/api/players?${params}`);
}

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
