export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json();
    const { role, action, comment, approverName, approverEmail, assignedOfficer, specialApproverEmail, specialApproverName } = body;
    const id = (await params).id;

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: { approvals: true, specialApprovers: true },
    });
    if (!submission) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    // ── First-Level Approvers (BUM / FBP / CLUSTER_HEAD) ──────────────────
    if (['BUM', 'FBP', 'CLUSTER_HEAD'].includes(role)) {
      await prisma.submissionApproval.updateMany({
        where: { submissionId: id, role },
        data: {
          status: action,
          approverName: approverName || '',
          approverEmail: approverEmail || '',
          comment: comment || null,
          actionDate: new Date(),
        },
      });
      const all = await prisma.submissionApproval.findMany({ where: { submissionId: id } });
      const allApproved = all.every((a) => a.status === 'APPROVED');
      let newStatus = submission.status;
      if (action === 'CANCELLED') newStatus = 'CANCELLED';
      else if (action === 'SENT_BACK') newStatus = 'SENT_BACK';
      else if (allApproved) newStatus = 'PENDING_LEGAL_GM';
      await prisma.submission.update({ where: { id }, data: { status: newStatus, updatedAt: new Date() } });
    }

    // ── Legal GM ───────────────────────────────────────────────────────────
    if (role === 'LEGAL_GM') {
      const isFinal = submission.legalGmStage === 'FINAL_APPROVAL' || submission.status === 'PENDING_LEGAL_GM_FINAL';

      if (action === 'APPROVED') {
        if (isFinal) {
          // Final approval → COMPLETED
          await prisma.submission.update({
            where: { id },
            data: { status: 'COMPLETED', updatedAt: new Date() },
          });
        } else {
          // Initial review: OK to Proceed → Legal Officer
          await prisma.submission.update({
            where: { id },
            data: {
              status: 'PENDING_LEGAL_OFFICER',
              legalGmStage: 'INITIAL_REVIEW',
              assignedLegalOfficer: assignedOfficer || submission.assignedLegalOfficer || '',
              loStage: 'ACTIVE',
              updatedAt: new Date(),
            },
          });
        }
      } else if (action === 'SENT_BACK') {
        await prisma.submission.update({ where: { id }, data: { status: 'SENT_BACK', updatedAt: new Date() } });
      } else if (action === 'CANCELLED') {
        await prisma.submission.update({ where: { id }, data: { status: 'CANCELLED', updatedAt: new Date() } });
      }
    }

    // ── Legal Officer ──────────────────────────────────────────────────────
    if (role === 'LEGAL_OFFICER') {
      if (action === 'SUBMIT_TO_LEGAL_GM') {
        await prisma.submission.update({
          where: { id },
          data: {
            status: 'PENDING_LEGAL_GM_FINAL',
            legalGmStage: 'FINAL_APPROVAL',
            loStage: 'POST_GM_APPROVAL',
            updatedAt: new Date(),
          },
        });
      } else if (action === 'ASSIGN_SPECIAL_APPROVER') {
        await prisma.submissionSpecialApprover.create({
          data: {
            submissionId: id,
            approverEmail: specialApproverEmail || '',
            approverName: specialApproverName || '',
            department: 'Special Approver',
            assignedBy: 'LEGAL_OFFICER',
            status: 'PENDING',
          },
        });
        await prisma.submission.update({
          where: { id },
          data: { status: 'PENDING_SPECIAL_APPROVER', updatedAt: new Date() },
        });
      } else if (action === 'CANCELLED') {
        await prisma.submission.update({ where: { id }, data: { status: 'CANCELLED', updatedAt: new Date() } });
      }
    }

    // ── Special Approver ───────────────────────────────────────────────────
    if (role === 'SPECIAL_APPROVER') {
      await prisma.submissionSpecialApprover.updateMany({
        where: { submissionId: id, approverEmail },
        data: { status: action, comment: comment || null, actionDate: new Date() },
      });
      if (action === 'APPROVED') {
        const all = await prisma.submissionSpecialApprover.findMany({ where: { submissionId: id } });
        if (all.every((a) => a.status === 'APPROVED')) {
          // All done → back to Legal Officer
          await prisma.submission.update({
            where: { id },
            data: { status: 'PENDING_LEGAL_OFFICER', loStage: 'ACTIVE', updatedAt: new Date() },
          });
        }
      } else if (action === 'CANCELLED') {
        await prisma.submission.update({ where: { id }, data: { status: 'CANCELLED', updatedAt: new Date() } });
      }
    }

    const updated = await prisma.submission.findUnique({
      where: { id },
      include: { parties: true, approvals: true, documents: true, comments: true, specialApprovers: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Approve error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process approval' }, { status: 500 });
  }
}
