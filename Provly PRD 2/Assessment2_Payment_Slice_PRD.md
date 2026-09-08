# Assessment 2 — Payment and Subscription Slice — PRD

## 1. What this is

A standalone, working subscription system in test mode: one paid plan, sold on two billing intervals (monthly and yearly). This is its own repository, entirely separate from Assessment 1 — reusing Assessment 1's auth code by copying it in is allowed and expected, but the two must never be the same live project or share a live connection.

**This is the largest of the four assessments (20-26 hours). Budget real time for it, and start it with a clear head, not as an afterthought.**

**This is not a real store.** No landing page, no pricing marketing page, no product features actually gated behind the paywall. The thing being sold is a plan flag on a user record — nothing more. Building anything beyond the five named screens actively hurts the grade, same rule as Assessment 1.

## 2. Tech stack

**Locked (unchanged from Assessment 1)**: Next.js (App Router), TypeScript, Prisma, PostgreSQL, built in Antigravity.

**Payment provider (confirmed — matches what was demonstrated in class)**: Flutterwave, test mode. Note: Flutterwave's webhook and signature-verification documentation is less extensively documented than Stripe's for this exact "fire the same webhook twice" testing pattern — budget a bit of extra investigation time for R2.4 and the duplicate-webhook evidence specifically, and confirm the exact signature-verification method (usually a hash comparison using your secret key) directly against Flutterwave's current docs before implementing.

## 3. Screens (exactly these, nothing more)

1. **Plans view** — shows free, monthly, and yearly, with the user's current plan clearly indicated.
2. **Checkout initiation** — hands off to Stripe's checkout flow.
3. **Return view** — where the user lands after paying.
4. **Billing view** — shows plan, status, renewal date, and a cancel control.
5. **Minimal signed-in shell** — just enough to hang the above on (reuse Assessment 1's auth for the signed-in user).

## 4. Behavior requirements

- A user can subscribe to the monthly plan.
- A user can upgrade from monthly to yearly mid-cycle, with the amount charged correctly prorated.
- A user can downgrade, with the change taking effect at the end of the current paid period, not immediately.
- A user can cancel, and retains access until the period they already paid for ends.
- Every payment event is recorded — not just the current status.

## 5. Engineering requirements (all required, all graded)

- **R2.1** — Money stored as whole numbers in minor units (e.g. cents/kobo), with the currency stored alongside. Never a decimal, anywhere.
- **R2.2** — A payment log table recording every event as its own row: initiation, verification, fulfilment, failure. This is separate from the subscription's current status field — the log is the history, the status is just the present.
- **R2.3** — Server-side verification before any entitlement is granted. Never grant access based on a frontend claim or a redirect URL alone — a user landing on the "success" page must not be what grants the subscription.
- **R2.4** — Webhook handling with signature verification before any processing. An unverified webhook must be rejected before its payload is trusted at all.
- **R2.5** — Idempotency keyed on the payment provider's reference ID, so a webhook fired twice is recorded once and acted on once.
- **R2.6** — Proration calculated and shown on a mid-cycle interval change, with the actual arithmetic (days remaining, credit applied, amount charged) reproducible and correct to the day.
- **R2.7** — Cancellation retains access through the end of the paid period, with a confirmation step before it's finalized.
- **R2.8** — A cancellation reason column, populated from an optional post-cancellation prompt.
- **R2.9** — Rate limiting on the checkout-initiation endpoint.
- **R2.10** — No path in the payment flow ever leaves a user on a blank page or a 404 — every failure state is a real, handled UI state.
- **R2.11** — No card details stored anywhere in this system, at any point.

## 6. Concepts to be able to explain (Section 5 of documentation)

For each, be ready to answer: what it is, why it's needed (with a concrete failure case), how it was implemented (file/function named), and what alternative was rejected and why:

- Minor units, and why money is never a decimal
- The payment lifecycle: initiation, verification, fulfilment — and why they're three separate things, not one
- The payment log, and specifically what it would prove in a real dispute
- Idempotency in payments
- Webhook signature verification
- Proration — with your actual calculation shown using real numbers
- Cancellation and period-end access, including the legal/fairness reasoning behind it
- Why cards are never stored, naming PCI scope specifically
- Rate limiting on payment endpoints

## 7. Evidence to capture WHILE building, not after

- Screenshot of the subscription record **before and after** an upgrade — interval changed, period end moved.
- Screenshot of the payment log for one complete transaction, showing each stage as its own row with real timestamps.
- Your proration calculation written out with real numbers: days remaining, credit applied, amount charged — plus the log entries that resulted.
- Evidence of firing the **same webhook twice** — showing the second one recorded but not acted on again.
- Screenshot of a cancelled subscription showing access retained and the correct period-end date.

## 8. Keep a running log as you build

Same discipline as Assessment 1 — Section 6 of the documentation needs a minimum of 3 real problems, each with symptom, investigation (including dead ends), cause, and fix. Write these down the moment they happen.

## 9. Known traps (from the assignment itself)

- Storing amounts as decimals.
- Granting the subscription the moment a user lands on the success URL — meaning anyone who visits that URL directly gets a free subscription. This is the single most important trap in this entire assessment.
- Cancelling with an immediate cutoff after payment was already taken for the full period.
- Skipping the payment log because the subscription table already shows a status — the log and the status answer different questions, and only the log answers "what happened three months ago."
- Testing only the happy path and never firing a duplicate webhook to see what actually happens.

## 10. Defence questions to prepare for

- Show the exact line where entitlement is granted, and explain what happens if that code path is reached directly in the browser.
- A customer disputes a charge from three months ago — what gets shown to them, and where does it come from?
- Walk through the proration arithmetic for an upgrade on day 12 of a 30-day cycle.
- Pay for yearly twice in one minute — what does the database look like afterward?
