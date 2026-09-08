# Assessment 2 — Payment and Subscription Slice — Documentation

## Section 1: What This Is

This project is a standalone subscription and billing system in test mode, built on Flutterwave: a plans view, checkout, a return screen handling server-side payment verification, and a billing view supporting upgrade, downgrade, and cancellation — for a single paid plan sold on two billing intervals, monthly and yearly.

This is deliberately not a real store. There is no landing page, no pricing marketing page, and no actual product features gated behind the paywall — the thing being sold is a plan flag on a user record, nothing more. Authentication is reused from Assessment 1 by copying the relevant files in, not by sharing a live connection between the two projects.

## Section 2: How To Run It

1. https://github.com/Khenny-Zenesis/Provly.ai2.billing
2.  `npm install`
3. # Flutterwave — test mode
# Flutterwave — test mode
FLW_SECRET_KEY=FLWSECK_TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FLW_PUBLIC_KEY=FLWPUBK_TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_FLW_PUBLIC_KEY=FLWPUBK_TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# PostgreSQL (Prisma)
DATABASE_URL=postgresql://user:password@localhost:5432/provly_payment

5. Start command: `npm run dev`
6. URL where it appears: `http://localhost:3001/plans`

## Section 3: The Flow, Step By Step

**Subscribing.** A signed-in user visits the plans view and selects monthly or yearly. This calls `POST /api/billing/checkout`, which is rate-limited (R2.9) and records an `INITIATION` row in `PaymentLog` with the correctly-converted amount before handing off to Flutterwave's hosted checkout page. The user enters test card details directly on Flutterwave's page — this project never sees or touches that data (R2.11). On completion, Flutterwave redirects back to the return view with a transaction reference.

**Verification and fulfilment.** The return view does not trust the redirect alone. It calls Flutterwave's verification API server-side with the transaction reference, compares the verified amount against what was recorded at initiation, and only creates a `FULFILMENT` row and updates the `Subscription` if that check passes (R2.3). This exact check was what correctly rejected an attempt to reach the return page without a real payment, confirmed directly by testing.

**Webhooks.** Independently of the return-view flow, Flutterwave also sends an asynchronous webhook to `POST /api/billing/webhook` confirming the transaction. This handler verifies the request's signature before reading anything from the payload (R2.4), then checks whether a `FULFILMENT` row already exists for that provider transaction ID — enforced by the database's `@@unique([eventType, providerId])` constraint — before acting. Firing the same webhook twice was tested directly: the second call correctly returned `duplicate:true, granted:false`, with no second row created.

**Upgrade (with proration).** From the billing view, choosing to upgrade from monthly to yearly triggers a new checkout, but the amount charged is the yearly price minus a credit for the unused portion of the current period, calculated in `lib/payments/proration.ts`. This was verified directly against a hand calculation and matched exactly.

**Downgrade.** Requesting a downgrade does not create an immediate charge or change. It sets `nextInterval` on the current `Subscription` row, leaving `status` as `ACTIVE` and the current `interval` unchanged. The actual switch is applied lazily — the first time `getLiveSubscription` runs after the current period has ended, at which point a new period starts on the cheaper interval and billing continues.

**Cancellation.** From the billing view, cancelling requires a confirmation step and accepts an optional reason (R2.8). This sets `status` to `CANCEL_PENDING` and clears any pending `nextInterval`, so a cancellation can't be silently overridden by an earlier scheduled downgrade. Access remains active through `currentPeriodEnd` — confirmed directly by testing, which returned "Access is retained until [date]. Your subscription will automatically end on that date without further charges."

## Section 4: The Data Model

**User** — minimal, reused structure from Assessment 1 so the copied auth logic has a real user to operate on. Field names were reconciled against the Assessment 1 schema when the auth files were copied in.

**Subscription** — one row per user, representing their *current* state only.
- `plan` (String): a single fixed plan identifier — this project intentionally sells one plan, not a flexible catalog, so a simple string is enough rather than a separate Plan table.
- `interval` (`BillingInterval` enum: MONTHLY/YEARLY): what the user is currently billed on.
- `nextInterval` (`BillingInterval?`, nullable): the pending downgrade target, applied automatically once the current period ends. This field exists specifically because of a real bug found during testing — downgrade was originally implemented by reusing the same cancellation status, which meant requesting a downgrade would have silently ended the subscription entirely instead of switching plans. Giving downgrade its own field, separate from `status`, is what makes cancel and downgrade genuinely distinguishable in the database rather than just differently labeled in the UI.
- `status` (`SubscriptionStatus` enum: ACTIVE/CANCEL_PENDING/EXPIRED): using an enum rather than a free-text string means the database itself rejects any value outside these three defined states — no typo'd status can ever be silently stored.
- `amountMinor` (Int) + `currency` (String): money stored as a whole number in minor units, currency stored alongside it (R2.1). An `Int` type makes storing a fractional or decimal amount a type error, not just a convention someone has to remember to follow.
- `@@unique([userId])`: one current subscription row per user, enforced at the database level.

**PaymentLog** — one row per payment event; this is the full auditable history, deliberately separate from `Subscription`'s current-state snapshot (R2.2). If a real customer disputed a charge, this table — not the Subscription row — is what would be shown to them.
- `providerId` vs. `providerTxRef`: two different identifiers, intentionally. `providerTxRef` is generated by this system at checkout, before it's known whether payment will succeed, and is used to correlate the return-URL flow. `providerId` is Flutterwave's own transaction identifier, issued once a real transaction exists, and is what's used as the idempotency key for webhooks specifically (R2.5).
- `eventType` (enum: INITIATION/VERIFICATION/FULFILMENT/FAILURE): every stage of a payment's lifecycle gets its own row rather than overwriting a single status field.
- `subscriptionId` and `userId` are both nullable: a payment log row can exist — specifically an INITIATION event — before any Subscription row exists yet, for a brand-new subscriber. `userId` is also kept directly on the log (not only reachable through the subscription relation) so history stays attributable even independent of the subscription's own lifecycle.
- `@@unique([eventType, providerId])`: this is the real, database-level enforcement of idempotency. The same webhook event (same provider transaction, same event type) cannot produce two rows — a repeated insert fails at the database level, which is the actual backstop behind R2.5, not just the application-level existence check that runs before it.

**Which constraints make an invalid state impossible:**
- `Subscription.@@unique([userId])` — makes it impossible for a user to ever have two simultaneous "current" subscription rows.
- `PaymentLog.@@unique([eventType, providerId])` — makes it impossible for the same webhook event to be recorded twice, regardless of what the application code does or fails to check first. This directly mirrors the role `User.email @unique` played in Assessment 1.
- `amountMinor` typed as `Int`, never `Decimal` or `Float` — makes storing a fractional minor-unit value a type error, closing off an entire class of floating-point money bugs before they can happen.
- `status` and `eventType` as enums rather than free strings — makes storing any value outside the explicitly defined set impossible.

**Honest limitation**: nothing in the schema enforces that `currentPeriodEnd` is actually later than `currentPeriodStart`, or that `nextInterval` differs from the current `interval`. Both are real logical invariants, but they're enforced only in application code, not by a database-level check constraint, for this slice.

## Section 5: The Concepts

### Minor Units and Why Money Is Never a Decimal

**What it is.** Storing a monetary amount as a whole number in the smallest unit of its currency (kobo, not naira) rather than as a decimal.

**Why it is needed.** Decimal and floating-point number types can't represent every fraction exactly in binary, which means repeated arithmetic on decimal money values can silently drift by fractions of a unit — a well-known, real source of accounting bugs. Storing whole minor units avoids that entire class of error.

**How I implemented it.** `amountMinor` is typed as `Int` throughout the schema, with `currency` stored alongside it. This surfaced a real, serious bug during testing: the amount was correctly stored as minor units internally, but was sent to Flutterwave's checkout API *as-is* rather than converted back to major units first — Flutterwave expects naira for that specific call, not kobo. A ₦3,000 charge was sent as `300000`, which Flutterwave read as ₦300,000, a 100x overcharge on a real test transaction. The fix converts at the API boundary only, in both directions: dividing by 100 when initiating a charge, multiplying by 100 when reading Flutterwave's verification response back — while internal storage and the payment log remain in minor units throughout.

**What I chose against, and why.** I could have stored amounts as a `Decimal` or `Float` type and trusted the database or the provider to handle precision correctly. I rejected this because it reintroduces exactly the rounding-error risk minor units exist to avoid, for no real benefit — an `Int` type makes the invalid representation impossible by construction rather than by convention.

### The Payment Lifecycle — Initiation, Verification, Fulfilment

**What it is.** Three distinct stages of a single payment, each recorded separately: initiation (checkout starts), verification (the server independently confirms with the provider that payment actually succeeded), and fulfilment (entitlement is actually granted).

**Why it is needed.** Treating these as one step is exactly what causes the most dangerous trap in this whole assessment: granting a subscription the moment a user lands on a "success" URL, without the server ever independently confirming payment happened. Someone could simply visit that URL directly and get free access. Separating the stages means entitlement is only ever granted after the middle step — verification — genuinely passes.

**How I implemented it.** Each stage produces its own `PaymentLog` row via the `PaymentEventType` enum (INITIATION/VERIFICATION/FULFILMENT/FAILURE). The return view calls Flutterwave's verification API server-side and only proceeds to fulfilment if the verified amount matches what was recorded at initiation. This was tested directly by visiting the return URL with a reference from a payment that was initiated but never actually completed — the server correctly returned "Verification Unsuccessful... No subscription access was granted."

**What I chose against, and why.** I could have granted access directly inside the return view based on the redirect alone, which is simpler and was, in fact, the trap the brief explicitly warns against. I rejected it because a redirect is just a URL a browser was sent to — it proves nothing about whether a real payment happened, and it's the single most named failure mode in the entire assignment.

### The Payment Log

**What it is.** An append-only table recording every payment-related event as its own row, separate from `Subscription`, which only holds the current state.
![Evidence - Payment Log - records every payment-related event as its own row - shows history of payments](./provly-evidence/payment-log.png)

**Why it is needed.** A status field only answers "what's true right now." If a real customer disputed a charge from months ago, a status field has already forgotten the history — the log is the only thing that could actually answer "what happened, and when."

**How I implemented it.** Every checkout, verification, fulfilment, and failure writes a new row to `PaymentLog`, never overwriting a previous one. Directly demonstrated: after the amount-conversion bug, both the original incorrect attempt and the corrected transaction remain visible as separate historical rows, rather than one row being silently overwritten.

**What I chose against, and why.** I could have relied on `Subscription`'s status field alone and treated a separate log as redundant. I rejected this because status and history answer genuinely different questions, and conflating them was explicitly named as a trap in the brief — skipping the log "because the subscription table already shows a status" was called out directly as a mistake to avoid.

### Idempotency in Payments

**What it is.** Processing the same payment event exactly once, even if the notification for it arrives more than once — which happens routinely with webhooks, since providers commonly retry delivery.

**Why it is needed.** Without it, a retried webhook could grant a subscription twice, extend a period twice, or otherwise double-apply an event that should only count once.

**How I implemented it.** `PaymentLog` has a database-level `@@unique([eventType, providerId])` constraint — the real backstop, not just an application-level check. This was tested directly: firing the identical webhook payload twice against a real, previously-unfulfilled transaction resulted in the first call granting access and recording `FULFILMENT`, and the second call returning `{"ok":true,"handled":true,"duplicate":true,"granted":false}` with no second row created.

**What I chose against, and why.** I could have relied only on an application-level check ("does a log row already exist for this event?") before writing a new one, without the database constraint. I rejected this for the same reason Assessment 1's signup idempotency needed a database backstop — a check-then-write pattern has a real race-condition window when two requests arrive close together, and the constraint is what holds even if that window is hit.

### Webhook Signature Verification

**What it is.** Confirming that an incoming webhook request genuinely came from Flutterwave, using a shared secret, before trusting anything in its payload.

**Why it is needed.** A webhook endpoint is a public URL. Without signature verification, anyone who discovers that URL could send a fake "payment successful" event and potentially grant themselves a subscription for nothing.

**How I implemented it.** Every incoming webhook must include a `verif-hash` header, checked against the server's own `FLW_SECRET_KEY` before the payload is read for anything else. This was directly exercised during testing — including a real debugging episode where the check correctly rejected a request when the running dev server was still holding a stale, outdated version of the secret key after a fresh key had been added to `.env`. That failure was actually reassuring: it confirmed the check genuinely compares against the real configured secret, not something that can be bypassed by an unverified request.

**What I chose against, and why.** I could have processed webhook payloads without verifying their origin at all, trusting that the URL itself was obscure enough to be safe. I rejected this — an unguessable URL is not authentication, and the brief's own requirements make signature verification mandatory before any processing.

### Proration

**What it is.** Calculating a fair, partial charge when a user changes their billing interval mid-cycle — crediting them for the unused portion of what they already paid for.
![Evidence - Proration - crediting them for the unused portion of what they already paid for](./provly-evidence/proration.png)

**Why it is needed.** Without it, upgrading mid-cycle would either charge the full new price on top of an already-paid period (overcharging), or give the new period away free (undercharging).

**How I implemented it.** `lib/payments/proration.ts` is a pure function — no database or network calls inside it — calculating the credit from days remaining in the current period. Verified directly with real numbers: a 30-day monthly cycle (Sept 7 to Oct 7), upgraded to yearly (₦30,000) almost immediately after the cycle began, correctly credited the full ₦3,000 monthly price, producing a ₦27,000 charge — which matched an independent hand calculation exactly before the payment was made.

**What I chose against, and why.** I could have rounded proration to a simpler unit, like whole weeks or a flat percentage regardless of exact timing. I rejected this because the brief explicitly requires the calculation be "correct to the day," and a coarser approximation would either overcharge or undercharge users depending on where in the cycle they upgraded.

### Cancellation and Period-End Access

**What it is.** Ending a subscription's renewal while letting the user keep access through the period they already paid for, rather than cutting them off immediately.
![Evidence - Canceled but retains access until 8 sept 2027 - proves period-end access](./provly-evidence/cancel-subscription-2.png)


**Why it is needed.** A user who paid for a full month has a legitimate claim to that full month, whether or not they cancel on day one or day twenty-nine. Immediate cutoff after payment was already taken is explicitly named as a trap in the brief, for good reason — it would mean keeping money for a service no longer being provided.

**How I implemented it.** Cancelling sets `Subscription.status` to `CANCEL_PENDING` and requires a confirmation step before finalizing, with an optional reason captured (R2.8). Access itself remains gated on `currentPeriodEnd`, unaffected by the status change until that date passes. Confirmed directly by testing: cancelling produced "Access is retained until [period end date]. Your subscription will automatically end on that date without further charges."

**What I chose against, and why.** I initially had a real bug here worth being honest about: downgrade (switching to a cheaper interval) was implemented by reusing this same `CANCEL_PENDING` status, which meant a user trying to downgrade would have actually lost their subscription entirely instead of continuing on a cheaper plan. The fix gave downgrade its own field, `nextInterval`, kept separate from cancellation's status change — see Section 6.

### Why Cards Are Never Stored (PCI Scope)

**What it is.** Never allowing raw card numbers, CVVs, or expiry dates to pass through or be stored in this system at any point.

**Why it is needed.** Storing card data directly brings an application into PCI-DSS compliance scope — a serious, ongoing security and auditing burden meant for organizations built specifically to handle that responsibility. Avoiding it entirely, by never touching the data in the first place, avoids that scope altogether.

**How I implemented it.** Card entry happens entirely on Flutterwave's own hosted checkout page — this system only ever sends `tx_ref`, `amount`, `currency`, a redirect URL, and basic customer info (email, name); it never receives card details in any request. Verified directly against the actual database schema: no table contains a card, PAN, CVV, or expiry column, and no logging statement anywhere in the codebase writes a request payload to output.

**What I chose against, and why.** I could have built a custom card-entry form directly in this app for a more seamless-feeling checkout experience. I rejected this immediately — that path would pull raw card data through this system, triggering real PCI-DSS obligations for no meaningful benefit at this stage, when a hosted checkout page achieves the same outcome without ever taking on that exposure.

### Rate Limiting on Payment Endpoints

**What it is.** Capping how many checkout-initiation requests can be made in a given window, the same underlying mechanism used for auth endpoints in Assessment 1.

**Why it is needed.** An unprotected checkout-initiation endpoint could be hit repeatedly to spam Flutterwave with initiation requests, or probe the payment flow for weaknesses, without any cost to whoever's doing it.

**How I implemented it.** The same shared, in-memory sliding-window limiter from Assessment 1 (`lib/auth/rateLimit.ts`, copied in), applied specifically to `POST /api/billing/checkout`.

**What I chose against, and why.** Same reasoning as Assessment 1: an in-memory, single-process limiter is the correct, lower-complexity default at this scale, with the same honest limitation — it would need to move to a shared store before running across multiple server instances.

## Section 6: What Went Wrong

### Problem 1
- Symptom: a test payment intended to charge ₦3,000/month instead deducted ₦300,000 from the dummy test card — a 100x overcharge.
- Investigation: confirmed via Flutterwave's own documentation that their checkout-initiation API expects the amount in the main currency unit (naira), not minor units — unlike how this project stores amounts internally per R2.1.
- Cause: the amount was correctly stored internally as minor units (`300000` kobo for ₦3,000), but was sent to Flutterwave's checkout API as-is, without converting back to major units first. Flutterwave read `300000` as ₦300,000.
- Fix: added conversion at the Flutterwave API boundary specifically — divide by 100 when initiating a checkout, multiply by 100 when reading the verified amount back from Flutterwave's response — while leaving internal storage and the payment log entirely in minor units, unchanged.

### Problem 2
- Symptom: a genuine, real test payment succeeded (confirmed by an email receipt from Flutterwave), but the return view rejected it with "Verification Unsuccessful," and no subscription was granted.
- Investigation: checked whether the amount-conversion fix from Problem 1 was actually present in the running server, not just the source file. Confirmed the fix existed in the file, written before the payment was made — but the running dev server had not reloaded it, so it was still executing the old, unconverted comparison logic at the moment of verification. A second contributing factor was also found: a `FLW_VERIFY_MOCK` flag, left over from earlier webhook-idempotency testing, was still active and bypassing real verification.
- Cause: two compounding issues — a running server holding stale, pre-fix code, and a leftover test-only mock flag that shouldn't have still been enabled.
- Fix: removed the mock flag from `.env` entirely, restarted the server so the real fix was actually loaded, and re-ran verification for the affected transaction — which then correctly reconciled the matching amounts and recorded fulfilment.

### Problem 3
- Symptom: testing a downgrade (yearly → monthly) resulted in the subscription entering `CANCEL_PENDING` status — the same state a genuine cancellation produces — rather than continuing on the cheaper plan.
- Investigation: reviewed the downgrade code path and found it had no distinct behavior from cancellation; both wrote to the same status field.
- Cause: downgrade and cancellation were not actually implemented as separate logic — downgrade was, in effect, silently behaving as a full cancellation.
- Fix: gave downgrade its own field, `nextInterval`, applied automatically once the current period ends, while explicitly keeping `status` as `ACTIVE` during the interim and clearing `cancelReason`. Cancellation now also explicitly clears any pending `nextInterval`, so a scheduled downgrade can't silently override a genuine cancellation or vice versa. Verified directly: requesting a downgrade from a clean active subscription now correctly returns a scheduled interval change with no charge and no cancellation, distinguishable from real cancellation both by `status` and by `nextInterval` in the database.

## Section 7: What This Slice Does Not Handle

**Rate limiting does not survive a server restart or scale across multiple instances.** Same limitation as Assessment 1's auth slice — the in-memory limiter resets on restart and would need a shared store (Redis or the database) before running across more than one server instance.

**Downgrade is applied lazily, not on a schedule.** The switch to a cheaper interval only actually happens the next time `getLiveSubscription` runs for that user after their period has ended — there's no background job actively applying it the moment the period ends. In practice this means a user who doesn't load any billing-related screen after their period end won't see the transition applied until they do, even though the intent was recorded at the moment they requested the downgrade.

**No automated test suite.** All verification was done manually — direct database inspection, real test-mode payments, deliberately replaying webhook payloads with valid and duplicate references — rather than through an automated suite that could be re-run on every change. This was sufficient for producing the required evidence here, but a growing codebase handling real money would need real automated coverage, especially around the amount-conversion boundary that produced Problem 1.

**Only one currency is supported in practice.** The schema stores currency alongside every amount, which is the correct foundation for multi-currency support, but only NGN has actually been exercised or tested.

## Section 8: If I Built This Again
The single biggest thing I'd do differently is writing an automated test specifically for the amount-conversion boundary between internal minor-unit storage and Flutterwave's major-unit API — both directions, initiation and verification read-back. That exact boundary produced a real 100x overcharge that manual testing happened to catch, but a unit test would have caught it immediately, before it ever touched a real transaction. Money-boundary code like this is exactly where automated coverage matters most, and it's the one place in this project I'd prioritize over broader test coverage elsewhere.