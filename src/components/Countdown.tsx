"use client";

import { useEffect, useState } from "react";

function remaining(ms: number) {
  if (ms <= 0) return null;
  const minutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/**
 * "Closes in 7h 42m", ticking down. It starts from the time the page was
 * made, so the server and the browser draw the same thing first.
 */
export default function Countdown({
  until,
  now,
  prefix = "Closes in",
}: {
  until: string;
  now: number;
  prefix?: string;
}) {
  const [time, setTime] = useState(now);

  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);

  const left = remaining(Date.parse(until) - time);
  return <span className="tabular-nums">{left ? `${prefix} ${left}` : "Closed"}</span>;
}
