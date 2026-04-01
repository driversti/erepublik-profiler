export interface Config {
  startId: number;
  endId: number;
  baseDelayMs: number;
  checkpointInterval: number;
  dbPath: string;
  apiPort: number;
  botToken: string | null;
  chatId: string | null;
  topicId: string | null;
  homeCountry: string;
  gluetunApiUrl: string;
  backoffSteps: number[];
  backoffSteps5xx: number[];
  jitterPercent: number;
  maxVpnRotationsPerRequest: number;
  vpnPollIntervalMs: number;
  vpnPollTimeoutMs: number;
  vpnSleepOnFailureMs: number;
  progressEveryN: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    startId: parseInt(required("START_ID"), 10),
    endId: parseInt(required("END_ID"), 10),
    baseDelayMs: parseInt(process.env.BASE_DELAY_MS || "10", 10),
    checkpointInterval: parseInt(process.env.CHECKPOINT_INTERVAL || "100", 10),
    dbPath: process.env.DB_PATH || "./data/profiler.db",
    apiPort: parseInt(process.env.API_PORT || "3434", 10),
    botToken: process.env.BOT_TOKEN || null,
    chatId: process.env.CHAT_ID || null,
    topicId: process.env.TOPIC_ID || null,
    homeCountry: process.env.HOME_COUNTRY || "PL",
    gluetunApiUrl: process.env.GLUETUN_API_URL || "http://localhost:8000",
    backoffSteps: [1000, 1000, 1000],
    backoffSteps5xx: [1000, 1000, 1000],
    jitterPercent: 0.3,
    maxVpnRotationsPerRequest: 3,
    vpnPollIntervalMs: 2000,
    vpnPollTimeoutMs: 30000,
    vpnSleepOnFailureMs: 300_000,
    progressEveryN: 10_000,
  };
}
