import { NextResponse } from "next/server";
import { checkoutInputSchema } from "@/lib/validation/billingSchemas";
import { getSessionUserId } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rateLimit";
import { planCheckoutForUser } from "@/lib/payments/subscriptions";

// R2.9 — checkout initiation is rate-limited. We key on the caller's IP so a
// burst of requests can't hammer the payment provider.
function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : request.headers.get("x-real-ip") ?? "unknown";
  return ip;
}

export async function POST(request: Request) {
  const limiter = rateLimit(clientKey(request));
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = checkoutInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const result = await planCheckoutForUser(userId, parsed.data.interval);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start checkout" },
      { status: 500 }
    );
  }
}
