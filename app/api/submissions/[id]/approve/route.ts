export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {

    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const {
      role, action, comment,
      approverName, approverEmail,
      assignedOfficer,
      courtOfficerId, courtOfficerEmail, courtOfficerName,
      specialApproverEmail, specialApproverName,
    } = body;
    const id = (await params).id;

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: { approvals: true, specialApprovers: true },
    });
    if (!submission) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    // ── BUM / FBP / CLUSTER_HEAD ───────────────────────────────────────────
    if (['BUM', 'FBP', 'CLUSTER_HEAD', 'GENERAL_MANAGER'].includes(role)) {
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
      let relevantApprovals;
      if (submission.formId === 7) {
        relevantApprovals = all.filter((a) => ['BUM', 'GENERAL_MANAGER'].includes(a.role));
      } else if (submission.formId === 3 || submission.formId === 10) {
        relevantApprovals = all.filter((a) => ['BUM', 'FBP'].includes(a.role));
      } else if (submission.formId === 2) {
        relevantApprovals = all.filter((a) => ['BUM', 'FBP', 'CLUSTER_HEAD'].includes(a.role));
      } else {
        relevantApprovals = all;
      }
      const allApproved = relevantApprovals.every((a) => a.status === 'APPROVED');
      let newStatus = submission.status;
      if (action === 'CANCELLED') newStatus = 'CANCELLED';
      else if (action === 'SENT_BACK') newStatus = 'SENT_BACK';
      else if (allApproved) {
        newStatus = submission.formId === 2 ? 'PENDING_CEO' : 'PENDING_LEGAL_GM';
      }
      await prisma.submission.update({ where: { id }, data: { status: newStatus, updatedAt: new Date() } });
    }

    // ── CEO ───────────────────────────────────────────────────────────────
    if (role === 'CEO') {
      await prisma.submissionApproval.updateMany({
        where: { submissionId: id, role: 'CEO' },
        data: {
          status: action,
          approverName: approverName || '',
          approverEmail: approverEmail || '',
          comment: comment || null,
          actionDate: new Date(),
        },
      });
      const newStatus = action === 'APPROVED' ? 'PENDING_LEGAL_GM' : action === 'CANCELLED' ? 'CANCELLED' : 'SENT_BACK';
      await prisma.submission.update({ where: { id }, data: { status: newStatus, updatedAt: new Date() } });
    }

    // ── LEGAL GM ───────────────────────────────────────────────────────────
    if (role === 'LEGAL_GM') {
      const isFinal = submission.legalGmStage === 'FINAL_APPROVAL' || submission.status === 'PENDING_LEGAL_GM_FINAL';
      const isForm9 = submission.formId === 9;
      // Form 3 and Form 10 share the same litigation flow (BUM+FBP → LO → Court Officer)
      const isForm3 = submission.formId === 3 || submission.formId === 10;
      const isForm7 = submission.formId === 7;

      // ── Form 9: Title Review stage ────────────────────────────────────────
      if (isForm9 && submission.legalGmStage === 'F9_TITLE_REVIEW') {
        if (action === 'APPROVED') {
          await prisma.submission.update({
            where: { id },
            data: { status: 'PENDING_BUM_CONFIRM', updatedAt: new Date() },
          });
        } else if (action === 'SENT_BACK') {
          // Send back to LO for re-verification
          await prisma.submission.update({
            where: { id },
            data: {
              status: 'PENDING_LEGAL_OFFICER',
              loStage: 'F9_TITLE_VERIFICATION',
              legalGmStage: 'INITIAL_REVIEW',
              updatedAt: new Date(),
            },
          });
        } else if (action === 'CANCELLED') {
          await prisma.submission.update({
            where: { id },
            data: { status: 'CANCELLED', updatedAt: new Date() },
          });
        }
        const updatedF9 = await prisma.submission.findUnique({
          where: { id },
          include: { parties: true, approvals: true, documents: true, comments: true, specialApprovers: true },
        });
        return NextResponse.json({ success: true, data: updatedF9 });
      }

      // ── Form 9: Final approval stage ──────────────────────────────────────
      if (isForm9 && isFinal) {
        if (action === 'APPROVED') {
          await prisma.submission.update({
            where: { id },
            data: {
              status: 'PENDING_LEGAL_OFFICER',
              loStage: 'F9_EXECUTION',
              updatedAt: new Date(),
            },
          });
        } else if (action === 'CANCELLED') {
          await prisma.submission.update({
            where: { id },
            data: { status: 'CANCELLED', updatedAt: new Date() },
          });
        }
        const updatedF9 = await prisma.submission.findUnique({
          where: { id },
          include: { parties: true, approvals: true, documents: true, comments: true, specialApprovers: true },
        });
        return NextResponse.json({ success: true, data: updatedF9 });
      }

      // ── Form 9: Initial review (OK to Proceed) ────────────────────────────
      if (isForm9 && !isFinal) {
        if (action === 'APPROVED') {
          const targetAssignedOfficer = assignedOfficer || submission.assignedLegalOfficer || '';
          await prisma.submission.update({
            where: { id },
            data: {
              status: 'PENDING_LEGAL_OFFICER',
              legalGmStage: 'INITIAL_REVIEW',
              assignedLegalOfficer: targetAssignedOfficer,
              loStage: 'F9_TITLE_VERIFICATION',
              updatedAt: new Date(),
            },
          });
        } else if (action === 'SENT_BACK') {
          await prisma.submission.update({ where: { id }, data: { status: 'SENT_BACK', updatedAt: new Date() } });
        } else if (action === 'CANCELLED') {
          await prisma.submission.update({ where: { id }, data: { status: 'CANCELLED', updatedAt: new Date() } });
        }
        const updatedF9 = await prisma.submission.findUnique({
          where: { id },
          include: { parties: true, approvals: true, documents: true, comments: true, specialApprovers: true },
        });
        return NextResponse.json({ success: true, data: updatedF9 });
      }

      // ── All other forms ───────────────────────────────────────────────────
      if (action === 'APPROVED') {
        if (isFinal) {
          // FINAL_APPROVAL: optional special approvers before LO finalizes
          const gmSpecialApprovers: { email: string; name: string; dept: string }[] = body.specialApprovers || [];
          if (gmSpecialApprovers.length > 0) {
            // Cancel any existing pending special approvers for this stage
            await prisma.submissionSpecialApprover.updateMany({
              where: { submissionId: id, status: 'PENDING' },
              data: { status: 'CANCELLED' },
            });
            // Create new special approver records assigned by LEGAL_GM for FINAL stage
            for (const sa of gmSpecialApprovers) {
              await prisma.submissionSpecialApprover.create({
                data: {
                  submissionId: id,
                  approverEmail: sa.email,
                  approverName: sa.name || sa.email,
                  department: sa.dept || 'Special Approver',
                  assignedBy: 'LEGAL_GM_FINAL',
                  status: 'PENDING',
                },
              });
            }
            if (isForm3) {
              await prisma.submission.update({
                where: { id },
                data: {
                  status: 'PENDING_SPECIAL_APPROVER',
                  legalGmStage: 'FINAL_APPROVAL',
                  loStage: 'POST_GM_APPROVAL',
                  updatedAt: new Date(),
                },
              });
            } else {
              await prisma.submission.update({
                where: { id },
                data: {
                  status: 'PENDING_SPECIAL_APPROVER',
                  legalGmStage: 'FINAL_APPROVAL',
                  loStage: 'FINALIZATION',
                  updatedAt: new Date(),
                },
              });
            }
          } else if (isForm3) {
            // Form 3: after final GM approval → Court Officer does final confirmation
            await prisma.submission.update({
              where: { id },
              data: {
                status: 'PENDING_COURT_OFFICER',
                loStage: 'POST_GM_APPROVAL',
                updatedAt: new Date(),
              },
            });
          } else if (isForm7) {
            await prisma.submission.update({
              where: { id },
              data: { status: 'PENDING_LEGAL_OFFICER', loStage: 'POST_GM_APPROVAL', updatedAt: new Date() },
            });
          } else {
            // Form 2: after final GM approval → Legal Officer finalizes directly
            await prisma.submission.update({
              where: { id },
              data: {
                status: 'PENDING_LEGAL_OFFICER',
                loStage: 'FINALIZATION',
                updatedAt: new Date(),
              },
            });
          }
        } else {
          // Initial OK to Proceed — check for special approvers
          const targetAssignedOfficer = assignedOfficer || submission.assignedLegalOfficer || '';
          if (isForm7) {
            await prisma.submission.update({
              where: { id },
              data: { status: 'PENDING_LEGAL_OFFICER', legalGmStage: 'INITIAL_REVIEW', assignedLegalOfficer: targetAssignedOfficer, loStage: 'INITIAL_REVIEW', updatedAt: new Date() },
            });
          } else {
          const gmSpecialApprovers: { email: string; name: string; dept: string }[] = body.specialApprovers || [];
          const targetLoStage = isForm3 ? 'ASSIGN_COURT_OFFICER' : 'INITIAL_REVIEW';
          if (gmSpecialApprovers.length > 0) {
            // Cancel any existing pending special approvers
            await prisma.submissionSpecialApprover.updateMany({
              where: { submissionId: id, status: 'PENDING' },
              data: { status: 'CANCELLED' },
            });
            for (const sa of gmSpecialApprovers) {
              await prisma.submissionSpecialApprover.create({
                data: {
                  submissionId: id,
                  approverEmail: sa.email,
                  approverName: sa.name || sa.email,
                  department: sa.dept || 'Special Approver',
                  assignedBy: 'LEGAL_GM_INITIAL',
                  status: 'PENDING',
                },
              });
            }
            await prisma.submission.update({
              where: { id },
              data: {
                status: 'PENDING_SPECIAL_APPROVER',
                legalGmStage: 'INITIAL_REVIEW',
                assignedLegalOfficer: targetAssignedOfficer,
                loStage: targetLoStage,
                updatedAt: new Date(),
              },
            });
          } else {
            // No special approvers → go directly to Legal Officer
            await prisma.submission.update({
              where: { id },
              data: {
                status: 'PENDING_LEGAL_OFFICER',
                legalGmStage: 'INITIAL_REVIEW',
                assignedLegalOfficer: targetAssignedOfficer,
                loStage: targetLoStage,
                updatedAt: new Date(),
              },
            });
          }
          } // end non-Form7 initial branch
        }
      } else if (action === 'SENT_BACK') {
        await prisma.submission.update({ where: { id }, data: { status: 'SENT_BACK', updatedAt: new Date() } });
      } else if (action === 'CANCELLED') {
        await prisma.submission.update({ where: { id }, data: { status: 'CANCELLED', updatedAt: new Date() } });
      }
    }

    // ── LEGAL OFFICER ──────────────────────────────────────────────────────
    if (role === 'LEGAL_OFFICER') {
      // ── Form 9 specific LO actions (early return) ─────────────────────────
      if (submission.formId === 9) {
        if (action === 'F9_SUBMIT_TITLE_TO_GM') {
          // LO submits title verification → LGM reviews
          await prisma.submission.update({
            where: { id },
            data: {
              status: 'PENDING_LEGAL_GM',
              legalGmStage: 'F9_TITLE_REVIEW',
              loStage: 'F9_PENDING_GM',
              updatedAt: new Date(),
            },
          });
        } else if (action === 'F9_SUBMIT_TO_FM') {
          // LO submits to Facility Manager after reviewing all docs
          const fmId = body.facilityManagerId || null;
          await prisma.submission.update({
            where: { id },
            data: {
              status: 'PENDING_FACILITY_MANAGER',
              loStage: 'F9_PENDING_FM',
              f9FacilityManagerId: fmId,
              updatedAt: new Date(),
            },
          });
        } else if (action === 'F9_SUBMIT_FINAL_TO_GM') {
          // LO submits drafted deed to LGM for final approval
          await prisma.submission.update({
            where: { id },
            data: {
              status: 'PENDING_LEGAL_GM_FINAL',
              legalGmStage: 'FINAL_APPROVAL',
              loStage: 'F9_PENDING_FINAL_GM',
              updatedAt: new Date(),
            },
          });
        } else if (action === 'F9_JOB_COMPLETE') {
          // LO finishes execution → CEO acknowledges physical document handover
          await prisma.submission.update({
            where: { id },
            data: {
              status: 'PENDING_CEO',
              loStage: 'F9_DONE',
              f9LegalReviewCompleted: true,
              f9BoardResolutionNo:   body.f9BoardResolutionNo   || null,
              f9BoardResolutionDate: body.f9BoardResolutionDate || null,
              f9StampDutyOpinionNo:  body.f9StampDutyOpinionNo  || null,
              f9StampDutyRs:         body.f9StampDutyRs         || null,
              f9LegalFeeRs:          body.f9LegalFeeRs          || null,
              f9ReferenceNo:         body.f9ReferenceNo         || null,
              f9DeedNo:              body.f9DeedNo              || null,
              f9DeedDate:            body.f9DeedDate            || null,
              f9LandRegistryRegNo:   body.f9LandRegistryRegNo   || null,
              f9DateHandoverFinance: body.f9DateHandoverFinance || null,
              f9OfficialRemarks:     body.f9OfficialRemarks     || null,
              updatedAt: new Date(),
            },
          });
        } else if (action === 'F9_SAVE_OFFICIAL') {
          // Partial save of official use fields (no status change)
          await prisma.submission.update({
            where: { id },
            data: {
              f9BoardResolutionNo:   body.f9BoardResolutionNo   || null,
              f9BoardResolutionDate: body.f9BoardResolutionDate || null,
              f9StampDutyOpinionNo:  body.f9StampDutyOpinionNo  || null,
              f9StampDutyRs:         body.f9StampDutyRs         || null,
              f9LegalFeeRs:          body.f9LegalFeeRs          || null,
              f9ReferenceNo:         body.f9ReferenceNo         || null,
              f9DeedNo:              body.f9DeedNo              || null,
              f9DeedDate:            body.f9DeedDate            || null,
              f9LandRegistryRegNo:   body.f9LandRegistryRegNo   || null,
              f9DateHandoverFinance: body.f9DateHandoverFinance || null,
              f9OfficialRemarks:     body.f9OfficialRemarks     || null,
              updatedAt: new Date(),
            },
          });
        } else if (action === 'F9_REQUEST_MORE_DOCS') {
          // LO sends back to BUM for more documents
          await prisma.submission.update({
            where: { id },
            data: { status: 'PENDING_BUM_DOCS', loStage: 'F9_REVIEW_DOCS', updatedAt: new Date() },
          });
        }
        const updatedF9 = await prisma.submission.findUnique({
          where: { id },
          include: { parties: true, approvals: true, documents: true, comments: true, specialApprovers: true },
        });
        return NextResponse.json({ success: true, data: updatedF9 });
      }

      // ── All other forms LO actions ────────────────────────────────────────
      if (action === 'ASSIGN_COURT_OFFICER') {
        if (!courtOfficerId) {
          return NextResponse.json({ success: false, error: 'Court officer ID is required' }, { status: 400 });
        }
        const courtOfficerUser = await prisma.user.findUnique({ where: { id: courtOfficerId } });
        if (!courtOfficerUser || courtOfficerUser.role !== 'COURT_OFFICER') {
          return NextResponse.json({ success: false, error: 'Invalid court officer' }, { status: 400 });
        }
        // Legal Officer assigns a Court Officer → status moves to PENDING_COURT_OFFICER
        await prisma.submission.update({
          where: { id },
          data: {
            status: 'PENDING_COURT_OFFICER',
            courtOfficerId,
            loStage: 'PENDING_COURT_OFFICER',
            updatedAt: new Date(),
          },
        });
      } else if (action === 'SUBMIT_TO_LEGAL_GM') {
        // Legal Officer done reviewing CO work → send to Legal GM for final approval
        await prisma.submission.update({
          where: { id },
          data: {
            status: 'PENDING_LEGAL_GM_FINAL',
            legalGmStage: 'FINAL_APPROVAL',
            loStage: 'PENDING_GM',
            updatedAt: new Date(),
          },
        });
      } else if (action === 'ASSIGN_SPECIAL_APPROVER') {
        if (!specialApproverEmail) {
          return NextResponse.json({ success: false, error: 'Special approver email is required' }, { status: 400 });
        }
        await prisma.submissionSpecialApprover.create({
          data: {
            submissionId: id,
            approverEmail: specialApproverEmail,
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
            loStage: 'REVIEW_FOR_GM',
            updatedAt: new Date(),
          },
        });
      } else if (action === 'RETURNED_TO_INITIATOR') {
        const docStatuses: { id: string; status: string; comment?: string }[] = body.docStatuses || [];
        await Promise.all(
          docStatuses.map((ds) =>
            prisma.submissionDocument.update({
              where: { id: ds.id },
              data: { status: ds.status, ...(ds.comment ? { comment: ds.comment } : {}) },
            })
          )
        );
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
          data: { status: 'SENT_BACK', loStage: null, updatedAt: new Date() },
        });
      } else if (action === 'COMPLETED') {
        await prisma.submission.update({ where: { id }, data: { status: 'COMPLETED', updatedAt: new Date() } });
      } else if (action === 'SENT_BACK') {
        await prisma.submission.update({ where: { id }, data: { status: 'SENT_BACK', updatedAt: new Date() } });
      } else if (action === 'CANCELLED') {
        await prisma.submission.update({ where: { id }, data: { status: 'CANCELLED', updatedAt: new Date() } });
      }
    }

    // ── COURT OFFICER ─────────────────────────────────────────────────────────
    if (role === 'COURT_OFFICER') {
      if (action === 'SUBMIT_TO_LEGAL_OFFICER') {
        const isFinalStage = submission.loStage === 'POST_GM_APPROVAL';
        await prisma.submission.update({
          where: { id },
          data: {
            status: 'PENDING_LEGAL_OFFICER',
            // If coming from final GM approval → LO enters finalization
            // If coming from first visit → LO reviews for GM
            loStage: isFinalStage ? 'FINALIZATION' : 'REVIEW_FOR_GM',
            updatedAt: new Date(),
          },
        });
      } else if (action === 'ASSIGN_SPECIAL_APPROVER') {
        if (!specialApproverEmail) {
          return NextResponse.json({ success: false, error: 'Special approver email is required' }, { status: 400 });
        }
        await prisma.submissionSpecialApprover.create({
          data: {
            submissionId: id,
            approverEmail: specialApproverEmail,
            approverName: specialApproverName || '',
            department: 'Special Approver',
            assignedBy: 'COURT_OFFICER',
            status: 'PENDING',
          },
        });
        await prisma.submission.update({
          where: { id },
          data: { status: 'PENDING_SPECIAL_APPROVER', loStage: 'PENDING_COURT_OFFICER', updatedAt: new Date() },
        });
      } else if (action === 'SENT_BACK') {
        await prisma.submission.update({ where: { id }, data: { status: 'SENT_BACK', updatedAt: new Date() } });
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
        const pendingOnes = all.filter((a) => a.status === 'PENDING');
        if (pendingOnes.length === 0) {
          // All approved — determine where to route based on who assigned the special approver
          const prevLoStage = submission.loStage;
          const lastApprover = all[all.length - 1];
          const assignedBy = lastApprover?.assignedBy || 'LEGAL_OFFICER';

          if (prevLoStage === 'PENDING_COURT_OFFICER') {
            // Assigned by Court Officer → return to Court Officer
            await prisma.submission.update({
              where: { id },
              data: { status: 'PENDING_COURT_OFFICER', loStage: 'PENDING_COURT_OFFICER', updatedAt: new Date() },
            });
          } else if (assignedBy === 'LEGAL_GM_INITIAL') {
            // Assigned by Legal GM during initial review → go to Legal Officer for review
            await prisma.submission.update({
              where: { id },
              data: {
                status: 'PENDING_LEGAL_OFFICER',
                loStage: 'INITIAL_REVIEW',
                updatedAt: new Date(),
              },
            });
          } else if (assignedBy === 'LEGAL_GM_FINAL') {
            // Assigned by Legal GM during final approval → go to Legal Officer for finalization
            const targetLoStage = prevLoStage === 'FINALIZATION' ? 'FINALIZATION' : 'POST_GM_APPROVAL';
            await prisma.submission.update({
              where: { id },
              data: {
                status: 'PENDING_LEGAL_OFFICER',
                loStage: targetLoStage,
                updatedAt: new Date(),
              },
            });
          } else {
            // Assigned by Legal Officer → return to Legal Officer (REVIEW_FOR_GM)
            await prisma.submission.update({
              where: { id },
              data: {
                status: 'PENDING_LEGAL_OFFICER',
                loStage: 'REVIEW_FOR_GM',
                updatedAt: new Date(),
              },
            });
          }
        }
      } else if (action === 'SENT_BACK' || action === 'CANCELLED') {
        await prisma.submission.update({
          where: { id },
          data: { status: 'SENT_BACK', updatedAt: new Date() },
        });
      }
    }

    // ── FORM 9: BUM CONFIRM ────────────────────────────────────────────────
    if (role === 'BUM_F9_CONFIRM') {
      if (action === 'PROCEED') {
        await prisma.submission.update({
          where: { id },
          data: { status: 'PENDING_CLUSTER_DIRECTOR', updatedAt: new Date() },
        });
      } else if (action === 'CANCELLED') {
        await prisma.submission.update({
          where: { id },
          data: { status: 'CANCELLED', updatedAt: new Date() },
        });
      }
    }

    // ── FORM 9: CLUSTER DIRECTOR ───────────────────────────────────────────
    if (role === 'CLUSTER_DIRECTOR') {
      if (action === 'APPROVED') {
        await prisma.submission.update({
          where: { id },
          data: { status: 'PENDING_GMC', updatedAt: new Date() },
        });
      } else if (action === 'CANCELLED') {
        await prisma.submission.update({
          where: { id },
          data: { status: 'CANCELLED', updatedAt: new Date() },
        });
      }
    }

    // ── FORM 9: GMC ────────────────────────────────────────────────────────
    if (role === 'GMC_MEMBER') {
      if (action === 'APPROVED') {
        // Auto-add extra documents based on property owner type
        const ownerType = submission.f9PropertyOwnerType || 'Individual';
        const extraDocs = getF9ExtraDocs(ownerType);
        for (const label of extraDocs) {
          const exists = await prisma.submissionDocument.findFirst({
            where: { submissionId: id, label },
          });
          if (!exists) {
            await prisma.submissionDocument.create({
              data: { submissionId: id, label, type: 'required', status: 'NONE' },
            });
          }
        }
        await prisma.submission.update({
          where: { id },
          data: { status: 'PENDING_BUM_DOCS', updatedAt: new Date() },
        });
      } else if (action === 'CANCELLED') {
        await prisma.submission.update({
          where: { id },
          data: { status: 'CANCELLED', updatedAt: new Date() },
        });
      }
    }

    // ── FORM 9: BUM DOCS SUBMIT ────────────────────────────────────────────
    if (role === 'BUM_F9_DOCS') {
      if (action === 'SUBMITTED') {
        await prisma.submission.update({
          where: { id },
          data: {
            status: 'PENDING_LEGAL_OFFICER',
            loStage: 'F9_REVIEW_DOCS',
            updatedAt: new Date(),
          },
        });
      }
    }

    // ── FORM 9: FACILITY MANAGER ───────────────────────────────────────────
    if (role === 'FACILITY_MANAGER') {
      if (action === 'APPROVED') {
        await prisma.submission.update({
          where: { id },
          data: {
            status: 'PENDING_LEGAL_OFFICER',
            loStage: 'F9_FINALIZATION',
            updatedAt: new Date(),
          },
        });
      } else if (action === 'CANCELLED') {
        await prisma.submission.update({
          where: { id },
          data: { status: 'CANCELLED', updatedAt: new Date() },
        });
      }
    }

    // ── FORM 9: CEO ACKNOWLEDGE ────────────────────────────────────────────
    if (role === 'CEO_F9') {
      if (action === 'ACKNOWLEDGED') {
        await prisma.submission.update({
          where: { id },
          data: { status: 'COMPLETED', updatedAt: new Date() },
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

// ── Helper: Form 9 extra docs by owner type ────────────────────────────────
function getF9ExtraDocs(ownerType: string): string[] {
  if (ownerType === 'Company') {
    return [
      'Articles of Association',
      'Board Resolution',
      'Certificate of Incorporation',
      'Form 1 and or Latest Form 20',
      'Copy of the Utility Bills (Water and Electricity)',
      'Bank Details of the landlord',
    ];
  }
  if (ownerType === 'Partnership') {
    return [
      'Partnership Registration Certificate',
      'NIC / Passport copies of every partner',
      'Copy of the Utility Bills (Water and Electricity)',
      'Bank Details of the landlord',
    ];
  }
  // Individual (default)
  return [
    'Copy of the National Identity Card of the Landlord',
    'Copy of the Passport (if dual Citizen)',
    'Business Registration Certificate',
    'Copy of the Utility Bills (Water and Electricity)',
    'Bank Details of the landlord',
  ];
}