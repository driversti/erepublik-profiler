import { describe, test, expect } from "bun:test";
import { withJitter, isRetryExhausted } from "../../src/scanner/retry.ts";

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

describe("isRetryExhausted", () => {
  test("returns false when retries remain", () => {
    const steps = [1000, 2000, 4000, 8000, 16000];
    expect(isRetryExhausted(0, steps)).toBe(false);
    expect(isRetryExhausted(4, steps)).toBe(false);
  });

  test("returns true when all retries used", () => {
    const steps = [1000, 2000, 4000, 8000, 16000];
    expect(isRetryExhausted(5, steps)).toBe(true);
    expect(isRetryExhausted(6, steps)).toBe(true);
  });
});
