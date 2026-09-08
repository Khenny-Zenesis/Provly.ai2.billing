# AGENTS.md — Assessment 2: Payment and Subscription Slice

## 1. What is this project

A standalone subscription and billing slice — not the full Provly app, and not connected to the Assessment 1 repository as a live dependency. It builds a plans view, checkout, a return screen, a billing view with cancellation, and the payment logic underneath: one paid plan, sold monthly or yearly, in Flutterwave test mode.

The source of truth is `Assessment2_Payment_Slice_PRD.md`. If this file and the PRD conflict, the PRD wins on *what* to build; this file wins on *how*. If genuinely unclear which applies, stop and flag it — do not guess (see Section 7).

This is the largest of the four assessments. Nothing from Assessments 1, 3, or 4 is in scope here, except Assessment 1's authentication logic, which may be **copied in** as files — never linked as a live shared project.

## 2. What is locked — never change, swap, or "improve" these

- **Framework**: Next.js, App Router. **Language**: TypeScript. **ORM**: Prisma. **Database**: PostgreSQL. **Build environment**: Antigravity. (Unchanged from Assessment 1.)
- **Payment provider**: Flutterwave, test mode. Do not substitute Stripe, Paystack, or any other provider, even if better-documented for a specific feature.
- **Product shape**: exactly one paid plan, sold on exactly two intervals — monthly and yearly. Do not introduce multiple plan tiers or additional intervals; that complexity isn't part of this assessment.

Do not upgrade, replace, or "modernize" any of the above during this task. Flag suggestions in documentation instead of acting on them.

## 3. What must never happen

Every rule below is a hard failure if broken — even if the app runs and looks correct. Each cites the PRD requirement it protects.

- **Never grant a subscription based on the user landing on the success/return URL alone.** Entitlement is granted only after the server independently verifies the payment with Flutterwave. Anyone who visits the return URL directly, without having paid, must not receive access. This is the single most important rule in this entire assessment — the brief itself names this exact failure as the defining trap. (R2.3)
- **Never trust a webhook payload before its signature is verified.** Verification happens first, unconditionally, before any part of the payload is read or acted on. (R2.4)
- **Never process the same webhook event twice.** Idempotency is keyed on the provider's own reference ID — a webhook fired twice must be recorded once and acted on once, not applied a second time. (R2.5)
- **Never store a monetary amount as a decimal, anywhere, for any reason.** All amounts are whole numbers in minor units (e.g. kobo), with the currency stored alongside. (R2.1)
- **Never let the payment log double as the current-status field, or skip it because status already exists.** Every payment event — initiation, verification, fulfilment, failure — gets its own row. The log is the history; a status field is only ever the present. If a real customer disputes a charge, the log is what gets shown to them. (R2.2)
- **Never cut off access immediately upon cancellation.** A cancelled subscription retains access through the end of the period already paid for, and cancellation requires a confirmation step before it's finalized. (R2.7)
- **Never skip proration on a mid-cycle interval change**, and never show a proration figure that isn't the actual calculated result — days remaining, credit applied, amount charged must all be real and reproducible, correct to the day. (R2.6)
- **Never leave the checkout-initiation endpoint unprotected by rate limiting.** (R2.9)
- **Never store card details anywhere in this system, at any point, in any form.** (R2.11)
- **Never let any point in the payment path resolve to a blank page or a 404.** Every failure state — a declined payment, a verification mismatch, an expired session mid-checkout — is a real, handled UI state. (R2.10)
- **Never build anything outside the five named screens** (plans, checkout initiation, return view, billing view, minimal signed-in shell). Extra scope is graded as a failure, identical in severity to a missing engineering requirement — same rule as Assessment 1.

## 4. How the work is arranged

```
/app
  /(billing)
    /plans/page.tsx
    /return/page.tsx
    /billing/page.tsx
  /api
    /billing
      /checkout/route.ts     — initiates checkout with Flutterwave; rate-limited (R2.9)
      /webhook/route.ts      — receives and verifies Flutterwave webhooks (R2.4, R2.5)
      /cancel/route.ts       — cancellation with confirmation step (R2.7, R2.8)
/lib
  /auth                      — copied from Assessment 1 (password.ts, session.ts, rateLimit.ts)
  /payments
    flutterwave.ts           — client wrapper: initiate checkout, verify a transaction server-side
    webhookVerify.ts         — signature verification, called before any payload is trusted
    proration.ts             — pure function: proration math, isolated so it's easy to show and reason about
  /db
    prisma.ts
  /validation
    billingSchemas.ts
/prisma
  schema.prisma              — Subscription, PaymentLog models at minimum
  /migrations
.env.example
DOCUMENTATION.md
```

Rules about this layout:
- `lib/payments/proration.ts` stays a pure function — no database or network calls inside it. This makes the proration arithmetic directly showable and testable in isolation, which is exactly what R2.6's evidence requirement asks for.
- Webhook signature verification (`webhookVerify.ts`) is called as the very first step inside `/api/billing/webhook/route.ts`, before the payload is parsed for business logic — not as a check bolted on afterward.
- Route handlers stay thin, same as Assessment 1 — they call into `/lib`, they don't contain the actual business logic themselves.

## 5. How the code should look

- Clean, readable, boring on purpose — same standard as Assessment 1.
- No `any` types.
- Money-handling code in particular should read unambiguously — a reviewer should be able to tell at a glance that a value is in minor units, never left implicit.
- Comments explain *why*, especially around anything money- or webhook-related, since these are the areas where a wrong assumption is costly, not just untidy.

### Design tokens — same rules as Assessment 1

This project uses the same Provly design system as Assessment 1. Bring `provly-design-system.css` (and its component files) into this project's `css/` folder — do not regenerate or recreate it from scratch.

- **Never reference a `--provly-primitive-*` variable in any component.** Role tokens only.
- **Never reference a generic, non-`provly`-prefixed token** (e.g. `--role-primary`). The source JSON contains a leftover generic system alongside the real Provly one — only the `provly`-prefixed collections are real. Treat any use of the generic system as a failure on sight, same as Assessment 1.
- **Color role usage for this slice specifically:**
  - Primary actions (Subscribe, Upgrade, Confirm Checkout buttons): `--provly-role-provly-primary` / `--provly-role-provly-on-primary`.
  - Cancellation warning / confirmation step: `--provly-role-provly-warning-container` / `--provly-role-provly-on-warning-container` for the "you'll lose access on [date]" notice; the actual destructive confirm action itself uses `--provly-role-provly-error` / `--provly-role-provly-on-error`.
  - Active subscription status badge: `--provly-role-provly-success-container` / `--provly-role-provly-on-success-container`.
  - "Cancels at period end" status badge: `--provly-role-provly-warning-container` / `--provly-role-provly-on-warning-container`.
  - Payment failure states: `--provly-role-provly-error-container` / `--provly-role-provly-on-error-container`.
  - Body text, borders, plan-comparison table backgrounds: neutral role tokens.
- **Spacing, radius, typography**: same tokens, same rules as Assessment 1 — `--provly-spacing-provly-*`, `--provly-radius-provly-*`, `--provly-type-provly-*` exclusively, no arbitrary values.
- **Verify the CSS import chain works before building any screen.** Assessment 1 hit a real bug where a nested `@import` across a directory boundary silently failed to load any token values. Confirm the design system is actually rendering (check one styled element) before building further on top of it — don't assume it works just because the import line is present.

## 6. What counts as done

- [ ] All 5 screens present and functioning
- [ ] R2.1 through R2.11 each implemented and verifiable
- [ ] Subscribe, upgrade (with correct proration), downgrade (applied at period end), and cancel (access retained) all work
- [ ] Entitlement is granted only after server-side verification — confirmed by attempting to reach the return URL directly without paying, and seeing it fail to grant access
- [ ] Same webhook fired twice — confirmed the second firing is recorded but not acted on again
- [ ] Payment log shows every stage of at least one complete transaction as separate rows with real timestamps
- [ ] Zero build errors, zero TypeScript errors
- [ ] Nothing exists in the repository outside the five named screens and their supporting logic

## 7. What to do when unsure

Never invent a new feature or expand scope to resolve uncertainty. If the PRD and this file don't clearly cover a situation:

1. Implement the smallest, safest default that satisfies the letter of the existing rules.
2. Never silently weaken a money- or security-related rule to get past a blocker — do not skip webhook verification "temporarily," do not grant entitlement early "just to test the UI faster," do not round or approximate a proration figure to avoid doing the real calculation.
3. Write the open question into the documentation's limitations section rather than guessing silently.
4. When truly blocked, stop and surface the question rather than producing speculative, untested code — especially anywhere money is involved.

---

**Self-check before use**: every "must never" rule in Section 3 traces to a specific PRD requirement or an explicit trap named in the assignment itself. The success-URL entitlement rule is given the most prominent placement because the brief itself singles it out as the defining failure mode of this entire assessment — not because of my own judgment call, but because the source material says so directly.