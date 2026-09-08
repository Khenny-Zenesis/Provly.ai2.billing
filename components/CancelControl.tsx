"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";

export function CancelControl({ accessUntil }: { accessUntil: string }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmCancel() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, reason: reason || undefined }),
    });
    if (res.ok) {
      window.location.reload();
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? "Could not process cancellation request.");
    setLoading(false);
  }

  if (!confirming) {
    return (
      <div className="provly-row provly-row--space" style={{ alignItems: "center" }}>
        <div>
          <h3 className="provly-text" style={{ font: "var(--typography-provly-title-small)" }}>
            Cancel Subscription
          </h3>
          <p className="provly-text provly-text--muted">
            End your subscription renewal at the conclusion of your current billing period.
          </p>
        </div>
        <button className="provly-btn provly-btn--danger" onClick={() => setConfirming(true)}>
          Cancel Subscription
        </button>
      </div>
    );
  }

  return (
    <div className="provly-notice provly-notice--warning" style={{ background: "var(--provly-role-provly-warning-container)", color: "var(--provly-role-provly-on-warning-container)", borderColor: "var(--provly-role-provly-on-warning-container)" }}>
      <h3 className="provly-text" style={{ font: "var(--typography-provly-title-small)", color: "var(--provly-role-provly-on-warning-container)", marginBottom: "var(--provly-spacing-provly-extra-small-spacing)" }}>
        Confirm Subscription Cancellation
      </h3>
      <p className="provly-text" style={{ color: "var(--provly-role-provly-on-warning-container)" }}>
        You will retain full access until <strong>{formatDate(new Date(accessUntil))}</strong> (the end of your paid period). No further charges will occur.
      </p>

      <div style={{ marginTop: "var(--provly-spacing-provly-base-spacing)" }}>
        <label className="provly-label" htmlFor="cancel-reason" style={{ display: "block", color: "var(--provly-role-provly-on-warning-container)", marginBottom: "var(--provly-spacing-provly-extra-small-spacing)" }}>
          Reason for leaving (optional)
        </label>
        <textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Please let us know how we can improve..."
          className="provly-textarea"
        />
      </div>

      {error && (
        <p className="provly-text" style={{ color: "var(--provly-role-provly-on-error-container)", marginTop: "var(--provly-spacing-provly-small-spacing)" }}>
          {error}
        </p>
      )}

      <div className="provly-row" style={{ marginTop: "var(--provly-spacing-provly-base-spacing)", gap: "var(--provly-spacing-provly-base-spacing)" }}>
        <button className="provly-btn provly-btn--danger" onClick={confirmCancel} disabled={loading}>
          {loading ? "Processing Cancellation\u2026" : "Confirm Cancellation"}
        </button>
        <button className="provly-btn provly-btn--secondary" onClick={() => setConfirming(false)} disabled={loading}>
          Keep My Plan
        </button>
      </div>
    </div>
  );
}
