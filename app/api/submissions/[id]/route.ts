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
      f2StampDuty, f2LegalFees, f2ReferenceNo, f2BoardApproval, f2Remarks,
      f3GmcApprovalNo, f3CaseNo, f3CaseFillingDate, f3Council, f3Court, f3Remarks,
      f7TerminationLetterRefNo, f7TerminationLetterSentDate,
      f7TerminationLetterFileUrl, f7OfficialRemarks, f7LegalReviewCompleted,
      // Form 9 fields
      f9PropertyOwnerType, f9PropertyOwnerName, f9NIC, f9BusinessRegNo, f9VATRegNo,
      f9OwnerContactNo, f9PremisesAssNo, f9PropertyType, f9ConsiderationRs, f9PlanNo,
      f9LotNo, f9Facilities, f9COCDate, f9GMCApprovalNo, f9GMCApprovalDate,
      f9InitiatorContactNo, f9Remarks, f9ClusterDirectorId, f9GMCMemberId,
      f9FacilityManagerId, f9BoardResolutionNo, f9BoardResolutionDate,
      f9StampDutyOpinionNo, f9StampDutyRs, f9LegalFeeRs, f9ReferenceNo,
      f9DeedNo, f9DeedDate, f9LandRegistryRegNo, f9DateHandoverFinance,
      f9OfficialRemarks, f9LegalReviewCompleted,
      addDocument,
    } = body;
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
    if (addDocument) {
      const doc = await prisma.submissionDocument.create({
        data: { submissionId: (await params).id, label: addDocument.label, type: addDocument.type || 'legal', status: 'NONE', fileUrl: addDocument.fileUrl || null },
      });
      return NextResponse.json({ success: true, data: doc });
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
        ...(f3GmcApprovalNo !== undefined && { f3GmcApprovalNo }),
        ...(f3CaseNo !== undefined && { f3CaseNo }),
        ...(f3CaseFillingDate !== undefined && { f3CaseFillingDate }),
        ...(f3Council !== undefined && { f3Council }),
        ...(f3Court !== undefined && { f3Court }),
        ...(f3Remarks !== undefined && { f3Remarks }),
        ...(f7TerminationLetterRefNo    !== undefined && { f7TerminationLetterRefNo }),
        ...(f7TerminationLetterSentDate !== undefined && { f7TerminationLetterSentDate }),
        ...(f7TerminationLetterFileUrl  !== undefined && { f7TerminationLetterFileUrl }),
        ...(f7OfficialRemarks           !== undefined && { f7OfficialRemarks }),
        ...(f7LegalReviewCompleted      !== undefined && { f7LegalReviewCompleted }),
        ...(f9PropertyOwnerType   !== undefined && { f9PropertyOwnerType }),
        ...(f9PropertyOwnerName   !== undefined && { f9PropertyOwnerName }),
        ...(f9NIC                 !== undefined && { f9NIC }),
        ...(f9BusinessRegNo       !== undefined && { f9BusinessRegNo }),
        ...(f9VATRegNo            !== undefined && { f9VATRegNo }),
        ...(f9OwnerContactNo      !== undefined && { f9OwnerContactNo }),
        ...(f9PremisesAssNo       !== undefined && { f9PremisesAssNo }),
        ...(f9PropertyType        !== undefined && { f9PropertyType }),
        ...(f9ConsiderationRs     !== undefined && { f9ConsiderationRs }),
        ...(f9PlanNo              !== undefined && { f9PlanNo }),
        ...(f9LotNo               !== undefined && { f9LotNo }),
        ...(f9Facilities          !== undefined && { f9Facilities }),
        ...(f9COCDate             !== undefined && { f9COCDate }),
        ...(f9GMCApprovalNo       !== undefined && { f9GMCApprovalNo }),
        ...(f9GMCApprovalDate     !== undefined && { f9GMCApprovalDate }),
        ...(f9InitiatorContactNo  !== undefined && { f9InitiatorContactNo }),
        ...(f9Remarks             !== undefined && { f9Remarks }),
        ...(f9ClusterDirectorId   !== undefined && { f9ClusterDirectorId }),
        ...(f9GMCMemberId         !== undefined && { f9GMCMemberId }),
        ...(f9FacilityManagerId   !== undefined && { f9FacilityManagerId }),
        ...(f9BoardResolutionNo   !== undefined && { f9BoardResolutionNo }),
        ...(f9BoardResolutionDate !== undefined && { f9BoardResolutionDate }),
        ...(f9StampDutyOpinionNo  !== undefined && { f9StampDutyOpinionNo }),
        ...(f9StampDutyRs         !== undefined && { f9StampDutyRs }),
        ...(f9LegalFeeRs          !== undefined && { f9LegalFeeRs }),
        ...(f9ReferenceNo         !== undefined && { f9ReferenceNo }),
        ...(f9DeedNo              !== undefined && { f9DeedNo }),
        ...(f9DeedDate            !== undefined && { f9DeedDate }),
        ...(f9LandRegistryRegNo   !== undefined && { f9LandRegistryRegNo }),
        ...(f9DateHandoverFinance !== undefined && { f9DateHandoverFinance }),
        ...(f9OfficialRemarks     !== undefined && { f9OfficialRemarks }),
        ...(f9LegalReviewCompleted !== undefined && { f9LegalReviewCompleted }),
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