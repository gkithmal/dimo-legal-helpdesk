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
    const { status, loStage, legalGmStage, assignedLegalOfficer, documentId, fileUrl, documentStatus,
      ouLegalReviewCompleted, ouRegisteredDate, ouLegalRefNumber, ouDateOfExecution, ouDateOfExpiration,
      ouDirectorsExecuted1, ouDirectorsExecuted2, ouConsideration, ouReviewedBy, ouRegisteredBy,
      ouSignedSupplierCode, ouRemarks, ouSavedAt } = body;
    // ── Update a single document's fileUrl ──
    if (documentId && fileUrl) {
      const updatedDoc = await prisma.submissionDocument.update({
        where: { id: documentId },
        data: { fileUrl, status: documentStatus || 'UPLOADED', uploadedAt: new Date() },
      });
      return NextResponse.json({ success: true, data: updatedDoc });
    }
    // Update document status/comment from Legal Officer review
    if (documentId && !fileUrl) {
      const { documentStatus: docStatus, documentComment } = body;
      const updatedDoc = await prisma.submissionDocument.update({
        where: { id: documentId },
        data: {
          ...(docStatus && { status: docStatus }),
          ...(documentComment !== undefined && { comment: documentComment }),
        },
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
        ...(ouLegalReviewCompleted !== undefined && { ouLegalReviewCompleted }),
        ...(ouRegisteredDate !== undefined && { ouRegisteredDate }),
        ...(ouLegalRefNumber !== undefined && { ouLegalRefNumber }),
        ...(ouDateOfExecution !== undefined && { ouDateOfExecution }),
        ...(ouDateOfExpiration !== undefined && { ouDateOfExpiration }),
        ...(ouDirectorsExecuted1 !== undefined && { ouDirectorsExecuted1 }),
        ...(ouDirectorsExecuted2 !== undefined && { ouDirectorsExecuted2 }),
        ...(ouConsideration !== undefined && { ouConsideration }),
        ...(ouReviewedBy !== undefined && { ouReviewedBy }),
        ...(ouRegisteredBy !== undefined && { ouRegisteredBy }),
        ...(ouSignedSupplierCode !== undefined && { ouSignedSupplierCode }),
        ...(ouRemarks !== undefined && { ouRemarks }),
        ...(ouSavedAt !== undefined && { ouSavedAt }),
        updatedAt: new Date(),
      },
      include: { parties: true, approvals: true, documents: true, comments: true, specialApprovers: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { label, type } = await req.json();
    const submissionId = (await params).id;
    const doc = await prisma.submissionDocument.create({
      data: { submissionId, label, type, status: 'NONE' },
    });
    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to create document' }, { status: 500 });
  }
}
