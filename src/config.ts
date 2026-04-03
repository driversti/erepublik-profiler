export interface Config {
  databaseUrl: string;
  baseDelayMs: number;
  checkpointInterval: number;
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
    databaseUrl: process.env.DATABASE_URL || "postgres://profiler:profiler@localhost:5432/profiler",
    baseDelayMs: parseInt(process.env.BASE_DELAY_MS || "10", 10),
    checkpointInterval: parseInt(process.env.CHECKPOINT_INTERVAL || "100", 10),
    apiPort: parseInt(process.env.API_PORT || "3434", 10),
    botToken: process.env.BOT_TOKEN || null,
    chatId: process.env.CHAT_ID || null,
    topicId: process.env.TOPIC_ID || null,
    homeCountry: process.env.HOME_COUNTRY || "PL",
    gluetunApiUrl: process.env.GLUETUN_API_URL || "http://localhost:8000",
    jitterPercent: 0.3,
    vpnPollIntervalMs: 1000,
    vpnPollTimeoutMs: 15_000,
    vpnSleepOnFailureMs: 15_000,
    progressEveryN: 10_000,
  };
}
