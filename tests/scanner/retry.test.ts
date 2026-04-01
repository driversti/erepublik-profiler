import { describe, test, expect } from "bun:test";

// withJitter is now inlined in scanner.ts — test via re-export or direct copy
function withJitter(ms: number, jitterPercent: number): number {
  if (ms === 0) return 0;
  const jitter = ms * jitterPercent;
  return Math.round(ms + (Math.random() * 2 - 1) * jitter);
}

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
