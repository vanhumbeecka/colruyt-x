import type { DealEvent } from "./deals.js";

export interface Notifier {
  notify(events: DealEvent[]): Promise<void>;
}

export function formatEvent(e: DealEvent): string {
  const pct = Math.round(e.discountPct * 100);
  const verb = e.kind === "onset" ? "New deal" : "Better deal";
  return (
    `🏷️ ${verb}: ${e.name}\n` +
    `Buy ${e.quantity}, pay €${e.unitPrice.toFixed(2)} each (was €${e.basicPrice.toFixed(2)})\n` +
    `${pct}% off`
  );
}

export class TelegramNotifier implements Notifier {
  async notify(events: DealEvent[]): Promise<void> {
    if (events.length === 0) return;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatIds = (process.env.TELEGRAM_CHAT_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!token) throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
    if (chatIds.length === 0)
      throw new Error("TELEGRAM_CHAT_IDS environment variable is required");

    for (const event of events) {
      const text = formatEvent(event);
      for (const chatId of chatIds) {
        await this.send(token, chatId, text, event.imageUrl);
      }
    }
  }

  private async send(
    token: string,
    chatId: string,
    text: string,
    imageUrl: string | null,
  ): Promise<void> {
    const base = `https://api.telegram.org/bot${token}`;
    const url = imageUrl ? `${base}/sendPhoto` : `${base}/sendMessage`;
    const body = imageUrl
      ? { chat_id: chatId, photo: imageUrl, caption: text }
      : { chat_id: chatId, text };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Telegram send failed: ${res.status} ${res.statusText}`);
    }
  }
}
