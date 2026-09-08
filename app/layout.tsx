import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "../css/provly-design-system.css";
import { getCurrentUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "Provly — Subscriptions & Billing",
  description: "Manage your Provly subscription and billing plan.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <div className="provly-shell">
          <header className="provly-shell__header">
            <Link href="/plans" className="provly-shell__brand">
              <span className="provly-shell__brand-logo">P</span>
              <span>Provly</span>
            </Link>
            <div className="provly-row" style={{ gap: "var(--provly-spacing-provly-base-spacing)", alignItems: "center" }}>
              <nav className="provly-nav">
                <Link className="provly-nav__link" href="/plans">Plans</Link>
                <Link className="provly-nav__link" href="/billing">Billing</Link>
              </nav>
              {user && (
                <div className="provly-row" style={{ alignItems: "center", gap: "var(--provly-spacing-provly-small-spacing)" }}>
                  <span className="provly-badge provly-badge--neutral" style={{ textTransform: "none", opacity: 0.9 }}>
                    {user.email}
                  </span>
                  <SignOutButton />
                </div>
              )}
            </div>
          </header>
          <main className="provly-shell__main">{children}</main>
        </div>
      </body>
    </html>
  );
}
