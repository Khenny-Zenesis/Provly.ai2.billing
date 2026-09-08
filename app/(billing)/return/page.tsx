import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyAndGrantAfterReturn } from "@/lib/payments/subscriptions";
import { SignInButton } from "@/components/SignInButton";

export default async function ReturnPage({
  searchParams,
}: {
  searchParams: { tx_ref?: string | string[]; status?: string | string[] };
}) {
  const txRef = Array.isArray(searchParams.tx_ref) ? searchParams.tx_ref[0] : searchParams.tx_ref;

  const user = await getCurrentUser();

  if (!txRef) {
    return (
      <section className="provly-card" style={{ maxWidth: "600px", margin: "var(--provly-spacing-provly-2x-large) auto", textAlign: "center" }}>
        <h1 className="provly-heading" style={{ marginBottom: "var(--provly-spacing-provly-base-spacing)" }}>
          Checkout Verification
        </h1>
        <div className="provly-notice provly-notice--error" style={{ marginBottom: "var(--provly-spacing-provly-large-spacing)" }}>
          No payment reference was provided. If you were redirected here from checkout, please return to the plans page and try again.
        </div>
        <Link className="provly-btn provly-btn--secondary" href="/plans">
          Back to Plans
        </Link>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="provly-card" style={{ maxWidth: "600px", margin: "var(--provly-spacing-provly-2x-large) auto", textAlign: "center" }}>
        <h1 className="provly-heading">Confirm Payment</h1>
        <p className="provly-text provly-text--muted" style={{ marginBottom: "var(--provly-spacing-provly-large-spacing)" }}>
          Please sign in to complete verification and link this payment to your account.
        </p>
        <SignInButton />
      </section>
    );
  }

  let result;
  try {
    result = await verifyAndGrantAfterReturn(txRef);
  } catch {
    result = { granted: false, status: "failed" as const };
  }

  return (
    <section className="provly-card" style={{ maxWidth: "640px", margin: "var(--provly-spacing-provly-2x-large) auto" }}>
      <div className="provly-page-header" style={{ marginBottom: "var(--provly-spacing-provly-large-spacing)", textAlign: "center" }}>
        <h1 className="provly-heading">Payment Verification</h1>
        <p className="provly-text provly-text--muted">
          Reference ID: <code style={{ background: "var(--provly-role-provly-neutral-variant-container)", padding: "2px 6px", borderRadius: "4px" }}>{txRef}</code>
        </p>
      </div>

      {result.status === "ok" && (
        <div className="provly-notice provly-notice--success" style={{ textAlign: "center" }}>
          <h2 className="provly-subheading" style={{ color: "var(--provly-role-provly-on-success-container)", marginBottom: "var(--provly-spacing-provly-small-spacing)" }}>
            Payment Successfully Verified!
          </h2>
          <p className="provly-text" style={{ color: "var(--provly-role-provly-on-success-container)", marginBottom: "var(--provly-spacing-provly-large-spacing)" }}>
            Your subscription plan is now active. Thank you for upgrading to Provly Pro.
          </p>
          <Link className="provly-btn provly-btn--primary" href="/billing">
            View Billing Dashboard
          </Link>
        </div>
      )}

      {result.status === "pending" && (
        <div className="provly-notice provly-notice--warning" style={{ textAlign: "center" }}>
          <h2 className="provly-subheading" style={{ color: "var(--provly-role-provly-on-warning-container)", marginBottom: "var(--provly-spacing-provly-small-spacing)" }}>
            Payment Pending Confirmation
          </h2>
          <p className="provly-text" style={{ color: "var(--provly-role-provly-on-warning-container)", marginBottom: "var(--provly-spacing-provly-large-spacing)" }}>
            We received your payment request, but confirmation from Flutterwave is still pending. Access will be updated automatically once confirmed.
          </p>
          <div className="provly-row" style={{ justifyContent: "center", gap: "var(--provly-spacing-provly-base-spacing)" }}>
            <Link className="provly-btn provly-btn--primary" href="/billing">
              Go to Billing
            </Link>
            <Link className="provly-btn provly-btn--secondary" href="/plans">
              Back to Plans
            </Link>
          </div>
        </div>
      )}

      {result.status === "failed" && (
        <div className="provly-notice provly-notice--error" style={{ textAlign: "center" }}>
          <h2 className="provly-subheading" style={{ color: "var(--provly-role-provly-on-error-container)", marginBottom: "var(--provly-spacing-provly-small-spacing)" }}>
            Verification Unsuccessful
          </h2>
          <p className="provly-text" style={{ color: "var(--provly-role-provly-on-error-container)", marginBottom: "var(--provly-spacing-provly-large-spacing)" }}>
            We could not verify this transaction. If you were charged, please contact support with your reference ID: <strong>{txRef}</strong>. No subscription access was granted.
          </p>
          <Link className="provly-btn provly-btn--secondary" href="/plans">
            Return to Plans Page
          </Link>
        </div>
      )}
    </section>
  );
}
