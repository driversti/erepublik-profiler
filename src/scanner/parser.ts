import type { SnapshotRow, AchievementEntry } from "../db/queries.ts";

type CitizenResult = {
  type: "citizen";
  snapshot: Omit<SnapshotRow, "scan_id" | "scanned_at">;
  achievements: AchievementEntry[];
};

type SkipResult = { type: "skip" };

export type ParseResult = CitizenResult | SkipResult;

export function parseCitizenResponse(data: any): ParseResult {
  const citizen = data.citizen;

  if (citizen.is_organization) {
    return { type: "skip" };
  }

  const banStatus = citizen.banStatus && citizen.banStatus !== false ? citizen.banStatus : null;

  let status: string;
  if (banStatus) {
    status = "banned";
  } else if (!citizen.is_alive) {
    status = "dead";
  } else {
    status = "alive";
  }

  const party = data.partyData && data.partyData !== false ? data.partyData : null;
  const mu = data.military?.militaryUnit && data.military.militaryUnit !== false ? data.military.militaryUnit : null;
  const bestDmg = data.military?.bestDamageData && data.military.bestDamageData !== false ? data.military.bestDamageData : null;
  const newspaper = data.newspaper && data.newspaper !== false ? data.newspaper : null;
  const pvp = data.pvpStats && data.pvpStats !== false ? data.pvpStats : null;
  const city = data.city?.residenceCity || null;
  const mil = data.military?.militaryData;

  const snapshot: Omit<SnapshotRow, "scan_id" | "scanned_at"> = {
    citizen_id: citizen.id,
    status,
    is_organization: 0,
    name: citizen.name,
    level: citizen.level,
    xp: data.citizenAttributes?.experience_points ?? null,
    created_at: citizen.created_at,
    avatar_url: citizen.avatar || null,
    ban_type: banStatus?.type ?? null,
    ban_reason: banStatus?.reason ?? null,
    citizenship_country_id: data.location?.citizenshipCountry?.id ?? null,
    citizenship_country_name: data.location?.citizenshipCountry?.name ?? null,
    residence_country_id: data.location?.residenceCountry?.id ?? null,
    residence_country_name: data.location?.residenceCountry?.name ?? null,
    residence_region_id: data.location?.residenceRegion?.id ?? null,
    residence_region_name: data.location?.residenceRegion?.name ?? null,
    residence_city_id: city?.id ?? data.city?.residenceCityId ?? null,
    residence_city_name: city?.name ?? null,
    party_id: party?.id ?? null,
    party_name: party?.name ?? null,
    military_unit_id: mu?.id ?? null,
    military_unit_name: mu?.name ?? null,
    is_president: data.isPresident ? 1 : 0,
    is_congressman: data.isCongressman ? 1 : 0,
    is_dictator: data.isDictator ? 1 : 0,
    is_party_president: party?.is_party_president ? 1 : 0,
    strength: mil?.strength ?? null,
    division: mil?.divisionData?.division ?? null,
    ground_rank_name: mil?.name ?? null,
    ground_rank_number: mil?.rankNumber ?? null,
    ground_rank_points: mil?.points ?? null,
    air_rank_name: mil?.aircraft?.name ?? null,
    air_rank_number: mil?.aircraft?.rankNumber ?? null,
    air_rank_points: mil?.aircraft?.points ?? null,
    air_perception: mil?.aircraft?.coordination ?? null,
    best_damage: bestDmg?.damage ?? null,
    best_damage_battle_id: bestDmg?.battle_id ?? null,
    friend_count: data.friends?.number ?? null,
    newspaper_id: newspaper?.id ?? null,
    newspaper_name: newspaper?.name ?? null,
    pvp_matches_played: pvp?.matches_played ?? null,
    pvp_matches_won: pvp?.matches_won ?? null,
    pvp_matches_lost: pvp?.matches_lost ?? null,
  };

  const achievements: AchievementEntry[] = (data.achievements || []).map((a: any) => ({
    medal_type: a.name,
    count: a.count,
  }));

  return { type: "citizen", snapshot, achievements };
}
