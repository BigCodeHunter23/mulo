/** Expo takes at most 100 pushes, and 1000 receipt ids, per request. */
export const SEND_BATCH = 100;
export const RECEIPT_BATCH = 1000;

/**
 * Splits `items` into runs whose weights add up to at most `max`, in order.
 * One item heavier than `max` gets a run to itself rather than being split.
 */
export function batchesOf<T>(items: T[], weight: (item: T) => number, max: number): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let total = 0;
  for (const item of items) {
    const w = weight(item);
    if (current.length > 0 && total + w > max) {
      batches.push(current);
      current = [];
      total = 0;
    }
    current.push(item);
    total += w;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Whether a run's time is up. No deadline means it never is. */
export function pastDeadline(deadline: number | undefined): boolean {
  return deadline !== undefined && Date.now() >= deadline;
}
