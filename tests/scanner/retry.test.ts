import { describe, test, expect } from "bun:test";
import { withJitter } from "../../src/scanner/retry.ts";

describe("withJitter", () => {
  test("returns value within ±30% of input", () => {
    const base = 1000;
    for (let i = 0; i < 100; i++) {
      const result = withJitter(base, 0.3);
      expect(result).toBeGreaterThanOrEqual(700);
      expect(result).toBeLessThanOrEqual(1300);
    }
  });

  test("returns 0 for 0 input", () => {
    expect(withJitter(0, 0.3)).toBe(0);
  });
});
