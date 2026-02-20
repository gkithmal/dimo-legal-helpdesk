export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: (await params).id },
      include: { parties: true, approvals: true, documents: true, comments: { orderBy: { createdAt: 'asc' } }, specialApprovers: true },
    });
    if (!submission) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    // Resolve assignedLegalOfficer UUID to name
    let legalOfficerName = null;
    if (submission.assignedLegalOfficer) {
      const officer = await prisma.user.findUnique({
        where: { id: submission.assignedLegalOfficer },
        select: { name: true },
      });
      legalOfficerName = officer?.name || null;
    }
    return NextResponse.json({ success: true, data: { ...submission, legalOfficerName } });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json();
    const { status, loStage, legalGmStage, assignedLegalOfficer, documentId, fileUrl, documentStatus } = body;
    // ── Update a single document's fileUrl ──
    if (documentId && fileUrl) {
      const updatedDoc = await prisma.submissionDocument.update({
        where: { id: documentId },
        data: { fileUrl, status: documentStatus || 'UPLOADED', uploadedAt: new Date() },
      });
      return NextResponse.json({ success: true, data: updatedDoc });
    }
    const updated = await prisma.submission.update({
      where: { id: (await params).id },
      data: {
        ...(status && { status }),
        ...(loStage && { loStage }),
        ...(legalGmStage && { legalGmStage }),
        ...(assignedLegalOfficer !== undefined && { assignedLegalOfficer }),
        updatedAt: new Date(),
      },
      include: { parties: true, approvals: true, documents: true, comments: true, specialApprovers: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}
