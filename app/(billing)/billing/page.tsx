import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { getLiveSubscription, getPaymentLogForUser } from "@/lib/payments/subscriptions";
import { PAID_PLAN_NAME } from "@/lib/payments/plans";
import { formatMoneyMinor, formatDate } from "@/lib/format";
import { CancelControl } from "@/components/CancelControl";
import { SignInButton } from "@/components/SignInButton";

export default async function BillingPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <section className="provly-card" style={{ textAlign: "center", padding: "var(--provly-spacing-provly-3x-large) var(--provly-spacing-provly-extra-large-spacing)" }}>
        <h1 className="provly-heading">Billing Management</h1>
        <p className="provly-text provly-text--muted" style={{ marginBottom: "var(--provly-spacing-provly-large-spacing)" }}>
          Sign in to view your subscription status and billing history.
        </p>
        <SignInButton />
      </section>
    );
  }

  const sub = await getLiveSubscription(user.id);

  if (!sub || sub.status === "EXPIRED") {
    return (
      <section>
        <div className="provly-page-header">
          <h1 className="provly-heading">Billing Management</h1>
          <p className="provly-text provly-text--muted">Manage your active plan and review payment invoices.</p>
        </div>
        <div className="provly-card" style={{ textAlign: "center", padding: "var(--provly-spacing-provly-2x-large)" }}>
          <h2 className="provly-subheading">No Active Subscription</h2>
          <p className="provly-text provly-text--muted" style={{ marginBottom: "var(--provly-spacing-provly-large-spacing)" }}>
            You are currently on the Free Tier. Choose a plan to unlock full Provly Pro features.
          </p>
          <Link className="provly-btn provly-btn--primary" href="/plans">
            View Subscription Plans
          </Link>
        </div>
      </section>
    );
  }

  const badge =
    sub.status === "ACTIVE"
      ? { cls: "provly-badge--success", label: "Active" }
      : sub.status === "CANCEL_PENDING"
        ? { cls: "provly-badge--warning", label: "Cancels at period end" }
        : { cls: "provly-badge--error", label: "Expired" };

  const logs = await getPaymentLogForUser(user.id);

  return (
    <section>
      <div className="provly-page-header">
        <h1 className="provly-heading">Billing & Subscription</h1>
        <p className="provly-text provly-text--muted">
          Manage your current subscription, billing schedule, and review complete payment history logs.
        </p>
      </div>

      {/* Subscription Summary Card */}
      <div className="provly-card provly-card--featured" style={{ marginBottom: "var(--provly-spacing-provly-extra-large-spacing)" }}>
        <div className="provly-row provly-row--space" style={{ marginBottom: "var(--provly-spacing-provly-large-spacing)", borderBottom: "1px solid var(--provly-role-provly-on-neutral-container)", paddingBottom: "var(--provly-spacing-provly-base-spacing)" }}>
          <div>
            <span className="provly-badge provly-badge--neutral" style={{ marginBottom: "var(--provly-spacing-provly-extra-small-spacing)" }}>
              Current Plan
            </span>
            <h2 className="provly-subheading" style={{ margin: 0 }}>
              {PAID_PLAN_NAME} ({sub.interval === "MONTHLY" ? "Monthly" : "Yearly"})
            </h2>
          </div>
          <span className={`provly-badge ${badge.cls}`}>{badge.label}</span>
        </div>

        <div className="provly-meta-grid">
          <div className="provly-meta-item">
            <span className="provly-meta-label">Billed Amount</span>
            <span className="provly-meta-value">{formatMoneyMinor(sub.amountMinor, sub.currency)}</span>
          </div>
          <div className="provly-meta-item">
            <span className="provly-meta-label">Billing Cycle</span>
            <span className="provly-meta-value">{sub.interval === "MONTHLY" ? "Monthly" : "Annual"}</span>
          </div>
          <div className="provly-meta-item">
            <span className="provly-meta-label">
              {sub.status === "CANCEL_PENDING" ? "Access Until" : "Next Renewal Date"}
            </span>
            <span className="provly-meta-value">{formatDate(sub.currentPeriodEnd)}</span>
          </div>
        </div>

        {sub.status === "ACTIVE" && (
          <div style={{ marginTop: "var(--provly-spacing-provly-large-spacing)", paddingTop: "var(--provly-spacing-provly-base-spacing)", borderTop: "1px solid var(--provly-role-provly-on-neutral-container)" }}>
            <CancelControl accessUntil={sub.currentPeriodEnd.toISOString()} />
          </div>
        )}

        {sub.status === "CANCEL_PENDING" && (
          <div className="provly-notice provly-notice--warning" style={{ marginTop: "var(--provly-spacing-provly-large-spacing)" }}>
            Access is retained until <strong>{formatDate(sub.currentPeriodEnd)}</strong>. Your subscription will automatically end on that date without further charges.
          </div>
        )}
      </div>

      {/* Payment Logs Section */}
      <div>
        <h2 className="provly-subheading">Payment History</h2>
        <p className="provly-text provly-text--muted" style={{ marginBottom: "var(--provly-spacing-provly-base-spacing)" }}>
          Immutable ledger of all checkout initiations, verifications, and renewals.
        </p>

        <div className="provly-table-container">
          <table className="provly-table">
            <thead>
              <tr>
                <th>Event Type</th>
                <th>Provider Ref</th>
                <th>Amount</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <span className="provly-badge provly-badge--neutral" style={{ textTransform: "none" }}>
                      {log.eventType}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace" }}>{log.providerTxRef}</td>
                  <td>
                    <strong>{formatMoneyMinor(log.amountMinor, log.currency)}</strong>
                  </td>
                  <td>{formatDate(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && (
            <div style={{ padding: "var(--provly-spacing-provly-large-spacing)", textAlign: "center" }}>
              <p className="provly-text provly-text--muted">No payment history events logged yet.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
