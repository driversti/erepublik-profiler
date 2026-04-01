import { useQuery } from '@tanstack/react-query';
import {
  getStats, getCitizen, getCitizenHistory, getCitizenAchievements,
  searchCitizens, getCountries, getCountryStats, getCountryCitizens, getScans,
  getScanStatus, getFailedCitizens, getPlayers,
} from './client';
import type { ScanStatus, FailedCitizen, PlayerRow } from '../types/api';

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: getStats });
}

export function useCitizen(id: number) {
  return useQuery({ queryKey: ['citizen', id], queryFn: () => getCitizen(id), enabled: !!id });
}

export function useCitizenHistory(id: number) {
  return useQuery({ queryKey: ['citizenHistory', id], queryFn: () => getCitizenHistory(id), enabled: !!id });
}

export function useCitizenAchievements(id: number) {
  return useQuery({ queryKey: ['citizenAchievements', id], queryFn: () => getCitizenAchievements(id), enabled: !!id });
}

export function useSearchCitizens(name: string, limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['searchCitizens', name, limit, offset],
    queryFn: () => searchCitizens(name, limit, offset),
    enabled: name.length >= 2,
  });
}

export function useCountries() {
  return useQuery({ queryKey: ['countries'], queryFn: getCountries });
}

export function useCountryStats(id: number) {
  return useQuery({ queryKey: ['countryStats', id], queryFn: () => getCountryStats(id), enabled: !!id });
}

export function useCountryCitizens(id: number, sort = 'level', limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['countryCitizens', id, sort, limit, offset],
    queryFn: () => getCountryCitizens(id, sort, limit, offset),
    enabled: !!id,
  });
}

export function useScans() {
  return useQuery({ queryKey: ['scans'], queryFn: getScans });
}

export function usePlayers(status = 'all', sort = 'id', order = 'asc', limit = 50, offset = 0) {
  return useQuery<{ results: PlayerRow[]; total: number }>({
    queryKey: ['players', status, sort, order, limit, offset],
    queryFn: () => getPlayers(status, sort, order, limit, offset),
  });
}

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
