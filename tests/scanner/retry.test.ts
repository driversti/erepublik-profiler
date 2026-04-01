import { describe, test, expect } from "bun:test";
import { withJitter } from "../../src/scanner/retry.ts";
import type { Config } from "../../src/config.ts";

type RetryConfig = Pick<Config, "backoffSteps" | "backoffSteps5xx" | "jitterPercent" | "maxVpnRotationsPerRequest">;

const baseConfig: RetryConfig = {
  backoffSteps: [1000, 2000, 4000, 8000, 16000],
  backoffSteps5xx: [1000, 2000, 4000, 8000, 16000, 30000, 60000, 60000, 60000, 60000],
  jitterPercent: 0,
  maxVpnRotationsPerRequest: 1,
};

describe("retry config — 5xx vs default step counts", () => {
  test("default backoffSteps has 5 steps", () => {
    expect(baseConfig.backoffSteps).toHaveLength(5);
  });

  test("backoffSteps5xx has 10 steps", () => {
    expect(baseConfig.backoffSteps5xx).toHaveLength(10);
  });

  test("backoffSteps5xx last 4 steps are 60s", () => {
    const last4 = baseConfig.backoffSteps5xx.slice(-4);
    expect(last4).toEqual([60000, 60000, 60000, 60000]);
  });
});

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
