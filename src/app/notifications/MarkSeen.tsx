"use client";

import { useEffect } from "react";
import { markNotificationsSeen } from "./actions";

/**
 * Marks notifications as seen after the page has shown them. It doesn't
 * refresh the page, so anything new stays highlighted while it's being read.
 */
export default function MarkSeen() {
  useEffect(() => {
    void markNotificationsSeen();
  }, []);

  return null;
}
