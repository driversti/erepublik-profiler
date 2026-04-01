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
