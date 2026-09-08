import { NextResponse } from "next/server";
import { cancelInputSchema } from "@/lib/validation/billingSchemas";
import { getSessionUserId } from "@/lib/auth/session";
import { cancelSubscriptionForUser } from "@/lib/payments/subscriptions";

// R2.7 — cancellation is idempotent and only runs after an explicit confirmation
// step (the `confirm: true` in the schema). Access is retained until the period
// end the user already paid for.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = cancelInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Confirmation required" }, { status: 400 });
  }

  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const sub = await cancelSubscriptionForUser(userId, parsed.data.reason);
    // R2.7 — surface the access-until date so the UI can show it.
    return NextResponse.json({
      status: sub.status,
      accessUntil: sub.currentPeriodEnd,
      reason: sub.cancelReason ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not cancel subscription" },
      { status: 500 }
    );
  }
}
