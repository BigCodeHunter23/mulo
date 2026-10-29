import "server-only";
import * as store from "@/lib/push/store";
import { postToExpo, type ExpoMessage } from "@/lib/push/expo";
import type { PushMessage } from "@/lib/push/messages";
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

/**
 * Sends pushes, each at most once, to every phone of each person who wants
 * that kind. Answers how many phones it went to. Never throws: a push that
 * fails is logged, and whatever caused it has already been saved.
 */
export async function sendPushes(
  messages: PushMessage[],
  deps: SendDeps = real(),
): Promise<number> {
  if (messages.length === 0) return 0;
  try {
    const switches = await deps.readSwitches([...new Set(messages.map((m) => m.userId))]);
    const wanted = messages.filter((m) => wants(switches.get(m.userId) ?? ALL_ON, m.kind));
    if (wanted.length === 0) return 0;

    const claimed = await deps.claimPushes(wanted);
    const fresh = wanted.filter((m) => claimed.has(store.logKey(m)));
    if (fresh.length === 0) return 0;

    const devices = await deps.devicesOf([...new Set(fresh.map((m) => m.userId))]);
    const outgoing = fresh.flatMap((message) =>
      devices.filter((d) => d.user_id === message.userId).map((d) => ({ message, token: d.token })),
    );
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
        console.error("[push] Expo refused a push:", ticket.details?.error ?? ticket.message);
      }
    });

    await Promise.all(
      [...kept].map(([m, list]) =>
        deps.saveTickets({ userId: m.userId, kind: m.kind, key: m.key }, list),
      ),
    );
    await deps.dropTokens(dead);
    return outgoing.length;
  } catch (error) {
    console.error("[push] sending failed:", error);
    return 0;
  }
}
