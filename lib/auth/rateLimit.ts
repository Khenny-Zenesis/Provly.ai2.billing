// Simple in-memory sliding-window rate limiter used to protect the
// checkout-initiation endpoint (R2.9). Keyed by caller identifier (e.g. client
// IP or userId).
//
// LIMITATION (documented): state lives in process memory — it resets on restart
// and isn't shared across multiple instances. Acceptable for this standalone,
// single-instance slice; a production deployment would use a shared store (e.g.
// Redis) keyed the same way.

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  { max = MAX_REQUESTS, windowMs = WINDOW_MS }: { max?: number; windowMs?: number } = {}
): RateLimitResult {
  const now = Date.now();

  const bucket = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (bucket.length >= max) {
    buckets.set(key, bucket);
    const retryAfterSec = Math.ceil((bucket[0] + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: max - bucket.length, retryAfterSec: 0 };
}
