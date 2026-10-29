import "server-only";
import * as store from "@/lib/push/store";
import { fetchReceipts } from "@/lib/push/expo";
import { batchesOf, pastDeadline, RECEIPT_BATCH } from "@/lib/push/batches";

export type ReceiptDeps = {
  uncheckedTickets: typeof store.uncheckedTickets;
  fetchReceipts: typeof fetchReceipts;
  dropTokens: typeof store.dropTokens;
  markChecked: typeof store.markChecked;
};

const real = (): ReceiptDeps => ({
  uncheckedTickets: store.uncheckedTickets,
  fetchReceipts,
  dropTokens: store.dropTokens,
  markChecked: store.markChecked,
});

/** Reads one batch's receipts, drops the phones that are gone, and marks what's done. */
async function checkBatch(entries: store.LoggedTickets[], deps: ReceiptDeps): Promise<number> {
  const tickets = entries.flatMap((e) => e.tickets);
  const receipts = tickets.length ? await deps.fetchReceipts(tickets.map((t) => t.id)) : {};

  const dead = new Set<string>();
  for (const ticket of tickets) {
    const receipt = receipts[ticket.id];
    if (receipt?.status !== "error") continue;
    if (receipt.details?.error === "DeviceNotRegistered") dead.add(ticket.token);
    // Only Expo's error code: its message can quote the phone's token.
    else console.error("[push] a push wasn't delivered:", receipt.details?.error ?? "unknown");
  }

  // Expo answers only receipts that are ready, so an entry is done only
  // once all its tickets are; the rest wait for the next run (the window
  // in `uncheckedTickets` lets them age out).
  const complete = entries.filter((e) => e.tickets.every((t) => t.id in receipts));

  await deps.dropTokens([...dead]);
  if (complete.length > 0) await deps.markChecked(complete);
  return tickets.length;
}

/**
 * Reads what became of pushes sent a while ago. A phone Apple or Google no
 * longer knows (the app was deleted, say) is dropped, as Expo asks. With a
 * `deadline` (the clock's), no batch of receipts starts after it; the rest
 * stay unchecked for the next run.
 */
export async function checkReceipts(
  at = new Date(),
  deps: ReceiptDeps = real(),
  options: { deadline?: number } = {},
): Promise<number> {
  try {
    const entries = await deps.uncheckedTickets(at);
    let checked = 0;
    for (const batch of batchesOf(entries, (e) => e.tickets.length, RECEIPT_BATCH)) {
      if (pastDeadline(options.deadline)) break;
      checked += await checkBatch(batch, deps);
    }
    return checked;
  } catch (error) {
    console.error("[push] checking receipts failed:", error);
    return 0;
  }
}
