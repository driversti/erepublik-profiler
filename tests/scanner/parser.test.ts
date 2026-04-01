import { describe, test, expect } from "bun:test";
import { parseCitizenResponse } from "../../src/scanner/parser.ts";

const aliveResponse = {
  citizen: {
    id: 1234, name: "TestPlayer", is_organization: false, is_alive: true,
    created_at: "2009-01-15", avatar: "https://cdn.erepublik.com/avatars/1234.png",
    level: 72, banStatus: false,
  },
  citizenAttributes: { experience_points: 150000 },
  location: {
    citizenshipCountry: { id: 35, name: "Poland" },
    residenceCountry: { id: 35, name: "Poland" },
    residenceRegion: { id: 100, name: "Mazovia" },
  },
  city: { residenceCityId: 50, residenceCity: { id: 50, name: "Warsaw" } },
  partyData: { id: 1000, name: "Test Party", is_party_president: true },
  military: {
    militaryUnit: { id: 500, name: "Test MU" },
    militaryData: {
      strength: 50000.5, divisionData: { division: 4 },
      name: "God of War", rankNumber: 70, points: 1000000,
      aircraft: { name: "Airman", rankNumber: 10, points: 50000, coordination: 100 },
    },
    bestDamageData: { damage: 5000000, battle_id: 99999 },
  },
  isPresident: false, isCongressman: true, isDictator: false,
  friends: { number: 150 },
  newspaper: { id: 200, name: "Test News" },
  pvpStats: { matches_played: 50, matches_won: 30, matches_lost: 20 },
  achievements: [
    { name: "Battle Hero", count: 15 },
    { name: "Super Soldier", count: 300 },
    { name: "True Patriot", count: 5 },
  ],
};

describe("parseCitizenResponse", () => {
  test("parses alive citizen with full fields", () => {
    const result = parseCitizenResponse(aliveResponse);
    expect(result.type).toBe("citizen");
    if (result.type !== "citizen") return;
    expect(result.snapshot.status).toBe("alive");
    expect(result.snapshot.name).toBe("TestPlayer");
    expect(result.snapshot.level).toBe(72);
    expect(result.snapshot.xp).toBe(150000);
    expect(result.snapshot.citizenship_country_id).toBe(35);
    expect(result.snapshot.citizenship_country_name).toBe("Poland");
    expect(result.snapshot.party_id).toBe(1000);
    expect(result.snapshot.is_congressman).toBe(1);
    expect(result.snapshot.is_party_president).toBe(1);
    expect(result.snapshot.strength).toBe(50000.5);
    expect(result.snapshot.division).toBe(4);
    expect(result.snapshot.ground_rank_name).toBe("God of War");
    expect(result.snapshot.ground_rank_number).toBe(70);
    expect(result.snapshot.ground_rank_points).toBe(1000000);
    expect(result.snapshot.air_rank_name).toBe("Airman");
    expect(result.snapshot.air_rank_number).toBe(10);
    expect(result.snapshot.air_perception).toBe(100);
    expect(result.snapshot.best_damage).toBe(5000000);
    expect(result.snapshot.friend_count).toBe(150);
    expect(result.snapshot.newspaper_id).toBe(200);
    expect(result.snapshot.pvp_matches_played).toBe(50);
    expect(result.achievements).toHaveLength(3);
    expect(result.achievements[0]).toEqual({ medal_type: "Battle Hero", count: 15 });
  });

  test("returns skip for organization accounts", () => {
    const orgResponse = {
      ...aliveResponse,
      citizen: { ...aliveResponse.citizen, is_organization: true },
    };
    const result = parseCitizenResponse(orgResponse);
    expect(result.type).toBe("skip");
  });

  test("parses dead citizen", () => {
    const deadResponse = {
      ...aliveResponse,
      citizen: { ...aliveResponse.citizen, is_alive: false },
    };
    const result = parseCitizenResponse(deadResponse);
    if (result.type !== "citizen") throw new Error("expected citizen");
    expect(result.snapshot.status).toBe("dead");
  });

  test("parses banned citizen", () => {
    const bannedResponse = {
      ...aliveResponse,
      citizen: {
        ...aliveResponse.citizen,
        banStatus: { type: "permanent", reason: "multi-account" },
      },
    };
    const result = parseCitizenResponse(bannedResponse);
    if (result.type !== "citizen") throw new Error("expected citizen");
    expect(result.snapshot.status).toBe("banned");
    expect(result.snapshot.ban_type).toBe("permanent");
    expect(result.snapshot.ban_reason).toBe("multi-account");
  });

  test("handles missing optional fields gracefully", () => {
    const minimal = {
      citizen: {
        id: 5, name: "Min", is_organization: false, is_alive: true,
        created_at: "2010-01-01", avatar: "", level: 1, banStatus: false,
      },
      citizenAttributes: { experience_points: 0 },
      location: {
        citizenshipCountry: { id: 1, name: "Romania" },
        residenceCountry: { id: 1, name: "Romania" },
        residenceRegion: { id: 1, name: "Bucharest" },
      },
      city: {},
      partyData: false,
      military: {
        militaryUnit: false,
        militaryData: {
          strength: 0, divisionData: { division: 1 },
          name: "Recruit", rankNumber: 1, points: 0,
          aircraft: { name: "Airman", rankNumber: 1, points: 0, coordination: 0 },
        },
        bestDamageData: false,
      },
      isPresident: false, isCongressman: false, isDictator: false,
      friends: { number: 0 },
      newspaper: false,
      pvpStats: false,
      achievements: [],
    };
    const result = parseCitizenResponse(minimal);
    if (result.type !== "citizen") throw new Error("expected citizen");
    expect(result.snapshot.party_id).toBeNull();
    expect(result.snapshot.military_unit_id).toBeNull();
    expect(result.snapshot.best_damage).toBeNull();
    expect(result.snapshot.newspaper_id).toBeNull();
    expect(result.snapshot.pvp_matches_played).toBeNull();
    expect(result.snapshot.residence_city_id).toBeNull();
    expect(result.achievements).toHaveLength(0);
  });
});
