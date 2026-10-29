import "server-only";
import * as store from "@/lib/push/store";
import { fetchReceipts } from "@/lib/push/expo";

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

/**
 * Reads what became of pushes sent a while ago. A phone Apple or Google no
 * longer knows (the app was deleted, say) is dropped, as Expo asks.
 */
export async function checkReceipts(at = new Date(), deps: ReceiptDeps = real()): Promise<number> {
  try {
    const entries = await deps.uncheckedTickets(at);
    if (entries.length === 0) return 0;
    const tickets = entries.flatMap((e) => e.tickets);
    const receipts = tickets.length ? await deps.fetchReceipts(tickets.map((t) => t.id)) : {};

    const dead = new Set<string>();
    for (const ticket of tickets) {
      const receipt = receipts[ticket.id];
      if (receipt?.status !== "error") continue;
      if (receipt.details?.error === "DeviceNotRegistered") dead.add(ticket.token);
      else
        console.error("[push] a push wasn't delivered:", receipt.details?.error ?? receipt.message);
    }

    // Expo answers only receipts that are ready, so an entry is done only
    // once all its tickets are; the rest wait for the next run (the window
    // in `uncheckedTickets` lets them age out).
    const complete = entries.filter((e) => e.tickets.every((t) => t.id in receipts));

    await deps.dropTokens([...dead]);
    if (complete.length > 0) await deps.markChecked(complete);
    return tickets.length;
  } catch (error) {
    console.error("[push] checking receipts failed:", error);
    return 0;
  }
}
