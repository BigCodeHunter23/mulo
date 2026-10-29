import { describe, expect, it, vi } from "vitest";
import { checkReceipts, type ReceiptDeps } from "@/lib/push/receipts";

vi.mock("@/lib/push/store", () => ({}));
vi.mock("@/lib/push/expo", () => ({}));

const entry = {
  userId: "a",
  kind: "follow" as const,
  key: "k",
  tickets: [
    { id: "t1", token: "T1" },
    { id: "t2", token: "T2" },
  ],
};

describe("checkReceipts", () => {
  it("drops phones Apple or Google no longer know, and marks the log read", async () => {
    const d: ReceiptDeps = {
      uncheckedTickets: vi.fn(async () => [entry]),
      fetchReceipts: vi.fn(async () => ({
        t1: { status: "ok" as const },
        t2: { status: "error" as const, details: { error: "DeviceNotRegistered" } },
      })),
      dropTokens: vi.fn(async () => {}),
      markChecked: vi.fn(async () => {}),
    };
    expect(await checkReceipts(new Date(), d)).toBe(2);
    expect(d.dropTokens).toHaveBeenCalledWith(["T2"]);
    expect(d.markChecked).toHaveBeenCalledWith([entry]);
  });

  it("leaves an entry unchecked while one of its receipts isn't ready", async () => {
    const waiting = { ...entry, key: "w", tickets: [{ id: "t3", token: "T3" }] };
    const d: ReceiptDeps = {
      uncheckedTickets: vi.fn(async () => [entry, waiting]),
      fetchReceipts: vi.fn(async () => ({
        t1: { status: "ok" as const },
        t2: { status: "ok" as const },
      })),
      dropTokens: vi.fn(async () => {}),
      markChecked: vi.fn(async () => {}),
    };
    await checkReceipts(new Date(), d);
    expect(d.markChecked).toHaveBeenCalledWith([entry]);
  });

  it("logs another error and keeps the phone", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const d: ReceiptDeps = {
      uncheckedTickets: vi.fn(async () => [entry]),
      fetchReceipts: vi.fn(async () => ({
        t1: { status: "ok" as const },
        t2: { status: "error" as const, details: { error: "MessageRateExceeded" } },
      })),
      dropTokens: vi.fn(async () => {}),
      markChecked: vi.fn(async () => {}),
    };
    await checkReceipts(new Date(), d);
    expect(log).toHaveBeenCalled();
    expect(d.dropTokens).toHaveBeenCalledWith([]);
    expect(d.markChecked).toHaveBeenCalledWith([entry]);
  });

  it("marks an entry that has no tickets", async () => {
    const empty = { ...entry, tickets: [] };
    const d: ReceiptDeps = {
      uncheckedTickets: vi.fn(async () => [empty]),
      fetchReceipts: vi.fn(),
      dropTokens: vi.fn(async () => {}),
      markChecked: vi.fn(async () => {}),
    };
    await checkReceipts(new Date(), d);
    expect(d.fetchReceipts).not.toHaveBeenCalled();
    expect(d.markChecked).toHaveBeenCalledWith([empty]);
  });

  it("does nothing when there's nothing to check", async () => {
    const d: ReceiptDeps = {
      uncheckedTickets: vi.fn(async () => []),
      fetchReceipts: vi.fn(),
      dropTokens: vi.fn(),
      markChecked: vi.fn(),
    };
    expect(await checkReceipts(new Date(), d)).toBe(0);
    expect(d.fetchReceipts).not.toHaveBeenCalled();
  });
});
