"use client";

import { useEffect } from "react";
import { reportClock } from "@/app/clock/actions";

const KEY = "mulo:clock";
const HOUR = 3_600_000;

/** Tells MULO this browser's time zone, at most once an hour. Shows nothing. */
export default function ClockReporter() {
  useEffect(() => {
    try {
      if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < HOUR) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Storage blocked: report anyway; the server keeps it to once an hour.
    }
    void reportClock(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  return null;
}
