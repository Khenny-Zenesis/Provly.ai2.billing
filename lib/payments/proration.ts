// Pure proration arithmetic. NO database or network calls in here — it must be
// directly showable and testable in isolation, so the R2.6 numbers (days
// remaining / credit applied / amount charged) are reproducible and correct to
// the day.
//
// Money is handled entirely in minor units (integers). All figures are derived
// integers; nothing here is a floating-point decimal.

const MS_PER_DAY = 86_400_000;

export interface ProrationParams {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /** The moment the interval change is being calculated (defaults to now). */
  asOf: Date;
  /** Full price of the interval currently being paid, in minor units. */
  currentPriceMinor: number;
  /** Full price of the new/target interval, in minor units. */
  targetPriceMinor: number;
}

export interface ProrationResult {
  /** Total days in the current paid period. */
  daysInPeriod: number;
  /** Days of the current period still unused at `asOf`. */
  daysRemaining: number;
  /** Prorated credit for the unused days, in minor units. */
  creditMinor: number;
  /** Full price of the target interval, in minor units. */
  targetPriceMinor: number;
  /** What the customer is charged now = target price minus credit. */
  amountDueMinor: number;
}

export function computeProration(params: ProrationParams): ProrationResult {
  const { currentPeriodStart, currentPeriodEnd, asOf, currentPriceMinor, targetPriceMinor } = params;

  // "Correct to the day": we count days from the actual stored period dates,
  // not from an assumed 30-day month. A 31-day run yields 31, a Feb run the
  // real count, and so on.
  const daysInPeriod = Math.max(
    1,
    Math.round((currentPeriodEnd.getTime() - currentPeriodStart.getTime()) / MS_PER_DAY)
  );

  const rawRemaining = (currentPeriodEnd.getTime() - asOf.getTime()) / MS_PER_DAY;
  const daysRemaining = Math.min(daysInPeriod, Math.max(0, Math.ceil(rawRemaining)));

  // Credit is the fraction of the period left, applied to what was paid.
  const creditMinor = Math.round((daysRemaining / daysInPeriod) * currentPriceMinor);

  // An upgrade does not refund more than it costs; clamp at zero.
  const amountDueMinor = Math.max(0, targetPriceMinor - creditMinor);

  return { daysInPeriod, daysRemaining, creditMinor, targetPriceMinor, amountDueMinor };
}
