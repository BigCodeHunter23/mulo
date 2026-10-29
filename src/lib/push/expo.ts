import "server-only";

/**
 * The only code that talks to Expo's push service, which hands each push to
 * Apple or Google. Docs: https://docs.expo.dev/push-notifications/sending-notifications
 */

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo takes at most 100 pushes, and 1000 receipt ids, per request. */
const SEND_BATCH = 100;
const RECEIPT_BATCH = 1000;
/** Long enough for Expo, short enough that a hung request can't eat the whole run. */
const TIMEOUT_MS = 15_000;

export type ExpoMessage = {
  to: string;
  title: string;
  body?: string;
  data?: Record<string, string>;
  sound?: "default";
};

export type Ticket =
  | { status: "ok"; id: string }
  | { status: "error"; message?: string; details?: { error?: string } };

export type Receipt =
  { status: "ok" } | { status: "error"; message?: string; details?: { error?: string } };

function headers(): Record<string, string> {
  const result: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  // Set in Vercel once the owner turns on Expo's push security.
  const token = process.env.EXPO_ACCESS_TOKEN;
  if (token) result.authorization = `Bearer ${token}`;
  return result;
}

/** Sends, and answers one ticket per message in the same order (undefined where Expo refused). */
export async function postToExpo(messages: ExpoMessage[]): Promise<(Ticket | undefined)[]> {
  const tickets: (Ticket | undefined)[] = [];
  for (let i = 0; i < messages.length; i += SEND_BATCH) {
    const batch = messages.slice(i, i + SEND_BATCH);
    try {
      const response = await fetch(SEND_URL, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        console.error("[push] Expo refused a batch:", response.status);
        tickets.push(...batch.map(() => undefined));
        continue;
      }
      const { data } = (await response.json()) as { data?: Ticket[] };
      tickets.push(...batch.map((_, j) => data?.[j]));
    } catch (error) {
      // A dropped connection or a bad body loses this batch only.
      console.error("[push] Sending a batch to Expo failed:", error);
      tickets.push(...batch.map(() => undefined));
    }
  }
  return tickets;
}

/** What became of each ticket, by its id. Missing ids aren't ready yet. */
export async function fetchReceipts(ids: string[]): Promise<Record<string, Receipt>> {
  const receipts: Record<string, Receipt> = {};
  for (let i = 0; i < ids.length; i += RECEIPT_BATCH) {
    try {
      const response = await fetch(RECEIPTS_URL, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ ids: ids.slice(i, i + RECEIPT_BATCH) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        console.error("[push] Expo refused a receipts request:", response.status);
        continue;
      }
      const { data } = (await response.json()) as { data?: Record<string, Receipt> };
      Object.assign(receipts, data ?? {});
    } catch (error) {
      console.error("[push] Reading receipts from Expo failed:", error);
    }
  }
  return receipts;
}
