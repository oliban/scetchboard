import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Validate password length
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if user already exists
    const existing = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email);
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const userId = uuidv4();
    const passwordHash = hashPassword(password);

    // Insert user and create sample note in a transaction
    const insertUser = db.prepare(
      "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)"
    );
    const insertNote = db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    );

    const createUser = db.transaction(() => {
      insertUser.run(userId, email, passwordHash);
      insertNote.run(
        uuidv4(),
        userId,
        "Getting Started",
        "Welcome to SketchNotes! This is your first note. You can edit it or create new ones."
      );
    });

    createUser();

    const token = await signToken(userId);
    const response = NextResponse.json(
      { token, user: { id: userId, email } },
      { status: 201 }
    );
    response.cookies.set(setAuthCookie(token));
    return response;
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
