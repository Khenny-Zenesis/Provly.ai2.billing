"use client";

import { useState } from "react";

export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    await fetch("/api/dev/signout", { method: "POST" }).catch(() => null);
    window.location.href = "/plans";
  }

  return (
    <button className="provly-signout" onClick={signOut} disabled={loading}>
      {loading ? "Signing out\u2026" : "Sign out"}
    </button>
  );
}
