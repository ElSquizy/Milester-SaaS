// Lightweight in-memory fixed-window rate limiter. Per-instance (not shared
// across serverless instances) — enough to blunt brute-force on a small app.
// For cross-instance guarantees, back this with Turso/Upstash later.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Returns whether the action is allowed, and seconds until the window resets. */
export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();

  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  }

  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > max) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

/** Clears a key (e.g. after a successful login so honest users aren't penalized). */
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff?.split(",")[0].trim()) || req.headers.get("x-real-ip") || "unknown";
}
