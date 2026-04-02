import type { Config } from "../config.ts";

export interface IpInfo {
  ip: string;
  country: string;
}

export function createVpn(
  config: Config,
  sendTelegram: (msg: string) => Promise<void>,
) {
  async function getCurrentIpInfo(): Promise<IpInfo> {
    const response = await fetch("https://ipinfo.io/json", {
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await response.json()) as { ip: string; country: string };
    return { ip: data.ip, country: data.country };
  }

  async function checkIpLeak(): Promise<IpInfo> {
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const info = await getCurrentIpInfo();
        if (info.country === config.homeCountry) {
          const msg = `🚨 IP LEAK: detected ${config.homeCountry} IP (${info.ip}). Exiting immediately.`;
          console.error(msg);
          await sendTelegram(msg);
          process.exit(1);
        }
        return info;
      } catch (err) {
        console.error(`IP check attempt ${i + 1}/${maxRetries} failed:`, (err as Error).message);
        if (i < maxRetries - 1) {
          await Bun.sleep(5000);
        }
      }
    }
    throw new Error("Failed to verify IP after all retries");
  }

  async function setVpnStatus(status: "stopped" | "running"): Promise<void> {
    await fetch(`${config.gluetunApiUrl}/v1/vpn/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(10_000),
    });
  }

  async function getVpnStatus(): Promise<string> {
    const response = await fetch(`${config.gluetunApiUrl}/v1/vpn/status`, {
      signal: AbortSignal.timeout(5_000),
    });
    const data = (await response.json()) as { status: string };
    return data.status;
  }

  async function pollVpnUntilRunning(): Promise<boolean> {
    const deadline = Date.now() + config.vpnPollTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const status = await getVpnStatus();
        if (status === "running") return true;
      } catch {
        // ignore poll errors
      }
      await Bun.sleep(config.vpnPollIntervalMs);
    }
    return false;
  }

  async function attemptRotation(): Promise<{ success: boolean; newIp?: string }> {
    try {
      await setVpnStatus("stopped");
      await Bun.sleep(500);
      await setVpnStatus("running");

      const ready = await pollVpnUntilRunning();
      if (!ready) return { success: false };

      await Bun.sleep(500);
      const info = await getCurrentIpInfo();
      return { success: true, newIp: info.ip };
    } catch (err) {
      console.error("VPN rotation attempt failed:", (err as Error).message);
      return { success: false };
    }
  }

  async function rotateVpn(oldIp: string): Promise<string> {
    while (true) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await attemptRotation();
        if (result.success && result.newIp) {
          const msg = `🔄 VPN rotated: ${oldIp} → ${result.newIp}`;
          console.log(msg);
          await sendTelegram(msg);
          return result.newIp;
        }
        console.error(`VPN rotation attempt ${attempt + 1}/3 failed`);
      }

      const msg = "⚠️ VPN reconnect failed 3x. Sleeping 5min.";
      console.error(msg);
      await sendTelegram(msg);
      await Bun.sleep(config.vpnSleepOnFailureMs);
    }
  }

  return { getCurrentIpInfo, checkIpLeak, rotateVpn };
}
