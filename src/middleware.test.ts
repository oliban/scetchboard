/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { SignJWT } from "jose";

const JWT_SECRET = new Uint8Array(
  Array.from(Buffer.from("test-secret-for-tests"))
);

async function createToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

let validToken: string;

beforeAll(async () => {
  validToken = await createToken("test-user-id");
});

function createRequest(
  path: string,
  options?: {
    method?: string;
    token?: string;
    origin?: string;
    host?: string;
  }
) {
  const url = new URL(path, "http://localhost:3000");
  const headers = new Headers();
  if (options?.origin) headers.set("origin", options.origin);
  headers.set("host", options?.host || "localhost:3000");
  if (options?.token) {
    headers.set("cookie", `sketchnotes_token=${options.token}`);
  }

  return new NextRequest(url, {
    method: options?.method || "GET",
    headers,
  });
}

function isNextResponse(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

function isRedirectToLogin(response: Response): boolean {
  if (response.status !== 307) return false;
  const location = response.headers.get("location");
  return location !== null && location.includes("/login");
}

describe("middleware", () => {
  describe("static files pass through", () => {
    it("allows /_next/static/ through", async () => {
      const req = createRequest("/_next/static/chunks/main.js");
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("allows /favicon.ico through", async () => {
      const req = createRequest("/favicon.ico");
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });
  });

  describe("public auth pages pass through", () => {
    it("allows /login through", async () => {
      const req = createRequest("/login");
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("allows /register through", async () => {
      const req = createRequest("/register");
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("allows /forgot-password through", async () => {
      const req = createRequest("/forgot-password");
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("allows /reset-password through", async () => {
      const req = createRequest("/reset-password");
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });
  });

  describe("public auth API routes pass through", () => {
    it("allows POST /api/auth/login through", async () => {
      const req = createRequest("/api/auth/login", {
        method: "POST",
        origin: "http://localhost:3000",
      });
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("allows POST /api/auth/register through", async () => {
      const req = createRequest("/api/auth/register", {
        method: "POST",
        origin: "http://localhost:3000",
      });
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("allows POST /api/auth/forgot-password through", async () => {
      const req = createRequest("/api/auth/forgot-password", {
        method: "POST",
        origin: "http://localhost:3000",
      });
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("allows POST /api/auth/reset-password through", async () => {
      const req = createRequest("/api/auth/reset-password", {
        method: "POST",
        origin: "http://localhost:3000",
      });
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("allows POST /api/auth/logout through", async () => {
      const req = createRequest("/api/auth/logout", {
        method: "POST",
        origin: "http://localhost:3000",
      });
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });
  });

  describe("protected API routes require authentication", () => {
    it("returns 401 for GET /api/notes without token", async () => {
      const req = createRequest("/api/notes");
      const res = await middleware(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Authentication required");
    });

    it("allows GET /api/notes with valid token", async () => {
      const req = createRequest("/api/notes", { token: validToken });
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("returns 401 for GET /api/notes with invalid token", async () => {
      const req = createRequest("/api/notes", { token: "invalid-token" });
      const res = await middleware(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid or expired token");
    });

    it("returns 401 for GET /api/images/test.png without token", async () => {
      const req = createRequest("/api/images/test.png");
      const res = await middleware(req);
      expect(res.status).toBe(401);
    });
  });

  describe("CSRF origin check", () => {
    it("allows POST /api/notes with matching origin when authenticated", async () => {
      const url = new URL("/api/notes", "http://localhost:3000");
      const headers = new Headers();
      headers.set("origin", "https://localhost:3000");
      headers.set("host", "localhost:3000");
      headers.set("cookie", `sketchnotes_token=${validToken}`);

      const req = new NextRequest(url, { method: "POST", headers });
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("returns 403 for POST /api/notes with mismatched origin", async () => {
      const req = createRequest("/api/notes", {
        method: "POST",
        token: validToken,
        origin: "http://evil.com",
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden: origin mismatch");
    });

    it("returns 403 for POST /api/notes with no origin", async () => {
      const req = createRequest("/api/notes", {
        method: "POST",
        token: validToken,
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
    });

    it("does not check origin for GET requests", async () => {
      const req = createRequest("/api/notes", { token: validToken });
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("checks origin for PUT requests", async () => {
      const req = createRequest("/api/notes/123", {
        method: "PUT",
        token: validToken,
        origin: "http://evil.com",
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
    });

    it("checks origin for DELETE requests", async () => {
      const req = createRequest("/api/notes/123", {
        method: "DELETE",
        token: validToken,
        origin: "http://evil.com",
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
    });

    it("checks origin for PATCH requests", async () => {
      const req = createRequest("/api/notes/123", {
        method: "PATCH",
        token: validToken,
        origin: "http://evil.com",
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
    });

    it("skips CSRF check for public auth routes", async () => {
      const req = createRequest("/api/auth/login", {
        method: "POST",
        origin: "http://evil.com",
      });
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });
  });

  describe("protected page routes", () => {
    it("redirects / to /login without token", async () => {
      const req = createRequest("/");
      const res = await middleware(req);
      expect(isRedirectToLogin(res)).toBe(true);
    });

    it("allows / with valid token", async () => {
      const req = createRequest("/", { token: validToken });
      const res = await middleware(req);
      expect(isNextResponse(res)).toBe(true);
    });

    it("redirects /trash to /login without token", async () => {
      const req = createRequest("/trash");
      const res = await middleware(req);
      expect(isRedirectToLogin(res)).toBe(true);
    });

    it("redirects / to /login with invalid token", async () => {
      const req = createRequest("/", { token: "invalid-token" });
      const res = await middleware(req);
      expect(isRedirectToLogin(res)).toBe(true);
    });
  });
});
