import NextAuth from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const handler = NextAuth(authOptions);

export { handler as GET };

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { limited, retryAfter } = checkRateLimit(ip, 'auth', { max: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }
  return handler(req as any, { params: { nextauth: req.url.split('/api/auth/')[1]?.split('/') ?? [] } } as any);
}