import { describe, test, expect, afterEach } from "bun:test";
import { unlinkSync, existsSync } from "fs";

const TEST_DB = "./data/test-database.db";

afterEach(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync(TEST_DB + "-wal")) unlinkSync(TEST_DB + "-wal");
  if (existsSync(TEST_DB + "-shm")) unlinkSync(TEST_DB + "-shm");
});

describe("initDatabase", () => {
  test("creates database file and tables", async () => {
    const { initDatabase } = await import("../../src/db/database.ts");
    const db = initDatabase(TEST_DB);

    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("scans");
    expect(tableNames).toContain("snapshots");
    expect(tableNames).toContain("achievements");
    expect(tableNames).toContain("checkpoint");

    db.close();
  });

  test("sets WAL journal mode", async () => {
    const { initDatabase } = await import("../../src/db/database.ts");
    const db = initDatabase(TEST_DB);

    const result = db.query("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    expect(result.journal_mode).toBe("wal");

    db.close();
  });

  test("is idempotent — can be called twice", async () => {
    const { initDatabase } = await import("../../src/db/database.ts");
    const db1 = initDatabase(TEST_DB);
    db1.close();
    const db2 = initDatabase(TEST_DB);

    const tables = db2
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.length).toBeGreaterThanOrEqual(4);

    db2.close();
  });
});
