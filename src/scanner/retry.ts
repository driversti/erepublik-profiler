import type { Config } from "../config.ts";
import { fetchCitizen, type FetchResult } from "./fetcher.ts";

export function withJitter(ms: number, jitterPercent: number): number {
  if (ms === 0) return 0;
  const jitter = ms * jitterPercent;
  return Math.round(ms + (Math.random() * 2 - 1) * jitter);
}

export interface RetryResult {
  fetchResult: FetchResult;
  newIp?: string;
  totalAttempts: number;
}

export async function fetchWithRetry(
  citizenId: number,
  currentIp: string,
  config: Config,
  rotateVpn: (oldIp: string) => Promise<string>,
  sendTelegram: (msg: string) => Promise<void>,
): Promise<RetryResult> {
  let ip = currentIp;
  let totalAttempts = 0;

  for (let vpnRotation = 0; vpnRotation < config.maxVpnRotationsPerRequest; vpnRotation++) {
    const result = await fetchCitizen(citizenId);
    totalAttempts++;

    if (result.type === "success" || result.type === "not_found") {
      return { fetchResult: result, newIp: ip !== currentIp ? ip : undefined, totalAttempts };
    }

    if (!result.error?.retryable) {
      return { fetchResult: result, totalAttempts };
    }

    const is5xx = result.error.statusCode !== undefined && result.error.statusCode >= 500;
    const steps = is5xx ? config.backoffSteps5xx : config.backoffSteps;

    for (let attempt = 0; attempt < steps.length; attempt++) {
      const delay = withJitter(steps[attempt], config.jitterPercent);
      console.warn(
        `Retry ${attempt + 1}/${steps.length} for ID ${citizenId}: ${result.error.message}. Waiting ${delay}ms`,
      );
      await Bun.sleep(delay);

      const retry = await fetchCitizen(citizenId);
      totalAttempts++;

      if (retry.type === "success" || retry.type === "not_found") {
        return { fetchResult: retry, newIp: ip !== currentIp ? ip : undefined, totalAttempts };
      }

      if (!retry.error?.retryable) {
        return { fetchResult: retry, totalAttempts };
      }
    }

    console.warn(
      `Backoff exhausted for ID ${citizenId}. Rotating VPN (attempt ${vpnRotation + 1}/${config.maxVpnRotationsPerRequest})`,
    );
    ip = await rotateVpn(ip);
  }

  const msg = `💀 Failed ID ${citizenId} after ${config.maxVpnRotationsPerRequest} VPN rotations`;
  console.error(msg);
  await sendTelegram(msg);

  return {
    fetchResult: {
      type: "error",
      error: { message: "All retries and VPN rotations exhausted", retryable: false },
    },
    totalAttempts,
  };
}
