export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const users = await prisma.user.findMany({
      where: { isActive: true, ...(role ? { role } : {}) },
      select: { id: true, name: true, email: true, role: true, department: true, isActive: true, formIds: true },
      orderBy: { name: 'asc' },
    });
    const parsed = users.map(u => ({
      ...u,
      formIds: u.formIds ? JSON.parse(u.formIds as string) : [],
    }));
    return NextResponse.json({ success: true, data: parsed });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, role, department } = body;
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
    const updated = await prisma.user.update({
      where: { id },
      data: { ...(role !== undefined ? { role } : {}), ...(department !== undefined ? { department } : {}), updatedAt: new Date() },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 });
  }
}
