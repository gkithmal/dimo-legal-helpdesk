export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json();
    const {
      role, action, comment,
      approverName, approverEmail,
      assignedOfficer,
      specialApproverEmail, specialApproverName,
      triggeredFromFinalStage,
    } = body;
    const id = (await params).id;

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: { approvals: true, specialApprovers: true },
    });
    if (!submission) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    // ── BUM / FBP / CLUSTER_HEAD ───────────────────────────────────────────
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

    // ── LEGAL GM ───────────────────────────────────────────────────────────
    if (role === 'LEGAL_GM') {
      const isFinal = submission.legalGmStage === 'FINAL_APPROVAL' || submission.status === 'PENDING_LEGAL_GM_FINAL';

      if (action === 'APPROVED') {
        if (isFinal) {
          // Final approval → back to Legal Officer for final paperwork
          await prisma.submission.update({
            where: { id },
            data: {
              status: 'PENDING_LEGAL_OFFICER',
              loStage: 'POST_GM_APPROVAL',
              updatedAt: new Date(),
            },
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
      } else if (action === 'ASSIGN_SPECIAL_APPROVER') {
        // Only allowed in FINAL stage
        if (!isFinal) {
          return NextResponse.json({ success: false, error: 'Special Approver can only be assigned in final stage' }, { status: 400 });
        }
        await prisma.submissionSpecialApprover.create({
          data: {
            submissionId: id,
            approverEmail: specialApproverEmail || '',
            approverName: specialApproverName || '',
            department: 'Special Approver',
            assignedBy: 'LEGAL_GM',
            status: 'PENDING',
          },
        });
        // Store that this special approver was triggered from GM final stage
        await prisma.submission.update({
          where: { id },
          data: {
            status: 'PENDING_SPECIAL_APPROVER',
            loStage: 'POST_GM_APPROVAL', // marks it came from final stage
            updatedAt: new Date(),
          },
        });
      } else if (action === 'SENT_BACK') {
        await prisma.submission.update({ where: { id }, data: { status: 'SENT_BACK', updatedAt: new Date() } });
      } else if (action === 'CANCELLED') {
        await prisma.submission.update({ where: { id }, data: { status: 'CANCELLED', updatedAt: new Date() } });
      }
    }

    // ── LEGAL OFFICER ──────────────────────────────────────────────────────
    if (role === 'LEGAL_OFFICER') {
      if (action === 'SUBMIT_TO_LEGAL_GM') {
        // Legal Officer done → send to Legal GM for final approval
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
        // Legal Officer sends to Special Approver (from active working stage)
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
          data: {
            status: 'PENDING_SPECIAL_APPROVER',
            loStage: 'ACTIVE', // marks it came from LO working stage
            updatedAt: new Date(),
          },
        });
      } else if (action === 'SENT_BACK') {
        await prisma.submission.update({ where: { id }, data: { status: 'SENT_BACK', updatedAt: new Date() } });
      } else if (action === 'RETURNED_TO_INITIATOR') {
        // Save per-document status markings from LO
        const docStatuses: { id: string; status: string; comment?: string }[] = body.docStatuses || [];
        await Promise.all(
          docStatuses.map((ds) =>
            prisma.submissionDocument.update({
              where: { id: ds.id },
              data: { status: ds.status, ...(ds.comment ? { comment: ds.comment } : {}) },
            })
          )
        );
        // Save LO comment and set status to SENT_BACK
        if (comment) {
          await prisma.submissionComment.create({
            data: {
              submissionId: id,
              authorName: approverName || 'Legal Officer',
              authorRole: 'LEGAL_OFFICER',
              text: comment,
            },
          });
        }
        await prisma.submission.update({
          where: { id },
          data: { status: 'SENT_BACK', loStage: 'PENDING_GM', updatedAt: new Date() },
        });
      } else if (action === 'COMPLETED') {
        await prisma.submission.update({ where: { id }, data: { status: 'COMPLETED', updatedAt: new Date() } });
      } else if (action === 'CANCELLED') {
        await prisma.submission.update({ where: { id }, data: { status: 'CANCELLED', updatedAt: new Date() } });
      }
    }

    // ── SPECIAL APPROVER ───────────────────────────────────────────────────
    if (role === 'SPECIAL_APPROVER') {
      await prisma.submissionSpecialApprover.updateMany({
        where: { submissionId: id, approverEmail },
        data: { status: action, comment: comment || null, actionDate: new Date() },
      });

      if (action === 'APPROVED') {
        const all = await prisma.submissionSpecialApprover.findMany({ where: { submissionId: id } });
        if (all.every((a) => a.status === 'APPROVED')) {
          // Always go back to Legal Officer after special approval
          // loStage tells us which stage triggered it
          await prisma.submission.update({
            where: { id },
            data: {
              status: 'PENDING_LEGAL_OFFICER',
              loStage: 'ACTIVE',
              updatedAt: new Date(),
            },
          });
        }
      } else if (action === 'SENT_BACK' || action === 'CANCELLED') {
        // Special approver rejects → back to Initiator
        await prisma.submission.update({
          where: { id },
          data: { status: 'SENT_BACK', updatedAt: new Date() },
        });
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
