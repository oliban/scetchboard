import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Find valid, unused, non-expired token
    const resetToken = db
      .prepare(
        `SELECT id, user_id FROM password_reset_tokens
         WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')`
      )
      .get(token) as { id: string; user_id: string } | undefined;

    if (!resetToken) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 }
      );
    }

    const passwordHash = hashPassword(password);

    // Update password and mark token as used in a transaction
    const resetPassword = db.transaction(() => {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
        passwordHash,
        resetToken.user_id
      );
      db.prepare(
        "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?"
      ).run(resetToken.id);
    });
    resetPassword();

    return NextResponse.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
