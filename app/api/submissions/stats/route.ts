export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const submissions = await prisma.submission.findMany({
      select: {
        id: true,
        submissionNo: true,
        formId: true,
        formName: true,
        status: true,
        assignedLegalOfficer: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // ── Stats cards: count per formId ──
    const formCounts: Record<number, { label: string; count: number }> = {};
    const ALL_FORMS = [
      { id: 1,  name: 'Contract Review Form' },
      { id: 2,  name: 'Lease Agreement' },
      { id: 3,  name: 'Instruction For Litigation' },
      { id: 4,  name: 'Vehicle Rent Agreement' },
      { id: 5,  name: 'Request for Power of Attorney' },
      { id: 6,  name: 'Registration of a Trademark' },
      { id: 7,  name: 'Termination of agreements' },
      { id: 8,  name: 'Handing over of leased premises' },
      { id: 9,  name: 'Approval for Purchasing Premises' },
      { id: 10, name: 'Letter of Demand' },
    ];
    ALL_FORMS.forEach((f) => { formCounts[f.id] = { label: f.name, count: 0 }; });
    submissions.forEach((s) => {
      const fid = s.formId || 1;
      if (formCounts[fid]) formCounts[fid].count++;
    });
    const statsCards = ALL_FORMS.map((f) => ({
      formId: f.id,
      label:  formCounts[f.id]?.label ?? f.name,
      count:  formCounts[f.id]?.count ?? 0,
    }));

    // ── Ongoing tasks: active (non-completed, non-cancelled) submissions ──
    const TASK_SLA_DAYS = 14; // default SLA
    const now = Date.now();
    const ongoingTasks = submissions
      .filter((s) => s.status !== 'COMPLETED' && s.status !== 'CANCELLED')
      .map((s) => {
        const daysSince = Math.floor((now - new Date(s.createdAt).getTime()) / 86400000);
        const isLate    = s.status === 'SENT_BACK' || daysSince > TASK_SLA_DAYS;
        const stage     = getStage(s.status);
        return {
          id:          s.id,
          requestNo:   s.submissionNo,
          title:       s.formName || 'Contract Review Form',
          stage,
          daysOverdue: isLate && daysSince > TASK_SLA_DAYS ? daysSince - TASK_SLA_DAYS : undefined,
          filter:      isLate ? 'LATE' : 'ON_TRACK',
        };
      });

    // ── LO stats: group active submissions by assignedLegalOfficer ──
    const loMap: Record<string, { onTrack: number; late: number; completed: number }> = {};
    submissions.forEach((s) => {
      const lo = s.assignedLegalOfficer;
      if (!lo || lo === 'null' || lo === '—') return;
      if (!loMap[lo]) loMap[lo] = { onTrack: 0, late: 0, completed: 0 };
      if (s.status === 'COMPLETED') {
        loMap[lo].completed++;
      } else if (s.status === 'SENT_BACK' || s.status === 'CANCELLED') {
        loMap[lo].late++;
      } else {
        loMap[lo].onTrack++;
      }
    });
    // Resolve UUID keys to real names
    const loStatsRaw = Object.entries(loMap);
    // Batch-resolve all LO ids in one query
    const loIds = loStatsRaw.map(([id]) => id).filter(Boolean);
    const loUsers = await prisma.user.findMany({
      where: { id: { in: loIds } },
      select: { id: true, name: true },
    });
    const loUserMap: Record<string, string> = {};
    loUsers.forEach((u: { id: string; name: string | null }) => { if (u.name) loUserMap[u.id] = u.name; });
    const loStats = loStatsRaw.map(([id, counts]) => ({
      name: loUserMap[id] || id,
      ...counts,
    }));

    // ── Completed counts per form ──
    const completedCounts: Record<number, number> = {};
    const earlyCount: Record<number, number>      = {};
    const lateCount: Record<number, number>       = {};
    submissions
      .filter((s) => s.status === 'COMPLETED')
      .forEach((s) => {
        const fid = s.formId || 1;
        completedCounts[fid] = (completedCounts[fid] || 0) + 1;
        // Early/late classification using actual dueDate
        if (s.dueDate) {
          const completedAt = new Date(s.updatedAt).getTime();
          const due = new Date(s.dueDate).getTime();
          if (completedAt <= due) {
            earlyCount[fid] = (earlyCount[fid] || 0) + 1;
          } else {
            lateCount[fid] = (lateCount[fid] || 0) + 1;
          }
        } else {
          // Fallback for old submissions without dueDate
          const daysOpen = Math.floor(
            (new Date(s.updatedAt).getTime() - new Date(s.createdAt).getTime()) / 86400000
          );
          if (daysOpen <= 14) {
            earlyCount[fid] = (earlyCount[fid] || 0) + 1;
          } else {
            lateCount[fid] = (lateCount[fid] || 0) + 1;
          }
        }
      });

    return NextResponse.json({
      success: true,
      data: { statsCards, loStats, ongoingTasks, completedCounts, earlyCount, lateCount },
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}

function getStage(status: string): string {
  switch (status) {
    case 'PENDING_APPROVAL':         return 'Awaiting BUM / FBP / Cluster Head Approvals';
    case 'PENDING_LEGAL_GM':         return 'Pending Legal GM Initial Review';
    case 'PENDING_LEGAL_GM_FINAL':   return 'Pending Legal GM Final Approval';
    case 'PENDING_LEGAL_OFFICER':    return 'Under Legal Review';
    case 'PENDING_SPECIAL_APPROVER': return 'Awaiting Special Approver';
    case 'SENT_BACK':                return 'Sent Back — Awaiting Resubmission';
    default:                         return status;
  }
}