// Simple in-memory rate limiter
const ipRequests = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(ip: string, options: { windowMs: number; max: number }): { success: boolean; remaining: number } {
  const now = Date.now();
  const key = ip;
  const record = ipRequests.get(key);

  if (!record || now > record.resetTime) {
    ipRequests.set(key, { count: 1, resetTime: now + options.windowMs });
    return { success: true, remaining: options.max - 1 };
  }

  if (record.count >= options.max) {
    return { success: false, remaining: 0 };
  }

  record.count++;
  return { success: true, remaining: options.max - record.count };
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of ipRequests.entries()) {
    if (now > record.resetTime) ipRequests.delete(key);
  }
}, 60000);
