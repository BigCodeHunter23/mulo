"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

/**
 * Renders its children straight into the page body. Pop-ups need this: a
 * parent with a transform (every card that animates in has one) would
 * otherwise trap a full-screen overlay inside that card.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return inBrowser ? createPortal(children, document.body) : null;
}
