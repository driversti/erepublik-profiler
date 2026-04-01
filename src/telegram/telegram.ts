import type { Config } from "../config.ts";

export function createTelegram(config: Config) {
  const canSend = Boolean(config.botToken && config.chatId);

  async function send(message: string): Promise<void> {
    if (!canSend) return;

    try {
      const body: Record<string, unknown> = {
        chat_id: config.chatId,
        text: message,
        parse_mode: "HTML",
      };
      if (config.topicId) {
        body.message_thread_id = parseInt(config.topicId, 10);
      }

      const response = await fetch(
        `https://api.telegram.org/bot${config.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) {
        console.error(`Telegram API error: ${response.status}`);
      }
    } catch (err) {
      console.error("Telegram send failed:", (err as Error).message);
    }
  }

  return { send };
}
