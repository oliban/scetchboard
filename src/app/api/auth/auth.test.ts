// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

// Set env vars before any imports that read them
process.env.JWT_SECRET = "test-secret-for-tests";
process.env.DATABASE_URL = "./data/test-auth.db";

const DB_PATH = "./data/test-auth.db";

// We need to reset the db module singleton between tests
// Import getDb to initialize the test database
let getDb: typeof import("@/lib/db").getDb;

// Helper to create a Request object
function makeRequest(
  url: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const { method = "POST", body, headers = {} } = options;
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// Helper to get JSON from NextResponse
async function getJson(response: Response) {
  return response.json();
}

describe("Auth API Endpoints", () => {
  let registerPOST: (req: Request) => Promise<Response>;
  let loginPOST: (req: Request) => Promise<Response>;
  let forgotPasswordPOST: (req: Request) => Promise<Response>;
  let resetPasswordPOST: (req: Request) => Promise<Response>;
  let logoutPOST: () => Promise<Response>;

  beforeAll(async () => {
    // Clean up any existing test db
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    // Also clean WAL/SHM files
    if (fs.existsSync(DB_PATH + "-wal")) fs.unlinkSync(DB_PATH + "-wal");
    if (fs.existsSync(DB_PATH + "-shm")) fs.unlinkSync(DB_PATH + "-shm");

    // Dynamically import modules so env vars are set first
    const dbModule = await import("@/lib/db");
    getDb = dbModule.getDb;

    // Initialize the database (runs migrations)
    getDb();

    // Import route handlers
    const register = await import("@/app/api/auth/register/route");
    const login = await import("@/app/api/auth/login/route");
    const forgotPassword = await import("@/app/api/auth/forgot-password/route");
    const resetPassword = await import("@/app/api/auth/reset-password/route");
    const logout = await import("@/app/api/auth/logout/route");

    registerPOST = register.POST;
    loginPOST = login.POST;
    forgotPasswordPOST = forgotPassword.POST;
    resetPasswordPOST = resetPassword.POST;
    logoutPOST = logout.POST;
  });

  afterAll(() => {
    // Close the database connection
    try {
      const db = getDb();
      db.close();
    } catch {
      // ignore
    }
    // Clean up test database files
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    if (fs.existsSync(DB_PATH + "-wal")) fs.unlinkSync(DB_PATH + "-wal");
    if (fs.existsSync(DB_PATH + "-shm")) fs.unlinkSync(DB_PATH + "-shm");
  });

  // Use unique IPs per test to avoid rate limit cross-contamination
  let ipCounter = 0;
  function uniqueIp() {
    return `10.0.0.${++ipCounter}`;
  }

  describe("POST /api/auth/register", () => {
    it("should register a new user and return 201", async () => {
      const req = makeRequest("http://localhost/api/auth/register", {
        body: { email: "newuser@test.com", password: "password123" },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await registerPOST(req);
      expect(res.status).toBe(201);

      const json = await getJson(res);
      expect(json.user).toBeDefined();
      expect(json.user.email).toBe("newuser@test.com");
      expect(json.user.id).toBeDefined();
      // Should NOT return token in body
      expect(json.token).toBeUndefined();
    });

    it("should create a 'Getting Started' sample note on registration", async () => {
      const req = makeRequest("http://localhost/api/auth/register", {
        body: { email: "notecheck@test.com", password: "password123" },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await registerPOST(req);
      const json = await getJson(res);
      expect(res.status).toBe(201);

      // Check the database for the sample note
      const db = getDb();
      const note = db
        .prepare("SELECT title FROM notes WHERE user_id = ?")
        .get(json.user.id) as { title: string } | undefined;

      expect(note).toBeDefined();
      expect(note!.title).toBe("Getting Started");
    });

    it("should set an auth cookie on successful registration", async () => {
      const req = makeRequest("http://localhost/api/auth/register", {
        body: { email: "cookiecheck@test.com", password: "password123" },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await registerPOST(req);
      expect(res.status).toBe(201);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("sketchnotes_token=");
    });

    it("should return 400 for invalid email", async () => {
      const req = makeRequest("http://localhost/api/auth/register", {
        body: { email: "not-an-email", password: "password123" },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await registerPOST(req);
      expect(res.status).toBe(400);

      const json = await getJson(res);
      expect(json.error).toContain("Invalid email");
    });

    it("should return 400 for short password (<8 chars)", async () => {
      const req = makeRequest("http://localhost/api/auth/register", {
        body: { email: "short@test.com", password: "1234567" },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await registerPOST(req);
      expect(res.status).toBe(400);

      const json = await getJson(res);
      expect(json.error).toContain("at least 8 characters");
    });

    it("should return 400 for too-long password (>128 chars)", async () => {
      const req = makeRequest("http://localhost/api/auth/register", {
        body: { email: "long@test.com", password: "a".repeat(129) },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await registerPOST(req);
      expect(res.status).toBe(400);

      const json = await getJson(res);
      expect(json.error).toContain("at most 128 characters");
    });

    it("should return 400 for duplicate email with generic error message", async () => {
      const ip = uniqueIp();
      // Register first
      const req1 = makeRequest("http://localhost/api/auth/register", {
        body: { email: "dupe@test.com", password: "password123" },
        headers: { "x-forwarded-for": ip },
      });
      const res1 = await registerPOST(req1);
      expect(res1.status).toBe(201);

      // Try to register again with same email
      const req2 = makeRequest("http://localhost/api/auth/register", {
        body: { email: "dupe@test.com", password: "password456" },
        headers: { "x-forwarded-for": uniqueIp() },
      });
      const res2 = await registerPOST(req2);
      expect(res2.status).toBe(400);

      const json = await getJson(res2);
      // Should NOT say "already registered" (prevents user enumeration)
      expect(json.error).not.toContain("already registered");
      expect(json.error).toBeDefined();
    });
  });

  describe("POST /api/auth/login", () => {
    const loginEmail = "loginuser@test.com";
    const loginPassword = "securepassword";

    beforeAll(async () => {
      // Create a user to login with
      const req = makeRequest("http://localhost/api/auth/register", {
        body: { email: loginEmail, password: loginPassword },
        headers: { "x-forwarded-for": uniqueIp() },
      });
      const res = await registerPOST(req);
      expect(res.status).toBe(201);
    });

    it("should login successfully with correct credentials and return 200", async () => {
      const req = makeRequest("http://localhost/api/auth/login", {
        body: { email: loginEmail, password: loginPassword },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(200);

      const json = await getJson(res);
      expect(json.user).toBeDefined();
      expect(json.user.email).toBe(loginEmail);
      expect(json.user.id).toBeDefined();
    });

    it("should set auth cookie on successful login", async () => {
      const req = makeRequest("http://localhost/api/auth/login", {
        body: { email: loginEmail, password: loginPassword },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(200);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("sketchnotes_token=");
    });

    it("should NOT return token in the response body", async () => {
      const req = makeRequest("http://localhost/api/auth/login", {
        body: { email: loginEmail, password: loginPassword },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await loginPOST(req);
      const json = await getJson(res);
      expect(json.token).toBeUndefined();
    });

    it("should return 401 for wrong password", async () => {
      const req = makeRequest("http://localhost/api/auth/login", {
        body: { email: loginEmail, password: "wrongpassword" },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(401);

      const json = await getJson(res);
      expect(json.error).toContain("Invalid email or password");
    });

    it("should return 401 for non-existent email", async () => {
      const req = makeRequest("http://localhost/api/auth/login", {
        body: { email: "nonexistent@test.com", password: "password123" },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(401);

      const json = await getJson(res);
      expect(json.error).toContain("Invalid email or password");
    });

    it("should return 400 for missing fields", async () => {
      const req = makeRequest("http://localhost/api/auth/login", {
        body: { email: loginEmail },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(400);

      const json = await getJson(res);
      expect(json.error).toContain("required");
    });

    it("should rate limit after 5 requests from the same IP", async () => {
      const ip = uniqueIp();
      const results: number[] = [];

      for (let i = 0; i < 7; i++) {
        const req = makeRequest("http://localhost/api/auth/login", {
          body: { email: loginEmail, password: loginPassword },
          headers: { "x-forwarded-for": ip },
        });
        const res = await loginPOST(req);
        results.push(res.status);
      }

      // First 5 should succeed (200)
      expect(results.slice(0, 5).every((s) => s === 200)).toBe(true);
      // 6th and 7th should be rate limited (429)
      expect(results[5]).toBe(429);
      expect(results[6]).toBe(429);
    });
  });

  describe("POST /api/auth/forgot-password", () => {
    const forgotEmail = "forgot@test.com";

    beforeAll(async () => {
      const req = makeRequest("http://localhost/api/auth/register", {
        body: { email: forgotEmail, password: "password123" },
        headers: { "x-forwarded-for": uniqueIp() },
      });
      const res = await registerPOST(req);
      expect(res.status).toBe(201);
    });

    it("should return 200 with generic message for existing email", async () => {
      const req = makeRequest("http://localhost/api/auth/forgot-password", {
        body: { email: forgotEmail },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await forgotPasswordPOST(req);
      expect(res.status).toBe(200);

      const json = await getJson(res);
      expect(json.message).toContain("If an account with that email exists");
    });

    it("should return 200 with same generic message for non-existent email (no enumeration)", async () => {
      const req = makeRequest("http://localhost/api/auth/forgot-password", {
        body: { email: "doesnotexist@test.com" },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      const res = await forgotPasswordPOST(req);
      expect(res.status).toBe(200);

      const json = await getJson(res);
      expect(json.message).toContain("If an account with that email exists");
    });

    it("should create a reset token in the database", async () => {
      const req = makeRequest("http://localhost/api/auth/forgot-password", {
        body: { email: forgotEmail },
        headers: { "x-forwarded-for": uniqueIp() },
      });

      await forgotPasswordPOST(req);

      const db = getDb();
      const user = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(forgotEmail) as { id: string };

      const token = db
        .prepare(
          "SELECT token FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL"
        )
        .get(user.id) as { token: string } | undefined;

      expect(token).toBeDefined();
      expect(token!.token).toBeTruthy();
    });

    it("should rate limit after 3 requests from the same IP", async () => {
      const ip = uniqueIp();
      const results: number[] = [];

      for (let i = 0; i < 5; i++) {
        const req = makeRequest("http://localhost/api/auth/forgot-password", {
          body: { email: forgotEmail },
          headers: { "x-forwarded-for": ip },
        });
        const res = await forgotPasswordPOST(req);
        results.push(res.status);
      }

      // First 3 should succeed (200)
      expect(results.slice(0, 3).every((s) => s === 200)).toBe(true);
      // 4th and 5th should be rate limited (429)
      expect(results[3]).toBe(429);
      expect(results[4]).toBe(429);
    });
  });

  describe("POST /api/auth/reset-password", () => {
    const resetEmail = "reset@test.com";
    const originalPassword = "originalpass";

    beforeAll(async () => {
      const req = makeRequest("http://localhost/api/auth/register", {
        body: { email: resetEmail, password: originalPassword },
        headers: { "x-forwarded-for": uniqueIp() },
      });
      const res = await registerPOST(req);
      expect(res.status).toBe(201);
    });

    function getResetToken(email: string): string {
      const db = getDb();
      const user = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(email) as { id: string };

      const tokenRow = db
        .prepare(
          "SELECT token FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL AND expires_at > datetime('now') ORDER BY rowid DESC LIMIT 1"
        )
        .get(user.id) as { token: string } | undefined;

      return tokenRow!.token;
    }

    function createResetToken(email: string): string {
      const db = getDb();
      const user = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(email) as { id: string };

      const crypto = require("crypto");
      const { v4: uuidv4 } = require("uuid");
      const token = crypto.randomBytes(32).toString("hex");
      const id = uuidv4();

      // Invalidate old tokens
      db.prepare(
        "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL"
      ).run(user.id);

      db.prepare(
        `INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, datetime('now', '+1 hour'))`
      ).run(id, user.id, token);

      return token;
    }

    it("should successfully reset password with a valid token", async () => {
      const token = createResetToken(resetEmail);

      const req = makeRequest("http://localhost/api/auth/reset-password", {
        body: { token, password: "newpassword123" },
      });

      const res = await resetPasswordPOST(req);
      expect(res.status).toBe(200);

      const json = await getJson(res);
      expect(json.message).toContain("Password reset successfully");
    });

    it("should return 400 for an invalid token", async () => {
      const req = makeRequest("http://localhost/api/auth/reset-password", {
        body: { token: "invalid-token-value", password: "newpassword123" },
      });

      const res = await resetPasswordPOST(req);
      expect(res.status).toBe(400);

      const json = await getJson(res);
      expect(json.error).toContain("Invalid or expired");
    });

    it("should return 400 for an expired token", async () => {
      const db = getDb();
      const user = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(resetEmail) as { id: string };

      const crypto = require("crypto");
      const { v4: uuidv4 } = require("uuid");
      const token = crypto.randomBytes(32).toString("hex");
      const id = uuidv4();

      // Create an already-expired token
      db.prepare(
        `INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, datetime('now', '-1 hour'))`
      ).run(id, user.id, token);

      const req = makeRequest("http://localhost/api/auth/reset-password", {
        body: { token, password: "newpassword123" },
      });

      const res = await resetPasswordPOST(req);
      expect(res.status).toBe(400);

      const json = await getJson(res);
      expect(json.error).toContain("Invalid or expired");
    });

    it("should return 400 for a used token", async () => {
      const token = createResetToken(resetEmail);

      // Use the token first
      const req1 = makeRequest("http://localhost/api/auth/reset-password", {
        body: { token, password: "anotherpass123" },
      });
      const res1 = await resetPasswordPOST(req1);
      expect(res1.status).toBe(200);

      // Try to use the same token again
      const req2 = makeRequest("http://localhost/api/auth/reset-password", {
        body: { token, password: "yetanother123" },
      });
      const res2 = await resetPasswordPOST(req2);
      expect(res2.status).toBe(400);

      const json = await getJson(res2);
      expect(json.error).toContain("Invalid or expired");
    });

    it("should return 400 for password too short", async () => {
      const token = createResetToken(resetEmail);

      const req = makeRequest("http://localhost/api/auth/reset-password", {
        body: { token, password: "short" },
      });

      const res = await resetPasswordPOST(req);
      expect(res.status).toBe(400);

      const json = await getJson(res);
      expect(json.error).toContain("at least 8 characters");
    });

    it("should return 400 for password too long", async () => {
      const token = createResetToken(resetEmail);

      const req = makeRequest("http://localhost/api/auth/reset-password", {
        body: { token, password: "a".repeat(129) },
      });

      const res = await resetPasswordPOST(req);
      expect(res.status).toBe(400);

      const json = await getJson(res);
      expect(json.error).toContain("at most 128 characters");
    });

    it("should allow login with new password and reject old password after reset", async () => {
      const token = createResetToken(resetEmail);
      const newPassword = "brandnewpass";

      // Reset the password
      const resetReq = makeRequest("http://localhost/api/auth/reset-password", {
        body: { token, password: newPassword },
      });
      const resetRes = await resetPasswordPOST(resetReq);
      expect(resetRes.status).toBe(200);

      // Login with new password should succeed
      const loginReq = makeRequest("http://localhost/api/auth/login", {
        body: { email: resetEmail, password: newPassword },
        headers: { "x-forwarded-for": uniqueIp() },
      });
      const loginRes = await loginPOST(loginReq);
      expect(loginRes.status).toBe(200);

      // Login with old password should fail
      const oldLoginReq = makeRequest("http://localhost/api/auth/login", {
        body: { email: resetEmail, password: originalPassword },
        headers: { "x-forwarded-for": uniqueIp() },
      });
      const oldLoginRes = await loginPOST(oldLoginReq);
      expect(oldLoginRes.status).toBe(401);
    });

    it("should increment token_version (session invalidation) after reset", async () => {
      const db = getDb();
      const userBefore = db
        .prepare("SELECT token_version FROM users WHERE email = ?")
        .get(resetEmail) as { token_version: number };

      const token = createResetToken(resetEmail);
      const req = makeRequest("http://localhost/api/auth/reset-password", {
        body: { token, password: "versioncheck1" },
      });
      const res = await resetPasswordPOST(req);
      expect(res.status).toBe(200);

      const userAfter = db
        .prepare("SELECT token_version FROM users WHERE email = ?")
        .get(resetEmail) as { token_version: number };

      expect(userAfter.token_version).toBe(userBefore.token_version + 1);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should return 200 and clear the auth cookie", async () => {
      const res = await logoutPOST();
      expect(res.status).toBe(200);

      const json = await getJson(res);
      expect(json.success).toBe(true);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      // Cookie should be cleared (maxAge=0 or empty value)
      expect(setCookie).toContain("sketchnotes_token=;");
    });
  });
});
