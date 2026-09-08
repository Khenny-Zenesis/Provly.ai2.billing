import type { BillingInterval } from "@prisma/client";

// This slice sells exactly one paid plan, on exactly two intervals.
// Amounts are whole numbers in minor units (kobo for NGN) — never a decimal.
// See R2.1 and AGENTS.md Section 2 ("one paid plan, two intervals").

export const CURRENCY = "NGN" as const;

export const PAID_PLAN_ID = "pro" as const;
export const PAID_PLAN_NAME = "Provly Pro" as const;

// Minor units per interval. For NGN, 1 naira = 100 kobo.
// Monthly: ₦3,000 = 300000 kobo. Yearly: ₦30,000 = 3000000 kobo.
export const PRICE_MINOR: Record<BillingInterval, number> = {
  MONTHLY: 300000,
  YEARLY: 3000000,
};

export function isPlanId(value: string): value is typeof PAID_PLAN_ID {
  return value === PAID_PLAN_ID;
}

export function priceMinorFor(interval: BillingInterval): number {
  return PRICE_MINOR[interval];
}
