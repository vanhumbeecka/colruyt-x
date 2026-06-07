import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatEvent, TelegramNotifier } from "./notifier.js";
import type { DealEvent } from "./deals.js";

function event(over: Partial<DealEvent> = {}): DealEvent {
  return {
    productId: "p1",
    name: "Appel Jonagold",
    basicPrice: 1.89,
    quantity: 3,
    unitPrice: 1.74,
    discountPct: 0.0794,
    imageUrl: null,
    kind: "onset",
    ...over,
  };
}

describe("formatEvent", () => {
  it("formats an onset event with terms and discount", () => {
    const text = formatEvent(event());
    expect(text).toContain("Appel Jonagold");
    expect(text).toContain("Buy 3");
    expect(text).toContain("1.74");
    expect(text).toContain("1.89");
    expect(text).toContain("8%");
  });

  it("labels improved deals differently from onsets", () => {
    expect(formatEvent(event({ kind: "onset" }))).not.toEqual(
      formatEvent(event({ kind: "improved" })),
    );
  });
});

describe("TelegramNotifier", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "TOKEN";
    process.env.TELEGRAM_CHAT_IDS = "111,222";
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("does nothing for an empty event list", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await new TelegramNotifier().notify([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws when the bot token is missing", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(new TelegramNotifier().notify([event()])).rejects.toThrow(
      "TELEGRAM_BOT_TOKEN",
    );
  });

  it("throws when no chat ids are configured", async () => {
    process.env.TELEGRAM_CHAT_IDS = "";
    await expect(new TelegramNotifier().notify([event()])).rejects.toThrow(
      "TELEGRAM_CHAT_IDS",
    );
  });

  it("sends one sendMessage per chat id when there is no image", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await new TelegramNotifier().notify([event()]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      chat_id: "111",
    });
  });

  it("uses sendPhoto when an image is present", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await new TelegramNotifier().notify([event({ imageUrl: "f.jpg" })]);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://api.telegram.org/botTOKEN/sendPhoto");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      chat_id: "111",
      photo: "f.jpg",
    });
  });

  it("throws when Telegram responds with a non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 400 }),
    );
    await expect(new TelegramNotifier().notify([event()])).rejects.toThrow(
      "Telegram send failed: 400",
    );
  });
});
