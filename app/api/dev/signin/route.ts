import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { setSessionCookie } from "@/lib/auth/session";

// DEV-ONLY stand-in for Assessment 1's authentication. The five screens assume a
// signed-in user; until Assessment 1's auth is copied in, this lets the slice be
// exercised end-to-end. It is disabled outside a non-production build.
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const email = "demo@provly.com";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: "Demo User", passwordHash: "" },
    });
  }

  setSessionCookie(user.id);
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
}
