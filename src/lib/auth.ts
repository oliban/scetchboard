import { hashSync, compareSync } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getDb } from "./db";

const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW) throw new Error("JWT_SECRET environment variable must be set");
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

const COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-sketchnotes_token"
    : "sketchnotes_token";

export function hashPassword(password: string): string {
  return hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  return compareSync(password, hash);
}

export async function signToken(
  userId: string,
  tokenVersion: number = 0
): Promise<string> {
  return new SignJWT({ sub: userId, token_version: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(
  token: string
): Promise<{ sub: string; token_version?: number } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { sub: string; token_version?: number };
  } catch {
    return null;
  }
}

export async function getAuthUser(): Promise<{
  id: string;
  email: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload?.sub) return null;

  const db = getDb();
  const user = db
    .prepare("SELECT id, email, token_version FROM users WHERE id = ?")
    .get(payload.sub) as
    | { id: string; email: string; token_version: number }
    | undefined;

  if (!user) return null;

  // Check token_version matches to support session invalidation
  if (
    payload.token_version !== undefined &&
    payload.token_version !== user.token_version
  ) {
    return null;
  }

  return { id: user.id, email: user.email };
}

export function setAuthCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  };
}

export function clearAuthCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
