"use client";
import { useState, useEffect } from "react";

/** Live countdown to a target date, e.g. "en 3d 5h". Ticks each minute. */
export default function Countdown({ to, prefix }: { to: string | Date; prefix?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const diff = new Date(to).getTime() - now;
  if (isNaN(diff)) return null;
  if (diff <= 0) return <>{prefix ? `${prefix} ` : ""}ahora</>;

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const parts = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return <>{prefix ? `${prefix} ` : ""}{parts}</>;
}
