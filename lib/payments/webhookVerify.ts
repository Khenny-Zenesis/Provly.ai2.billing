import { timingSafeEqual } from "crypto";

// Flutterwave webhook signature verification. Called as the very FIRST step in
// /api/billing/webhook/route.ts — before any part of the payload is read or
// trusted. An unverified webhook is rejected before its body is ever parsed.
//
// Flutterwave's webhook carries a `verif-hash` header equal to the secret hash
// configured for the app (commonly the API secret key). We compare it to our
// configured secret. (Per the PRD note, re-confirm the exact header/method
// against Flutterwave's current docs when wiring the live webhook.)

export function verifyWebhookSignature(
  verifHashHeader: string | null | undefined,
  expectedSecret: string | null | undefined
): boolean {
  if (!expectedSecret || !verifHashHeader) {
    return false;
  }

  const provided = Buffer.from(verifHashHeader);
  const expected = Buffer.from(expectedSecret);

  // Different lengths would just fall through the constant-time compare anyway,
  // but reject early for clarity.
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

export function webhookSecret(): string | null {
  return process.env.FLW_WEBHOOK_SECRET ?? process.env.FLW_SECRET_KEY ?? null;
}
