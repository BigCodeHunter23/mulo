"use client";

import { useSyncExternalStore } from "react";

const KEY = "mulo:tip-hold-to-rate";
const listeners = new Set<() => void>();

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * A one-time tip that album covers can be pressed and held to rate. Nobody
 * finds a gesture on their own; once dismissed it never comes back.
 */
export default function HoldTip() {
  // Hidden on the server and until storage says it hasn't been seen.
  const hidden = useSyncExternalStore(subscribe, seen, () => true);
  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // No storage: it'll just show again next time.
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <div className="step-in flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm text-text-secondary">
      <span aria-hidden="true" className="text-lg">👆</span>
      <p className="flex-1">
        <span className="font-medium text-text">Tip:</span> press and hold any album cover to rate it without leaving the page.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
      >
        Got it
      </button>
    </div>
  );
}
