// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Use fake timers to control setInterval and Date.now
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

// Dynamic import so each test suite gets a fresh module with a fresh Map
async function getRateLimit() {
  const mod = await import("./rate-limit");
  return mod.rateLimit;
}

describe("rateLimit", () => {
  it("first request succeeds with correct remaining count", async () => {
    const rateLimit = await getRateLimit();
    const result = rateLimit("192.168.1.1", { windowMs: 60000, max: 5 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("requests up to max succeed", async () => {
    const rateLimit = await getRateLimit();
    const opts = { windowMs: 60000, max: 3 };

    const r1 = rateLimit("10.0.0.1", opts);
    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = rateLimit("10.0.0.1", opts);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = rateLimit("10.0.0.1", opts);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("request at max+1 fails with remaining 0", async () => {
    const rateLimit = await getRateLimit();
    const opts = { windowMs: 60000, max: 2 };

    rateLimit("10.0.0.2", opts);
    rateLimit("10.0.0.2", opts);

    const r3 = rateLimit("10.0.0.2", opts);
    expect(r3.success).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("window resets after windowMs elapses", async () => {
    const rateLimit = await getRateLimit();
    const opts = { windowMs: 5000, max: 1 };

    const r1 = rateLimit("10.0.0.3", opts);
    expect(r1.success).toBe(true);

    const r2 = rateLimit("10.0.0.3", opts);
    expect(r2.success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(5001);

    const r3 = rateLimit("10.0.0.3", opts);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("different IPs have independent limits", async () => {
    const rateLimit = await getRateLimit();
    const opts = { windowMs: 60000, max: 1 };

    const r1 = rateLimit("ip-a", opts);
    expect(r1.success).toBe(true);

    const r2 = rateLimit("ip-b", opts);
    expect(r2.success).toBe(true);

    // ip-a is now at limit
    const r3 = rateLimit("ip-a", opts);
    expect(r3.success).toBe(false);

    // ip-b is also at limit independently
    const r4 = rateLimit("ip-b", opts);
    expect(r4.success).toBe(false);
  });

  it("remaining count decreases with each request", async () => {
    const rateLimit = await getRateLimit();
    const opts = { windowMs: 60000, max: 5 };

    for (let i = 0; i < 5; i++) {
      const result = rateLimit("10.0.0.4", opts);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });
});
