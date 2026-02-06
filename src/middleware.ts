import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function getJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error("JWT_SECRET environment variable must be set");
  return new TextEncoder().encode(raw);
}

const COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-sketchnotes_token"
    : "sketchnotes_token";

// Auth routes that do not require authentication
const PUBLIC_AUTH_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/logout",
];

function isPublicAuthRoute(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((p) => pathname.startsWith(p));
}

async function verifyTokenEdge(
  token: string
): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as { sub: string };
  } catch {
    return null;
  }
}

function getExpectedOrigin(request: NextRequest): string | null {
  // Prefer explicit env var, fall back to Host header
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return new URL(process.env.NEXT_PUBLIC_APP_URL).origin;
  }
  const host = request.headers.get("host");
  if (!host) return null;
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  return `${protocol}://${host}`;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files and Next.js internals through
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Allow auth-related page routes through (login, register, etc.)
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password")
  ) {
    return NextResponse.next();
  }

  // Handle API routes
  if (pathname.startsWith("/api/")) {
    // Public auth API routes do not require authentication or CSRF
    if (isPublicAuthRoute(pathname)) {
      return NextResponse.next();
    }

    // CSRF Origin check for state-changing requests
    const method = request.method.toUpperCase();
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const origin = request.headers.get("origin");
      const expectedOrigin = getExpectedOrigin(request);

      if (!origin || !expectedOrigin || origin !== expectedOrigin) {
        return NextResponse.json(
          { error: "Forbidden: origin mismatch" },
          { status: 403 }
        );
      }
    }

    // All other API routes require authentication
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const payload = await verifyTokenEdge(token);
    if (!payload?.sub) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    return NextResponse.next();
  }

  // All other routes (app pages) require authentication
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = await verifyTokenEdge(token);
  if (!payload?.sub) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
