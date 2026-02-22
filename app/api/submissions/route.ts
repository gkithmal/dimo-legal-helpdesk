export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/submissions
// Fetch submissions with optional filters (status, initiatorId)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const initiatorId = searchParams.get('initiatorId');

    const submissions = await prisma.submission.findMany({
      where: {
        ...(status && { status }),
        ...(initiatorId && { initiatorId }),
      },
      include: {
        parties: true,
        approvals: true,
        documents: true,
        comments: { orderBy: { createdAt: 'asc' } },
        specialApprovers: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Resolve initiatorId to name
    const allIds = [...submissions.map((s: any) => s.initiatorId), ...submissions.map((s: any) => s.assignedLegalOfficer)].filter(Boolean);
    const userIds = [...new Set(allIds)];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds as string[] } },
      select: { id: true, name: true },
    });
    const userMap: Record<string, string> = {};
    users.forEach((u: { id: string; name: string | null }) => { userMap[u.id] = u.name || ''; });
    const enriched = submissions.map((s: any) => ({
      ...s,
      initiatorName: userMap[s.initiatorId] || s.initiatorId,
      legalOfficerName: s.assignedLegalOfficer ? (userMap[s.assignedLegalOfficer] || s.assignedLegalOfficer) : null,
    }));
    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('GET /api/submissions error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch submissions' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/submissions
// Create new submission with guaranteed unique submission number
// Format: LHD_YYYYMMDD_XXX (e.g., LHD_20260219_001)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      formId,
      formName,
      companyCode,
      title,
      sapCostCenter,
      scopeOfAgreement,
      term,
      lkrValue,
      value,
      remarks,
      initiatorComments,
      initiatorId,
      legalOfficerId,
      bumId,
      fbpId,
      clusterHeadId,
      status,
      parties = [],
      parentId,
      isResubmission = false,
    } = body;

    // ─── Validation ───
    if (!initiatorId || !companyCode || !title) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: initiatorId, companyCode, title' },
        { status: 400 }
      );
    }

    const contractValue = lkrValue ?? value ?? '0';
    // ─── Resolve Approver Names ───
    const [bumUser, fbpUser, clusterUser] = await Promise.all([
      bumId ? prisma.user.findUnique({ where: { id: bumId }, select: { name: true } }) : null,
      fbpId ? prisma.user.findUnique({ where: { id: fbpId }, select: { name: true } }) : null,
      clusterHeadId ? prisma.user.findUnique({ where: { id: clusterHeadId }, select: { name: true } }) : null,
    ]);
    const bumName = bumUser?.name || bumId || '';
    const fbpName = fbpUser?.name || fbpId || '';
    const clusterName = clusterUser?.name || clusterHeadId || '';

    // ─── Generate Unique Submission Number (Transaction-Based) ───
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}${String(today.getHours()).padStart(2,"0")}${String(today.getMinutes()).padStart(2,"0")}${String(today.getSeconds()).padStart(2,"0")}`;

    // Use transaction to ensure atomic operations and unique ID generation
    const submission = await prisma.$transaction(async (tx) => {
      // Count today's submissions for sequence number
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const todayCount = await tx.submission.count({
        where: {
          createdAt: {
            gte: todayStart,
            lt: todayEnd,
          },
        },
      });

      // Generate submission number: LHD_20260219_001
        const submissionNo = (body.submissionNo && body.submissionNo.trim()) ? body.submissionNo.trim() : `LHD_${dateStr}_${String(todayCount + 1).padStart(3, "0")}`;

      // ─── Build Required Documents from Party Types ───
      const partyTypes: string[] = [
        ...new Set(
          (parties as { type: string; name: string }[])
            .map((p) => p.type)
            .filter(Boolean)
        ),
      ];

      // ── Load doc config from DB (admin-configured via settings) ──
      const formConfig = await tx.formConfig.findUnique({
        where: { formId: formId || 1 },
        include: { docs: { orderBy: { sortOrder: 'asc' } } },
      });

      const seen = new Set<string>();
      const documentsData: { label: string; type: string; status: string }[] = [];

      if (formConfig?.docs?.length) {
        // Use admin-configured docs: include party-specific + Common
        formConfig.docs.forEach((doc) => {
          const normalizedType = doc.type.replace('-', ' ');
          const isPartyMatch = partyTypes.includes(doc.type) || partyTypes.includes(normalizedType);
          if (doc.type === 'Common' || isPartyMatch) {
            if (!seen.has(doc.label)) {
              seen.add(doc.label);
              documentsData.push({ label: doc.label, type: doc.type, status: 'NONE' });
            }
          }
        });
      } else {
        // Fallback hardcoded map if settings not configured
        const docMap: Record<string, string[]> = {
          Company: ['Certificate of Incorporation','Form 1 (Company Registration)','Articles of Association','Board Resolution','VAT Registration Certificate'],
          Partnership: ['Partnership Agreement','Business Registration Certificate','NIC copies of all Partners'],
          'Sole proprietorship': ['Business Registration Certificate','NIC copy of Proprietor'],
          Individual: ['NIC copy', 'Proof of Address'],
        };
        partyTypes.forEach((type) => {
          (docMap[type] || []).forEach((label) => {
            if (!seen.has(label)) { seen.add(label); documentsData.push({ label, type, status: 'NONE' }); }
          });
        });
        ['Form 15 (latest form)','Form 13 (latest form if applicable)','Form 20 (latest form if applicable)'].forEach((label) => {
          if (!seen.has(label)) { seen.add(label); documentsData.push({ label, type: 'Company', status: 'NONE' }); }
        });
      }

      // ─── Create Submission with All Related Records ───
      return await tx.submission.create({
        data: {
          submissionNo,
          formId: formId || 1,
          formName: formName || 'Contract Review Form',
          status: status || 'PENDING_APPROVAL',
          companyCode,
          title,
          sapCostCenter,
          scopeOfAgreement,
          term,
          value: contractValue,
          remarks: remarks || '',
          initiatorComments: initiatorComments || '',
          initiatorId,
          assignedLegalOfficer: legalOfficerId || null,
          parentId: parentId || null,
          isResubmission: isResubmission || false,
          loStage: 'PENDING_GM',
          legalGmStage: 'INITIAL_REVIEW',
          bumId: bumId || null,
          fbpId: fbpId || null,
          clusterHeadId: clusterHeadId || null,
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          // Related records created in same transaction
          parties: {
            create: (parties as { type: string; name: string }[]).map((p) => ({
              type: p.type,
              name: p.name,
            })),
          },
          documents: {
            create: documentsData,
          },
          approvals: {
            create: [
              {
                role: 'BUM',
                approverName: bumName,
                approverEmail: '',
                status: 'PENDING',
              },
              {
                role: 'FBP',
                approverName: fbpName,
                approverEmail: '',
                status: 'PENDING',
              },
              {
                role: 'CLUSTER_HEAD',
                approverName: clusterName,
                approverEmail: '',
                status: 'PENDING',
              },
            ],
          },
        },
        include: {
          parties: true,
          approvals: true,
          documents: true,
        },
      });
    });

    return NextResponse.json(
      {
        success: true,
        data: submission,
        submissionNo: submission.submissionNo,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/submissions error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    
    // Handle specific Prisma errors
    if (error instanceof Error) {
      // Unique constraint violation
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { success: false, error: 'Submission number already exists. Please try again.' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create submission', detail: errMsg },
      { status: 500 }
    );
  }
}