import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReceipts, postToExpo } from "@/lib/push/expo";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Expo's push service", () => {
  it("sends in batches of 100, with the access token, and keeps tickets in order", async () => {
    vi.stubEnv("EXPO_ACCESS_TOKEN", "secret");
    const calls: { headers: Record<string, string>; count: number }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const sent = JSON.parse(String(init.body)) as unknown[];
        calls.push({ headers: init.headers as Record<string, string>, count: sent.length });
        return new Response(
          JSON.stringify({
            data: sent.map((_, i) => ({ status: "ok", id: `t${calls.length}-${i}` })),
          }),
        );
      }),
    );
    const messages = Array.from({ length: 150 }, (_, i) => ({ to: `T${i}`, title: "x" }));
    const tickets = await postToExpo(messages);
    expect(calls.map((c) => c.count)).toEqual([100, 50]);
    expect(calls[0]?.headers.authorization).toBe("Bearer secret");
    expect(tickets).toHaveLength(150);
    expect(tickets[100]).toEqual({ status: "ok", id: "t2-0" });
  });

  it("leaves a refused batch without tickets rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postToExpo([{ to: "T", title: "x" }])).toEqual([undefined]);
  });

  it("keeps the other batches when one batch's request throws", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        call += 1;
        if (call === 1) throw new Error("network down");
        const sent = JSON.parse(String(init.body)) as unknown[];
        return new Response(JSON.stringify({ data: sent.map(() => ({ status: "ok", id: "x" })) }));
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const messages = Array.from({ length: 150 }, (_, i) => ({ to: `T${i}`, title: "x" }));
    const tickets = await postToExpo(messages);
    expect(tickets).toHaveLength(150);
    expect(tickets.slice(0, 100).every((t) => t === undefined)).toBe(true);
    expect(tickets[100]).toEqual({ status: "ok", id: "x" });
  });

  it("treats a malformed body as a lost batch, not a crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>")),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postToExpo([{ to: "T", title: "x" }])).toEqual([undefined]);
  });

  it("skips a receipts batch that throws and keeps the rest", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("network down");
        return new Response(JSON.stringify({ data: { z: { status: "ok" } } }));
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ids = Array.from({ length: 1001 }, (_, i) => `id${i}`);
    expect(await fetchReceipts(ids)).toEqual({ z: { status: "ok" } });
  });

  it("reads receipts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                a: { status: "ok" },
                b: { status: "error", details: { error: "DeviceNotRegistered" } },
              },
            }),
          ),
      ),
    );
    expect(await fetchReceipts(["a", "b"])).toEqual({
      a: { status: "ok" },
      b: { status: "error", details: { error: "DeviceNotRegistered" } },
    });
  });
});
