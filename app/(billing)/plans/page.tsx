import { getCurrentUser } from "@/lib/auth/session";
import { getLiveSubscription } from "@/lib/payments/subscriptions";
import { PRICE_MINOR } from "@/lib/payments/plans";
import { PlanActions } from "@/components/PlanActions";
import { SignInButton } from "@/components/SignInButton";

export default async function PlansPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <section className="provly-card" style={{ textAlign: "center", padding: "var(--provly-spacing-provly-3x-large) var(--provly-spacing-provly-extra-large-spacing)" }}>
        <h1 className="provly-heading">Subscription Plans</h1>
        <p className="provly-text provly-text--muted" style={{ marginBottom: "var(--provly-spacing-provly-large-spacing)" }}>
          Sign in to view and manage your Provly subscription plans.
        </p>
        <SignInButton />
      </section>
    );
  }

  const sub = await getLiveSubscription(user.id);
  const currentInterval = sub ? sub.interval : null;
  const currentPriceMinor = sub ? PRICE_MINOR[sub.interval] : null;

  const plans = [
    {
      interval: null,
      name: "Free Tier",
      priceMinor: 0,
      period: "forever",
      description: "Get started with basic access. No credit card required.",
      features: [
        "Core workspace features",
        "Community support",
        "No monthly commitment",
      ],
      mutedAction: "Default Tier",
    },
    {
      interval: "MONTHLY" as const,
      name: "Pro Monthly",
      priceMinor: PRICE_MINOR.MONTHLY,
      period: "per month",
      description: "Full access to Provly Pro features, billed monthly. Cancel anytime.",
      features: [
        "Everything in Free Tier",
        "Unlimited Provly AI access",
        "Priority support & updates",
        "Flexible monthly billing",
      ],
    },
    {
      interval: "YEARLY" as const,
      name: "Pro Yearly",
      priceMinor: PRICE_MINOR.YEARLY,
      period: "per year",
      description: "Maximum savings. Full year of Provly Pro billed annually.",
      features: [
        "Everything in Pro Monthly",
        "2 Months Free (Best Value)",
        "Priority VIP support",
        "Locked-in annual rate",
      ],
      badge: "Best Value",
    },
  ];

  return (
    <section>
      <div className="provly-page-header" style={{ textAlign: "center", maxWidth: "640px", margin: "0 auto var(--provly-spacing-provly-extra-large-spacing)" }}>
        <h1 className="provly-heading">Choose Your Plan</h1>
        <p className="provly-text provly-text--muted">
          One plan, two flexible billing intervals. Upgrade, downgrade, or cancel anytime with transparent proration.
        </p>
      </div>

      <PlanActions
        plans={plans}
        currentInterval={currentInterval}
        currentPriceMinor={currentPriceMinor}
        currentStatus={sub?.status ?? null}
      />
    </section>
  );
}
