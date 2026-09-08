import { randomUUID } from "crypto";
import type { BillingInterval, Subscription, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { CURRENCY, PAID_PLAN_ID, priceMinorFor } from "./plans";
import { computeProration } from "./proration";
import {
  initiateCheckout as flwInitiateCheckout,
  verifyTransaction as flwVerifyTransaction,
  verifyTransactionByReference as flwVerifyByReference,
} from "./flutterwave";

// The business layer. Route handlers stay thin and call into here. Money is
// handled in minor units end-to-end (R2.1) and entitlement is only ever granted
// after the payment is verified server-side (R2.3) — never on a redirect alone.

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const NGN = CURRENCY;

function addInterval(interval: BillingInterval, from: Date): Date {
  const d = new Date(from);
  if (interval === "YEARLY") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

export async function getSubscriptionForUser(userId: string): Promise<Subscription | null> {
  return prisma.subscription.findUnique({ where: { userId } });
}

// Applies a period-end transition that has already come due. This is what keeps
// downgrade and cancellation genuinely distinct:
//   - a scheduled downgrade (`nextInterval` set) switches the interval, starts a
//     new period, stays ACTIVE, and continues billing — it never expires access;
//   - a cancellation (status CANCEL_PENDING) simply expires access at period end
//     and stops billing.
// Called lazily whenever a subscription is read so the visible state is current.
export async function getLiveSubscription(userId: string): Promise<Subscription | null> {
  const sub = await getSubscriptionForUser(userId);
  if (!sub) return null;

  const now = new Date();

  // Downgrade came due: switch interval and keep the plan active/billing.
  if (sub.nextInterval && now >= sub.currentPeriodEnd) {
    const next = sub.nextInterval;
    const periodStart = sub.currentPeriodEnd;
    return prisma.subscription.update({
      where: { userId },
      data: {
        interval: next,
        nextInterval: null,
        status: "ACTIVE",
        cancelReason: null,
        amountMinor: priceMinorFor(next),
        currency: NGN,
        currentPeriodStart: periodStart,
        currentPeriodEnd: addInterval(next, periodStart),
      },
    });
  }

  // Cancellation came due: access ends, no further billing.
  if (sub.status === "CANCEL_PENDING" && now >= sub.currentPeriodEnd) {
    return prisma.subscription.update({
      where: { userId },
      data: { status: "EXPIRED" },
    });
  }

  return sub;
}

// The full payment history for a user, oldest first. This is what a real dispute
// would be shown (R2.2) — each event is its own row.
export async function getPaymentLogForUser(userId: string) {
  return prisma.paymentLog.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

// Determine whether the chosen interval is an upgrade, downgrade, or same, by
// comparing prices in minor units (higher price = more expensive interval).
function direction(current: BillingInterval, target: BillingInterval): "upgrade" | "downgrade" | "same" {
  const c = priceMinorFor(current);
  const t = priceMinorFor(target);
  if (t > c) return "upgrade";
  if (t < c) return "downgrade";
  return "same";
}

export type PlanCheckoutResult =
  | { kind: "checkout"; checkoutUrl: string; txRef: string; amountMinor: number }
  | { kind: "scheduled"; effectiveDate: Date };

// Entry point for the checkout-initiation endpoint. Routes a request to the
// right outcome: a fresh subscribe, an in-place extension, a prorated upgrade
// (R2.6), or a downgrade that's scheduled to apply at period end (no charge).
export async function planCheckoutForUser(
  userId: string,
  interval: BillingInterval
): Promise<PlanCheckoutResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  // Reflect any period-end transition (a pending downgrade switching over, or a
  // cancellation expiring access) before deciding what to do next.
  const sub = await getLiveSubscription(userId);
  const fullPrice = priceMinorFor(interval);

  // Fresh subscription: charge the full price for the chosen interval.
  if (!sub || sub.status === "EXPIRED") {
    return startCheckout(user, interval, fullPrice);
  }

  // Active subscription: decide based on relative price of the two intervals.
  const dir = direction(sub.interval, interval);

  // DOWNGRADE: a distinct behaviour, never a cancellation. Record the target
  // (cheaper) interval in `nextInterval`, keep the subscription ACTIVE and
  // billing, and switch over automatically at period end (R2.6/R2.7). This path
  // must never set CANCEL_PENDING nor stop billing.
  if (dir === "downgrade") {
    await prisma.subscription.update({
      where: { userId },
      data: {
        nextInterval: interval,
        status: "ACTIVE",
        cancelReason: null,
      },
    });
    return { kind: "scheduled", effectiveDate: sub.currentPeriodEnd };
  }

  // Same interval, or reactivating a cancelled plan: charge the full price.
  if (dir === "same" || sub.status === "CANCEL_PENDING") {
    return startCheckout(user, interval, fullPrice);
  }

  // Upgrade mid-cycle: prorate. Credit the unused portion of the current period
  // against the new, higher price. Numbers are real and day-accurate (R2.6).
  const prorated = computeProration({
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    asOf: new Date(),
    currentPriceMinor: priceMinorFor(sub.interval),
    targetPriceMinor: fullPrice,
  });

  return startCheckout(user, interval, prorated.amountDueMinor);
}

async function startCheckout(
  user: { id: string; email: string; name: string | null },
  interval: BillingInterval,
  amountMinor: number
): Promise<PlanCheckoutResult> {
  const txRef = `provly-${randomUUID()}`;

  await prisma.paymentLog.create({
    data: {
      userId: user.id,
      eventType: "INITIATION",
      providerId: txRef, // no Flutterwave id yet — the tx_ref is our reference for now
      providerTxRef: txRef,
      amountMinor,
      currency: NGN,
      interval,
      plan: PAID_PLAN_ID,
      detail: "checkout initiated",
    },
  });

  const { checkoutUrl } = await flwInitiateCheckout({
    txRef,
    amountMinor,
    customer: { email: user.email, name: user.name ?? user.email },
    redirectUrl: `${APP_URL}/return?tx_ref=${txRef}`,
  });

  return { kind: "checkout", checkoutUrl, txRef, amountMinor };
}

interface IncomingWebhookPayment {
  providerId: string;
  providerTxRef: string;
  status: string;
  amountMinor: number;
  currency: string;
}

// Called from the webhook route AFTER the signature has been verified. Rejects
// silently if the same provider transaction was already processed (R2.5), verifies
// with Flutterwave, then and only then grants access (R2.3 / R2.4).
export async function handleVerifiedWebhook(payment: IncomingWebhookPayment): Promise<{
  handled: boolean;
  duplicate: boolean;
  granted: boolean;
}> {
  // R2.5 — idempotency: a webhook fired twice must be acted on once. The unique
  // (eventType, providerId) is a backstop; we short-circuit here to avoid doing
  // any work (and any side effects) a second time.
  const already = await prisma.paymentLog.findUnique({
    where: { eventType_providerId: { eventType: "FULFILMENT", providerId: payment.providerId } },
  });
  if (already) {
    return { handled: true, duplicate: true, granted: false };
  }

  // Identify the checkout this corresponds to via our tx_ref.
  const initiation = await prisma.paymentLog.findFirst({
    where: { providerTxRef: payment.providerTxRef, eventType: "INITIATION" },
  });
  if (!initiation) {
    await prisma.paymentLog.create({
      data: {
        eventType: "FAILURE",
        providerId: payment.providerId,
        providerTxRef: payment.providerTxRef,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        detail: "webhook for unknown checkout reference",
      },
    });
    return { handled: true, duplicate: false, granted: false };
  }

  // An initiation always carries a user; if one doesn't, we cannot attribute or
  // grant anything for it.
  if (!initiation.userId) {
    await prisma.paymentLog.create({
      data: {
        eventType: "FAILURE",
        providerId: payment.providerId,
        providerTxRef: payment.providerTxRef,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        detail: "webhook for unattributable checkout",
      },
    });
    return { handled: true, duplicate: false, granted: false };
  }

  // Independently verify with Flutterwave before trusting the webhook payload.
  let verified;
  try {
    verified = await flwVerifyTransaction(Number(payment.providerId));
  } catch {
    await prisma.paymentLog.create({
      data: {
        userId: initiation.userId,
        subscriptionId: null,
        eventType: "FAILURE",
        providerId: payment.providerId,
        providerTxRef: payment.providerTxRef,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        detail: "webhook verification failed",
      },
    });
    return { handled: true, duplicate: false, granted: false };
  }

  if (verified.status !== "successful" || verified.amountMinor !== initiation.amountMinor) {
    await prisma.paymentLog.create({
      data: {
        userId: initiation.userId,
        eventType: "FAILURE",
        providerId: payment.providerId,
        providerTxRef: payment.providerTxRef,
        amountMinor: verified.amountMinor,
        currency: verified.currency,
        detail: "payment not successful or amount mismatch",
      },
    });
    return { handled: true, duplicate: false, granted: false };
  }

  const interval = initiation.interval ?? "MONTHLY";
  await grantAccess(initiation.userId, interval);

  await prisma.paymentLog.create({
    data: {
      userId: initiation.userId,
      subscriptionId: (await getSubscriptionForUser(initiation.userId))?.id ?? null,
      eventType: "FULFILMENT",
      providerId: payment.providerId,
      providerTxRef: payment.providerTxRef,
      amountMinor: verified.amountMinor,
      currency: verified.currency,
      interval,
      plan: PAID_PLAN_ID,
      detail: "payment verified; access granted",
    },
  });

  return { handled: true, duplicate: false, granted: true };
}

// Used by the return screen: independently verify the transaction server-side
// and only grant if that verification succeeds (R2.3). The user simply landing
// on /return never grants anything on its own.
export async function verifyAndGrantAfterReturn(txRef: string): Promise<{
  granted: boolean;
  status: "ok" | "pending" | "failed";
}> {
  const initiation = await prisma.paymentLog.findFirst({
    where: { providerTxRef: txRef, eventType: "INITIATION" },
  });
  if (!initiation) return { granted: false, status: "failed" };
  if (!initiation.userId) return { granted: false, status: "failed" };

  let verified;
  try {
    verified = await flwVerifyByReference(txRef);
  } catch {
    await logFailure(initiation.userId, txRef, "verification request failed");
    return { granted: false, status: "failed" };
  }

  if (verified.status !== "successful") {
    await logFailure(initiation.userId, txRef, "payment not successful");
    return { granted: false, status: "failed" };
  }
  if (verified.amountMinor !== initiation.amountMinor) {
    await logFailure(initiation.userId, txRef, "amount mismatch");
    return { granted: false, status: "failed" };
  }

  // Idempotent: if already granted for this provider id, report ok.
  const already = await prisma.paymentLog.findUnique({
    where: {
      eventType_providerId: { eventType: "FULFILMENT", providerId: String(verified.providerId) },
    },
  });
  if (already) return { granted: true, status: "ok" };

  const interval = initiation.interval ?? "MONTHLY";
  await grantAccess(initiation.userId, interval);

  await prisma.paymentLog.create({
    data: {
      userId: initiation.userId,
      subscriptionId: (await getSubscriptionForUser(initiation.userId))?.id ?? null,
      eventType: "FULFILMENT",
      providerId: String(verified.providerId),
      providerTxRef: txRef,
      amountMinor: verified.amountMinor,
      currency: verified.currency,
      interval,
      plan: PAID_PLAN_ID,
      detail: "payment verified; access granted",
    },
  });

  return { granted: true, status: "ok" };
}

async function logFailure(userId: string, txRef: string, detail: string): Promise<void> {
  await prisma.paymentLog.create({
    data: {
      userId,
      eventType: "FAILURE",
      providerId: txRef,
      providerTxRef: txRef,
      amountMinor: 0,
      currency: NGN,
      detail,
    },
  });
}

// Applies the entitlement. Only reachable after a successful verify. Determines
// whether this is a new subscription, an extension, an in-place upgrade, or a
// reactivation of a cancelled one.
async function grantAccess(userId: string, interval: BillingInterval): Promise<void> {
  const now = new Date();
  const sub = await getSubscriptionForUser(userId);

  if (!sub || sub.status === "EXPIRED") {
    await prisma.subscription.create({
      data: {
        userId,
        plan: PAID_PLAN_ID,
        interval,
        status: "ACTIVE",
        amountMinor: priceMinorFor(interval),
        currency: NGN,
        currentPeriodStart: now,
        currentPeriodEnd: addInterval(interval, now),
      },
    });
    return;
  }

  if (sub.status === "CANCEL_PENDING") {
    // Reactivated: clear the pending cancellation and start a fresh period.
    await prisma.subscription.update({
      where: { userId },
      data: {
        status: "ACTIVE",
        cancelReason: null,
        nextInterval: null,
        interval,
        amountMinor: priceMinorFor(interval),
        currency: NGN,
        currentPeriodStart: now,
        currentPeriodEnd: addInterval(interval, now),
      },
    });
    return;
  }

  if (sub.interval === interval) {
    // Same interval again: extend the current period from its end so paying
    // twice in a minute adds a full extra interval (not a reset).
    await prisma.subscription.update({
      where: { userId },
      data: {
        status: "ACTIVE",
        currentPeriodEnd: addInterval(interval, sub.currentPeriodEnd),
      },
    });
    return;
  }

  // In-place interval change (upgrade): apply immediately, reset the billing
  // cycle to the new interval, and clear any pending downgrade. Also reactivates
  // if the subscription had been cancelled — a paying user is by definition
  // active again, so a prior CANCEL_PENDING must not stick (R2.7).
  await prisma.subscription.update({
    where: { userId },
    data: {
      status: "ACTIVE",
      cancelReason: null,
      interval,
      nextInterval: null,
      amountMinor: priceMinorFor(interval),
      currency: NGN,
      currentPeriodStart: now,
      currentPeriodEnd: addInterval(interval, now),
    },
  });
}

// Cancellation with access retained to the end of the paid period (R2.7) and an
// optional reason (R2.8). The route/enforced confirmation step happens before
// this is called.
export async function cancelSubscriptionForUser(
  userId: string,
  reason: string | undefined
): Promise<Subscription> {
  const sub = await getSubscriptionForUser(userId);
  if (!sub) throw new Error("No subscription to cancel");

  if (sub.status === "CANCEL_PENDING") {
    return sub; // already cancelled; no double action
  }

  return prisma.subscription.update({
    where: { userId },
    data: {
      status: "CANCEL_PENDING",
      cancelReason: reason ?? sub.cancelReason,
      // A cancellation supersedes any scheduled downgrade — the user wants out.
      nextInterval: null,
      // NB: currentPeriodEnd is left untouched — access is retained until then.
    },
  });
}
