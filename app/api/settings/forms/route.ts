export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const configs = await prisma.formConfig.findMany({
      include: { docs: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { formId: 'asc' },
    });
    return NextResponse.json({ success: true, data: configs });
  } catch (error) {
    console.error('FormConfig GET error:', error); return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { formId, instructions, docs } = body;
    if (!formId) return NextResponse.json({ success: false, error: 'Missing formId' }, { status: 400 });
    // Delete existing docs and recreate
    const config = await prisma.formConfig.upsert({
      where: { formId },
      create: {
        formId,
        formName: `Form ${formId}`,
        instructions: instructions ?? '',
        docs: {
          create: (docs || []).map((d: { label: string; type: string }, i: number) => ({
            label: d.label, type: d.type, sortOrder: i,
          })),
        },
      },
      update: {
        instructions: instructions ?? '',
        docs: {
          deleteMany: {},
          create: (docs || []).map((d: { label: string; type: string }, i: number) => ({
            label: d.label, type: d.type, sortOrder: i,
          })),
        },
      },
      include: { docs: { orderBy: { sortOrder: 'asc' } } },
    });
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to save form config' }, { status: 500 });
  }
}
