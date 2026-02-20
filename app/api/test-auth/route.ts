export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';

export async function GET() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'madurika.sama@testdimo.com' },
    });
    const hash = createHash('sha256').update('Test@1234').digest('hex');
    return NextResponse.json({
      found: !!user,
      role: user?.role,
      hashMatches: user?.password === hash,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) });
  }
}
