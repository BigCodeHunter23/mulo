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
