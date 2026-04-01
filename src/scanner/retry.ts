import type { Config } from "../config.ts";
import { fetchCitizen, type FetchResult } from "./fetcher.ts";

export function withJitter(ms: number, jitterPercent: number): number {
  if (ms === 0) return 0;
  const jitter = ms * jitterPercent;
  return Math.round(ms + (Math.random() * 2 - 1) * jitter);
}

export function isRetryExhausted(attempt: number, backoffSteps: number[]): boolean {
  return attempt >= backoffSteps.length;
}

export interface RetryResult {
  fetchResult: FetchResult;
  newIp?: string;
}

export async function fetchWithRetry(
  citizenId: number,
  currentIp: string,
  config: Config,
  rotateVpn: (oldIp: string) => Promise<string>,
  sendTelegram: (msg: string) => Promise<void>,
): Promise<RetryResult> {
  let ip = currentIp;

  for (let vpnRotation = 0; vpnRotation < config.maxVpnRotationsPerRequest; vpnRotation++) {
    for (let attempt = 0; attempt < config.backoffSteps.length; attempt++) {
      const result = await fetchCitizen(citizenId);

      if (result.type === "success" || result.type === "not_found") {
        return { fetchResult: result, newIp: ip !== currentIp ? ip : undefined };
      }

      if (!result.error?.retryable) {
        return { fetchResult: result };
      }

      const delay = withJitter(config.backoffSteps[attempt], config.jitterPercent);
      console.warn(
        `Retry ${attempt + 1}/${config.backoffSteps.length} for ID ${citizenId}: ${result.error.message}. Waiting ${delay}ms`,
      );
      await Bun.sleep(delay);
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
  };
}
