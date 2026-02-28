export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/submissions
// Fetch submissions with optional filters (status, initiatorId)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {

    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const initiatorId = searchParams.get('initiatorId');

    const submissions = await prisma.submission.findMany({
      where: {
        ...(status ? { status } : { status: { not: 'RESUBMITTED' } }),
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

    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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
      courtOfficerId,
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

      if ((formId || 1) === 2) {
        // ── Form 2: use full FORM2_DOCS_ALL list ──
        const FORM2_DOCS_ALL = [
          { label: "Offer Letter from the landowner and/or the Life Interest Holder", types: ["all"] },
          { label: "Copy of the Title Deed of the property to be leased", types: ["all"] },
          { label: "Copy of the Approved Survey Plan", types: ["all"] },
          { label: "Copy of the Approved Building Plan", types: ["all"] },
          { label: "Latest Street Line Certificate from Municipal Council/Urban Council/Pradeshiya Sabha", types: ["all"] },
          { label: "Latest Building Line Certificate from Municipal Council/Urban Council/Pradeshiya Sabha", types: ["all"] },
          { label: "Latest Non-Vesting Certificate from Municipal Council/Urban Council/Pradeshiya Sabha", types: ["all"] },
          { label: "Certificate of Ownership from Municipal Council/Urban Council/Pradeshiya Sabha", types: ["all"] },
          { label: "Last Municipal Tax payment receipt with a copy of latest Assessment Notice", types: ["all"] },
          { label: "Certificate of Conformity (if there is a building)", types: ["all"] },
          { label: "Declaration that premises are not vested or subject of any notice of acquisition", types: ["all"] },
          { label: "Plan of the building/area to be leased with parking areas", types: ["all"] },
          { label: "Copy of any Mortgage on property (if no Mortgage, confirmation to that effect)", types: ["all"] },
          { label: "If loans outstanding — Copy of Loan Agreement with lending authority", types: ["all"] },
          { label: "Letter of Acceptance", types: ["all"] },
          { label: "Extracts from Land Registry for past 30 years", types: ["all"] },
          { label: "Last receipt of Water and Electricity bills paid", types: ["all"] },
          { label: "Copy of National Identity Card/Cards", types: ["all"] },
          { label: "If owner living abroad — copy of Passport and Power of Attorney", types: ["all"] },
          { label: "Copy of Fire Certificate (for Buildings)", types: ["all"] },
          { label: "Inventory", types: ["all"] },
          { label: "Lessor VAT Registration No (If applicable)", types: ["all"] },
          { label: "Confirmation from Facilities Manager regarding existing buildings", types: ["all"] },
          { label: "Memorandum and Article of Association", types: ["Company"] },
          { label: "Board Resolution", types: ["Company"] },
          { label: "Company registration certificate", types: ["Company"] },
          { label: "Registered Address of the company", types: ["Company"] },
          { label: "Form 20", types: ["Company"] },
          { label: "Partnership registration certificate", types: ["Partnership"] },
          { label: "NIC/passport copies of every partner", types: ["Partnership"] },
          { label: "Other (Partnership)", types: ["Partnership"] },
          { label: "NIC/passport of the sole proprietor", types: ["Sole proprietorship"] },
          { label: "Business registration/sole proprietorship certificate", types: ["Sole proprietorship"] },
          { label: "Other (Sole proprietorship)", types: ["Sole proprietorship"] },
          { label: "NIC (Individual owner)", types: ["Individual"] },
          { label: "Other (Individual)", types: ["Individual"] },
        ];
        FORM2_DOCS_ALL
          .filter(d => d.types.includes('all') || partyTypes.some((t: string) => d.types.includes(t)))
          .forEach(d => {
            if (!seen.has(d.label)) {
              seen.add(d.label);
              documentsData.push({ label: d.label, type: d.types.includes('all') ? 'Common' : d.types[0], status: 'NONE' });
            }
          });
      } else if ((formId || 1) === 3) {
        // ── Form 3: Instruction For Litigation ──
        const FORM3_BASE = [
          'Original Agreement (if any)', 'Original Credit Application',
          'Copy of the Letter of Demand (LOD)', 'Original Postal Article receipt for LOD',
          'Copies of Letters Sent to the Customer', 'Original Letters Sent by the Customer',
          'Originals Documents referred to in the Account statement',
        ];
        const FORM3_BY_TYPE: Record<string, string[]> = {
          'Individual': ['NIC', 'Other (Individual)'],
          'Sole-proprietorship': ['NIC/passport of the sole proprietor', 'Business registration/sole proprietorship certificate', 'Other (Sole proprietorship)'],
          'Partnership': ['Partnership registration certificate', 'NIC/passport copies of every partner', 'Other (Partnership)'],
          'Company': ['Incorporation Certificate of the Company', 'Form 1, 13 or any other document to prove the registered address', 'Any other company related documents'],
        };
        const typeSpecific = partyTypes.flatMap((t: string) => FORM3_BY_TYPE[t] || []);
        [...typeSpecific, ...FORM3_BASE].forEach((label) => {
          if (!seen.has(label)) { seen.add(label); documentsData.push({ label, type: 'Common', status: 'NONE' }); }
        });
      } else if (formConfig?.docs?.length) {
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
        const docMap: Record<string, string[]> = {
          Company: ['Certificate of Incorporation','Form 1 (Company Registration)','Articles of Association','Board Resolution','VAT Registration Certificate'],
          Partnership: ['Partnership Agreement','Business Registration Certificate','NIC copies of all Partners'],
          'Sole proprietorship': ['Business Registration Certificate','NIC copy of Proprietor'],
          Individual: ['NIC copy', 'Proof of Address'],
        };
        partyTypes.forEach((type: string) => {
          (docMap[type] || []).forEach((label) => {
            if (!seen.has(label)) { seen.add(label); documentsData.push({ label, type, status: 'NONE' }); }
          });
        });
        ['Form 15 (latest form)','Form 13 (latest form if applicable)','Form 20 (latest form if applicable)'].forEach((label) => {
          if (!seen.has(label)) { seen.add(label); documentsData.push({ label, type: 'Company', status: 'NONE' }); }
        });
      }

            // ─── Create Submission with All Related Records ───
      // Build approvals based on form type
      const approvalsData: { role: string; approverName: string; approverEmail: string; status: string }[] = [
        { role: 'BUM', approverName: bumName, approverEmail: '', status: 'PENDING' },
        { role: 'FBP', approverName: fbpName, approverEmail: '', status: 'PENDING' },
      ];
      // Form 1 and others include Cluster Head
      if ((formId || 1) !== 3) {
        approvalsData.push({ role: 'CLUSTER_HEAD', approverName: clusterName, approverEmail: '', status: 'PENDING' });
      }

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
          courtOfficerId: courtOfficerId || null,
          parentId: parentId || null,
          isResubmission: isResubmission || false,
          loStage: (formId === 2 ? 'PENDING_CEO' : formId === 3 ? 'PENDING_LEGAL_GM' : 'PENDING_GM'),
          legalGmStage: 'INITIAL_REVIEW',
          bumId: bumId || null,
          fbpId: fbpId || null,
          clusterHeadId: clusterHeadId || null,
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
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
            create: approvalsData,
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