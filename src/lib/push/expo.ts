import "server-only";
import { z } from "zod";
import { RECEIPT_BATCH, SEND_BATCH } from "@/lib/push/batches";

/**
 * The only code that talks to Expo's push service, which hands each push to
 * Apple or Google. Docs: https://docs.expo.dev/push-notifications/sending-notifications
 *
 * Expo's answers are checked before they're trusted: one that isn't the
 * shape documented there counts as a lost batch, like a dropped connection.
 */

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Long enough for Expo, short enough that a hung request can't eat the whole run. */
const TIMEOUT_MS = 15_000;

export type ExpoMessage = {
  to: string;
  title: string;
  body?: string;
  data?: Record<string, string>;
  sound?: "default";
};

const refused = z.object({
  status: z.literal("error"),
  message: z.string().optional(),
  details: z.object({ error: z.string().optional() }).optional(),
});

const ticketSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), id: z.string() }),
  refused,
]);

const receiptSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok") }),
  refused,
]);

/** Expo answers a send with one ticket per push, in order (null where it has none). */
const sendAnswer = z.object({ data: z.array(ticketSchema.nullable()) });
/** And a receipts request with the receipts that are ready, by ticket id. */
const receiptsAnswer = z.object({ data: z.record(z.string(), receiptSchema) });

export type Ticket = z.infer<typeof ticketSchema>;
export type Receipt = z.infer<typeof receiptSchema>;

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
      const parsed = sendAnswer.safeParse(await response.json());
      if (!parsed.success) {
        console.error("[push] Expo's answer to a batch wasn't the expected shape");
        tickets.push(...batch.map(() => undefined));
        continue;
      }
      tickets.push(...batch.map((_, j) => parsed.data.data[j] ?? undefined));
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
      // Receipts left out are simply asked for again on the next run.
      const parsed = receiptsAnswer.safeParse(await response.json());
      if (!parsed.success) {
        console.error("[push] Expo's receipts weren't the expected shape");
        continue;
      }
      Object.assign(receipts, parsed.data.data);
    } catch (error) {
      console.error("[push] Reading receipts from Expo failed:", error);
    }
  }
  return receipts;
}
