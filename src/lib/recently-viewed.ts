"use client";

import { useSyncExternalStore } from "react";

/**
 * The albums and artists somebody opened last, newest first, so search can
 * offer them back before a word is typed. Kept in this browser only: it's a
 * convenience, not a record, and never worth a database row.
 */

export type Viewed = {
  kind: "album" | "artist";
  mbid: string;
  title: string;
  subtitle: string | null;
  image: string | null;
};

const KEY = "mulo:viewed";
const KEEP = 12;
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): Viewed[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list)
      ? list.filter((item) => item && typeof item.mbid === "string" && typeof item.title === "string")
      : [];
  } catch {
    return [];
  }
}

function write(list: Viewed[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private browsing or storage turned off: nothing sticks, nothing breaks.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export function rememberViewed(item: Viewed) {
  const rest = parse(read()).filter((v) => !(v.kind === item.kind && v.mbid === item.mbid));
  write([item, ...rest].slice(0, KEEP));
}

export function clearViewed() {
  write([]);
}

/** The list, read from storage; empty on the server and before hydration. */
export function useRecentlyViewed(): Viewed[] {
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  // Parsing is cheap for twelve items, and a stable string keeps renders quiet.
  return parse(raw);
}
