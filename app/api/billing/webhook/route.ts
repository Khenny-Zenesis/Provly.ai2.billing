import { NextResponse } from "next/server";
import { verifyWebhookSignature, webhookSecret } from "@/lib/payments/webhookVerify";
import { handleVerifiedWebhook } from "@/lib/payments/subscriptions";

// R2.4 — signature verification is the very FIRST thing that happens here.
// Nothing in the payload is read or acted on until the webhook is proven to be
// genuine. An unverified webhook is rejected before its body is ever parsed.
export async function POST(request: Request) {
  const verifHash = request.headers.get("verif-hash");
  if (!verifyWebhookSignature(verifHash, webhookSecret())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Only now, verified, may the payload be trusted and parsed.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = (payload as { event?: string; data?: Record<string, unknown> }).event;
  const data = (payload as { data?: Record<string, unknown> }).data;

  const result = await handleVerifiedWebhook({
    providerId: String(data?.id ?? ""),
    providerTxRef: String(data?.tx_ref ?? ""),
    status: String(event ?? ""),
    amountMinor: Number(data?.amount ?? 0),
    currency: String(data?.currency ?? "NGN"),
  });

  return NextResponse.json({ ok: true, ...result });
}
