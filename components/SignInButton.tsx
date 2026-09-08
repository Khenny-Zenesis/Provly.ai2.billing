"use client";

import { useState } from "react";

// Dev-only sign-in control. POSTs to the auth stand-in then reloads into the
// signed-in shell. Replaced by Assessment 1's real auth when it's copied in.
export function SignInButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function signIn() {
    setLoading(true);
    setError(false);
    const res = await fetch("/api/dev/signin", { method: "POST" });
    if (res.ok) {
      window.location.href = "/plans";
    } else {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <div className="provly-row">
      <button className="provly-btn provly-btn--primary" onClick={signIn} disabled={loading}>
        {loading ? "Signing in\u2026" : "Sign in"}
      </button>
      {error && <span className="provly-text--muted">Could not sign in. Is the dev auth available?</span>}
    </div>
  );
}
