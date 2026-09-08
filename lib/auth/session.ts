import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

// Minimal, stateless session for the signed-in shell. Assessment 1's auth
// (password.ts, session.ts, rateLimit.ts) is meant to be copied in per
// AGENTS.md Section 4 — this is a thin stand-in so the payment routes can read
// a verified userId until those files are dropped in. It must be reconciled
// when copying Assessment 1's real session handling.

const COOKIE_NAME = "provly_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.FLW_SECRET_KEY;
  if (!s) {
    throw new Error("No session secret configured (SESSION_SECRET or FLW_SECRET_KEY)");
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Sign a userId into a tamper-evident token: `<userId>.<expiry>.<hmac>`. */
export function createSessionToken(userId: string): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

/** Verify a token and return its userId, or null if invalid/expired. */
export function readSessionToken(token: string): string | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = sign(payload);

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  const [userId, expiresRaw] = payload.split(".");
  const expires = Number(expiresRaw);
  if (!userId || Number.isNaN(expires) || expires < Date.now()) return null;

  return userId;
}

/** Current authenticated userId from the session cookie, or null. */
export function getSessionUserId(): string | null {
  const token = cookies().get(COOKIE_NAME)?.value;
  return token ? readSessionToken(token) : null;
}

/** Set the session cookie for the duration of the request. */
export function setSessionCookie(userId: string): void {
  cookies().set(COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** The full current user, or null when not signed in. */
export async function getCurrentUser(): Promise<User | null> {
  const userId = getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/** Expire the session cookie. */
export function clearSessionCookie(): void {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
