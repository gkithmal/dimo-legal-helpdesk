export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';


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

    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { status, loStage, legalGmStage, assignedLegalOfficer, documentId, fileUrl, documentStatus, scopeOfAgreement,
      ouLegalReviewCompleted, ouRegisteredDate, ouLegalRefNumber, ouDateOfExecution, ouDateOfExpiration,
      ouDirectorsExecuted1, ouDirectorsExecuted2, ouConsideration, ouReviewedBy, ouRegisteredBy,
      ouSignedSupplierCode, ouRemarks, ouSavedAt, financeViewedAt,
      f2StampDuty, f2LegalFees, f2ReferenceNo, f2BoardApproval, f2Remarks } = body;
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
        ...(scopeOfAgreement !== undefined && { scopeOfAgreement }),
        ...(status && { status }),
        ...(loStage !== undefined && { loStage }),
        ...(legalGmStage !== undefined && { legalGmStage }),
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
        ...(financeViewedAt !== undefined && { financeViewedAt: new Date(financeViewedAt) }),
        ...(f2StampDuty !== undefined && { f2StampDuty }),
        ...(f2LegalFees !== undefined && { f2LegalFees }),
        ...(f2ReferenceNo !== undefined && { f2ReferenceNo }),
        ...(f2BoardApproval !== undefined && { f2BoardApproval }),
        ...(f2Remarks !== undefined && { f2Remarks }),
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

    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Only allow deleting DRAFT submissions
    const submission = await prisma.submission.findUnique({ where: { id }, select: { status: true } });
    if (!submission) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    if (submission.status !== 'DRAFT') return NextResponse.json({ success: false, error: 'Only drafts can be deleted' }, { status: 400 });

    await prisma.$transaction([
      prisma.submissionParty.deleteMany({ where: { submissionId: id } }),
      prisma.submissionApproval.deleteMany({ where: { submissionId: id } }),
      prisma.submissionDocument.deleteMany({ where: { submissionId: id } }),
      prisma.submissionComment.deleteMany({ where: { submissionId: id } }),
      prisma.submissionSpecialApprover.deleteMany({ where: { submissionId: id } }),
      prisma.submission.delete({ where: { id } }),
    ]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE submission error:', err);
    return NextResponse.json({ success: false, error: 'Failed to delete' }, { status: 500 });
  }
}
