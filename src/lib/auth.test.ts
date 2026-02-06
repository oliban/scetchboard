// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";

// Must set JWT_SECRET before importing auth module
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-tests";
});

// Dynamic import to ensure env var is set before module-level check
async function getAuth() {
  return await import("./auth");
}

describe("hashPassword", () => {
  it("returns a bcrypt hash string", async () => {
    const { hashPassword } = await getAuth();
    const hash = hashPassword("mypassword");
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it("produces different hashes for different passwords", async () => {
    const { hashPassword } = await getAuth();
    const hash1 = hashPassword("password1");
    const hash2 = hashPassword("password2");
    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyPassword", () => {
  it("returns true for correct password", async () => {
    const { hashPassword, verifyPassword } = await getAuth();
    const hash = hashPassword("correct-password");
    expect(verifyPassword("correct-password", hash)).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const { hashPassword, verifyPassword } = await getAuth();
    const hash = hashPassword("correct-password");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("signToken", () => {
  it("returns a JWT string with 3 dot-separated parts", async () => {
    const { signToken } = await getAuth();
    const token = await signToken("user-123");
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
  });

  it("includes userId as sub claim", async () => {
    const { signToken, verifyToken } = await getAuth();
    const token = await signToken("user-456");
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-456");
  });

  it("includes tokenVersion in payload", async () => {
    const { signToken, verifyToken } = await getAuth();
    const token = await signToken("user-789", 3);
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.token_version).toBe(3);
  });
});

describe("verifyToken", () => {
  it("returns payload for a valid token", async () => {
    const { signToken, verifyToken } = await getAuth();
    const token = await signToken("user-abc");
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-abc");
  });

  it("returns null for a tampered token", async () => {
    const { signToken, verifyToken } = await getAuth();
    const token = await signToken("user-abc");
    const tampered = token.slice(0, -4) + "XXXX";
    const payload = await verifyToken(tampered);
    expect(payload).toBeNull();
  });

  it("returns null for a completely invalid token", async () => {
    const { verifyToken } = await getAuth();
    const payload = await verifyToken("not-a-jwt");
    expect(payload).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const { verifyToken } = await getAuth();
    // Craft a token that expired 1 hour ago
    const secret = new TextEncoder().encode("test-secret-for-tests");
    const expiredToken = await new SignJWT({ sub: "user-expired", token_version: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);

    const payload = await verifyToken(expiredToken);
    expect(payload).toBeNull();
  });
});

describe("setAuthCookie", () => {
  it("returns correct cookie config", async () => {
    const { setAuthCookie } = await getAuth();
    const cookie = setAuthCookie("my-token");
    expect(cookie.value).toBe("my-token");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.path).toBe("/");
    expect(cookie.maxAge).toBe(7 * 24 * 60 * 60);
  });
});

describe("clearAuthCookie", () => {
  it("returns cookie config with maxAge 0", async () => {
    const { clearAuthCookie } = await getAuth();
    const cookie = clearAuthCookie();
    expect(cookie.value).toBe("");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.path).toBe("/");
    expect(cookie.maxAge).toBe(0);
  });
});
