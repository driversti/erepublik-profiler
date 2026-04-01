import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.START_ID = "1";
    process.env.END_ID = "10000000";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("parses required env vars", async () => {
    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();
    expect(config.startId).toBe(1);
    expect(config.endId).toBe(10000000);
  });

  test("uses defaults for optional vars", async () => {
    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();
    expect(config.baseDelayMs).toBe(10);
    expect(config.checkpointInterval).toBe(100);
    expect(config.dbPath).toBe("./data/profiler.db");
    expect(config.apiPort).toBe(3000);
    expect(config.homeCountry).toBe("PL");
  });

  test("parses optional telegram vars as null when missing", async () => {
    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();
    expect(config.botToken).toBeNull();
    expect(config.chatId).toBeNull();
    expect(config.topicId).toBeNull();
  });

  test("throws when required vars missing", async () => {
    delete process.env.START_ID;
    const { loadConfig } = await import("../src/config.ts");
    expect(() => loadConfig()).toThrow("START_ID");
  });
});
