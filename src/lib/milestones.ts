/**
 * Album-rating milestones worth a moment and a share card: the tenth, the
 * hundredth and so on. Shared by the server (which spots one being reached)
 * and the browser (which celebrates it), so nothing here can be server-only.
 */
export const MILESTONES = [10, 25, 50, 100, 250, 500, 1000] as const;

export function isMilestone(count: number) {
  return (MILESTONES as readonly number[]).includes(count);
}

export function milestonePath(username: string, count: number) {
  return `/u/${username}/milestone/${count}`;
}
