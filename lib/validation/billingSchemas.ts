import { z } from "zod";
import { BillingInterval } from "@prisma/client";

// Input validation for route handlers. Route handlers stay thin and call into
// /lib; these schemas define the trusted boundary of what a request may carry.

export const checkoutInputSchema = z.object({
  plan: z.literal("pro"),
  interval: z.nativeEnum(BillingInterval),
});
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export const cancelInputSchema = z.object({
  // R2.7 — cancellation requires an explicit confirmation step; confirmation
  // must literally be true, otherwise the request is rejected and no action is
  // taken.
  confirm: z.literal(true),
  reason: z.string().max(500).optional(),
});
export type CancelInput = z.infer<typeof cancelInputSchema>;
