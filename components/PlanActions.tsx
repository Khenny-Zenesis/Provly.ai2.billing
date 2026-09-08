"use client";

import { useState } from "react";
import { formatDate, formatMoneyMinor } from "@/lib/format";

interface PlanCard {
  interval: "MONTHLY" | "YEARLY" | null;
  name: string;
  priceMinor: number;
  period: string;
  description: string;
  features: string[];
  mutedAction?: string;
  badge?: string;
}

interface PlanActionsProps {
  plans: PlanCard[];
  currentInterval: string | null;
  currentPriceMinor: number | null;
  currentStatus: string | null;
}

type ActionState = { loadingInterval: string | null; message: string | null; isError: boolean };

export function PlanActions({
  plans,
  currentInterval,
  currentPriceMinor,
  currentStatus,
}: PlanActionsProps) {
  const [state, setState] = useState<ActionState>({ loadingInterval: null, message: null, isError: false });

  async function act(interval: string) {
    setState({ loadingInterval: interval, message: null, isError: false });
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", interval }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setState({ loadingInterval: null, message: body?.error ?? "Checkout failed.", isError: true });
        return;
      }

      const data = (await res.json()) as
        | { kind: "checkout"; checkoutUrl: string }
        | { kind: "scheduled"; effectiveDate: string };

      if (data.kind === "scheduled") {
        setState({
          loadingInterval: null,
          message: `Downgrade scheduled! Your plan will switch at the end of your current period (${formatDate(new Date(data.effectiveDate))}).`,
          isError: false,
        });
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setState({ loadingInterval: null, message: "Network error. Please try again.", isError: true });
    }
  }

  return (
    <div>
      <div className="provly-price-grid">
        {plans.map((plan) => {
          const isFree = plan.interval === null;
          const isCurrent = isFree ? !currentInterval : currentInterval === plan.interval;
          const isLoading = !isFree && state.loadingInterval === plan.interval;

          const dir =
            !isFree && currentInterval && currentPriceMinor !== null
              ? plan.priceMinor > currentPriceMinor
                ? "upgrade"
                : plan.priceMinor < currentPriceMinor
                  ? "downgrade"
                  : "same"
              : "subscribe";

          let label = "Subscribe";
          let buttonKind = "provly-btn--primary";

          if (isFree) {
            label = plan.mutedAction ?? "Included";
            buttonKind = "provly-btn--disabled";
          } else if (isCurrent) {
            label = "Current Plan";
            buttonKind = "provly-btn--disabled";
          } else if (dir === "upgrade") {
            label = "Upgrade Now";
            buttonKind = "provly-btn--primary";
          } else if (dir === "downgrade") {
            label = "Switch — Applies at period end";
            buttonKind = "provly-btn--secondary";
          }

          return (
            <div
              key={plan.interval ?? "free"}
              className={`provly-price-card ${isCurrent ? "provly-price-card--current" : ""}`}
            >
              <div className="provly-price-card__header">
                <span className="provly-price-card__name">{plan.name}</span>
                {isCurrent && (
                  <span className="provly-badge provly-badge--success">Active</span>
                )}
                {!isCurrent && plan.badge && (
                  <span className="provly-badge provly-badge--warning">{plan.badge}</span>
                )}
              </div>

              <div className="provly-price-card__price-wrapper">
                <div className="provly-price-card__price">{formatMoneyMinor(plan.priceMinor)}</div>
                <div className="provly-price-card__period">{plan.period}</div>
              </div>

              <p className="provly-price-card__description">{plan.description}</p>

              <ul className="provly-features">
                {plan.features.map((f) => (
                  <li key={f} className="provly-feature">
                    {f}
                  </li>
                ))}
              </ul>

              <div className="provly-action-row">
                <button
                  className={`provly-btn ${buttonKind}`}
                  disabled={isFree || isCurrent || state.loadingInterval !== null}
                  onClick={() => {
                    if (plan.interval) act(plan.interval);
                  }}
                >
                  {isLoading ? "Redirecting to checkout\u2026" : label}
                </button>
                {currentStatus === "CANCEL_PENDING" && isCurrent && !isFree && (
                  <span className="provly-badge provly-badge--warning" style={{ marginTop: "var(--provly-spacing-provly-extra-small-spacing)", textAlign: "center" }}>
                    Cancels at period end
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {state?.message && (
        <div
          className={`provly-notice ${state.isError ? "provly-notice--error" : "provly-notice--warning"}`}
          style={{ marginTop: "var(--provly-spacing-provly-large-spacing)" }}
        >
          {state.message}
        </div>
      )}
    </div>
  );
}
