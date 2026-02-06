import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword, signToken, setAuthCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const { success } = rateLimit(ip, { windowMs: 60000, max: 5 });
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const user = db
      .prepare(
        "SELECT id, email, password_hash, token_version FROM users WHERE email = ?"
      )
      .get(email) as
      | {
          id: string;
          email: string;
          password_hash: string;
          token_version: number;
        }
      | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const token = await signToken(user.id, user.token_version);
    const response = NextResponse.json({
      user: { id: user.id, email: user.email },
    });
    response.cookies.set(setAuthCookie(token));
    return response;
  } catch (error) {
    console.error(
      "Login error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
