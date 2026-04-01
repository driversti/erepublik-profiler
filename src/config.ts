export interface Config {
  startId: number | null;
  endId: number | null;
  baseDelayMs: number;
  checkpointInterval: number;
  dbPath: string;
  apiPort: number;
  botToken: string | null;
  chatId: string | null;
  topicId: string | null;
  homeCountry: string;
  gluetunApiUrl: string;
  jitterPercent: number;
  vpnPollIntervalMs: number;
  vpnPollTimeoutMs: number;
  vpnSleepOnFailureMs: number;
  progressEveryN: number;
}

export function loadConfig(): Config {
  return {
    startId: process.env.START_ID ? parseInt(process.env.START_ID, 10) : null,
    endId: process.env.END_ID ? parseInt(process.env.END_ID, 10) : null,
    baseDelayMs: parseInt(process.env.BASE_DELAY_MS || "10", 10),
    checkpointInterval: parseInt(process.env.CHECKPOINT_INTERVAL || "100", 10),
    dbPath: process.env.DB_PATH || "./data/profiler.db",
    apiPort: parseInt(process.env.API_PORT || "3434", 10),
    botToken: process.env.BOT_TOKEN || null,
    chatId: process.env.CHAT_ID || null,
    topicId: process.env.TOPIC_ID || null,
    homeCountry: process.env.HOME_COUNTRY || "PL",
    gluetunApiUrl: process.env.GLUETUN_API_URL || "http://localhost:8000",
    jitterPercent: 0.3,
    vpnPollIntervalMs: 2000,
    vpnPollTimeoutMs: 30000,
    vpnSleepOnFailureMs: 300_000,
    progressEveryN: 10_000,
  };
}
