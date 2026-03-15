type RateLimitEntry = { count: number; resetAt: number };
const store = new Map<string, RateLimitEntry>();

export interface RateLimitOptions {
  max:        number; // max requests
  windowMs:   number; // window in milliseconds
}

export function checkRateLimit(ip: string, key: string, options: RateLimitOptions): { limited: boolean; retryAfter: number } {
  const storeKey = `${key}:${ip}`;
  const now = Date.now();
  const entry = store.get(storeKey);

  if (!entry || now > entry.resetAt) {
    store.set(storeKey, { count: 1, resetAt: now + options.windowMs });
    return { limited: false, retryAfter: 0 };
  }

  entry.count += 1;
  if (entry.count > options.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { limited: true, retryAfter };
  }

  return { limited: false, retryAfter: 0 };
}

export function getClientIp(req: Request): string {
  const forwarded = (req.headers as Headers).get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
}
