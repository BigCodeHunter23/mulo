import "server-only";
import * as store from "@/lib/push/store";
import { postToExpo, type ExpoMessage } from "@/lib/push/expo";
import type { PushMessage } from "@/lib/push/messages";
import { batchesOf, pastDeadline, SEND_BATCH } from "@/lib/push/batches";
import { ALL_ON, wants } from "@/lib/push/who";

export type SendDeps = {
  readSwitches: typeof store.readSwitches;
  claimPushes: typeof store.claimPushes;
  devicesOf: typeof store.devicesOf;
  postToExpo: typeof postToExpo;
  saveTickets: typeof store.saveTickets;
  dropTokens: typeof store.dropTokens;
};

const real = (): SendDeps => ({
  readSwitches: store.readSwitches,
  claimPushes: store.claimPushes,
  devicesOf: store.devicesOf,
  postToExpo,
  saveTickets: store.saveTickets,
  dropTokens: store.dropTokens,
});

type Outgoing = { message: PushMessage; token: string };

/** Claims one batch's pushes, sends what it won, and records what Expo said. */
async function sendBatch(
  batch: PushMessage[],
  phones: Map<string, string[]>,
  deps: SendDeps,
): Promise<number> {
  // Delivery is at most once, on purpose: a message is claimed before it is
  // sent, so a crash in between never sends it twice.
  const claimed = await deps.claimPushes(batch);
  const outgoing: Outgoing[] = batch
    .filter((m) => claimed.has(store.logKey(m)))
    .flatMap((message) => (phones.get(message.userId) ?? []).map((token) => ({ message, token })));
  if (outgoing.length === 0) return 0;

  const tickets = await deps.postToExpo(
    outgoing.map(({ message, token }): ExpoMessage => ({
      to: token,
      title: message.title,
      ...(message.body ? { body: message.body } : {}),
      data: { url: message.url },
      sound: "default",
    })),
  );

  const kept = new Map<PushMessage, store.Ticketed[]>();
  const dead: string[] = [];
  tickets.forEach((ticket, i) => {
    const sent = outgoing[i];
    if (!sent || !ticket) return;
    if (ticket.status === "ok") {
      kept.set(sent.message, [
        ...(kept.get(sent.message) ?? []),
        { id: ticket.id, token: sent.token },
      ]);
    } else if (ticket.details?.error === "DeviceNotRegistered") {
      dead.push(sent.token);
    } else {
      // Only Expo's error code: its message can quote the phone's token.
      console.error("[push] Expo refused a push:", ticket.details?.error ?? "unknown");
    }
  });

  // A phone that's gone goes first, so a failed save can't keep it around.
  try {
    await deps.dropTokens(dead);
  } catch (error) {
    console.error("[push] dropping phones that are gone failed:", error);
  }
  const saved = await Promise.allSettled(
    [...kept].map(([m, list]) =>
      deps.saveTickets({ userId: m.userId, kind: m.kind, key: m.key }, list),
    ),
  );
  for (const result of saved) {
    if (result.status === "rejected") {
      console.error("[push] saving a push's tickets failed:", result.reason);
    }
  }
  return outgoing.length;
}

/**
 * Sends pushes, each at most once, to every phone of each person who wants
 * that kind. Answers how many phones it went to. Never throws: a push that
 * fails is logged, and whatever caused it has already been saved.
 *
 * Works through up to 100 phones at a time, claiming each batch just before
 * sending it. With a `deadline` (the clock's), no batch starts after it; the
 * pushes it leaves were never claimed, so the next run sends them.
 */
export async function sendPushes(
  messages: PushMessage[],
  deps: SendDeps = real(),
  options: { deadline?: number } = {},
): Promise<number> {
  if (messages.length === 0) return 0;
  try {
    const switches = await deps.readSwitches([...new Set(messages.map((m) => m.userId))]);
    const wanted = messages.filter((m) => wants(switches.get(m.userId) ?? ALL_ON, m.kind));
    if (wanted.length === 0) return 0;

    const phones = new Map<string, string[]>();
    for (const d of await deps.devicesOf([...new Set(wanted.map((m) => m.userId))])) {
      phones.set(d.user_id, [...(phones.get(d.user_id) ?? []), d.token]);
    }
    // Somebody with no phone yet isn't claimed, so a push for them is never used up.
    const reachable = wanted.filter((m) => phones.has(m.userId));

    let sent = 0;
    const batches = batchesOf(reachable, (m) => phones.get(m.userId)?.length ?? 0, SEND_BATCH);
    for (const batch of batches) {
      if (pastDeadline(options.deadline)) break;
      try {
        sent += await sendBatch(batch, phones, deps);
      } catch (error) {
        // One batch's claim failing leaves the others to go.
        console.error("[push] sending a batch failed:", error);
      }
    }
    return sent;
  } catch (error) {
    console.error("[push] sending failed:", error);
    return 0;
  }
}
