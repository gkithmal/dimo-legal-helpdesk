'use client';

import NotificationBell from '@/components/shared/NotificationBell';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  LogOut, Search, ChevronRight, TrendingUp, Home, Settings, User,
  X, Loader2, AlertCircle, ChevronDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'MY_REJECTIONS' | 'OTHER_REJECTIONS' | 'IN_PROGRESS' | 'COMPLETED' | 'ALL';
type ApprovalItem = {
  id: string; requestNo: string; formTitle: string; legalOfficer: string;
  createdDate: string; status: ApprovalStatus; statusLabel: string; route: string;
};
type TaskFilter = 'ALL' | 'ON_TRACK' | 'COMPLETED' | 'LATE';
type OngoingTask = { id: string; requestNo: string; title: string; stage: string; daysOverdue?: number; filter: TaskFilter; };
type LegalOfficerStat = { name: string; onTrack: number; late: number; completed: number; };
type StatsCard = { formId: number; label: string; count: number; color: string; };

// ─── Static config ────────────────────────────────────────────────────────────

const STATS_CARD_COLORS: Record<number, string> = {
    1:  'from-blue-500 to-blue-600',
    2:  'from-indigo-500 to-indigo-600',
    3:  'from-purple-500 to-purple-600',
    4:  'from-pink-500 to-pink-600',
    5:  'from-rose-500 to-rose-600',
    6:  'from-orange-500 to-orange-600',
    7:  'from-yellow-500 to-yellow-600',
    8:  'from-lime-500 to-lime-600',
    9:  'from-green-500 to-green-600',
    10: 'from-teal-500 to-teal-600',
  };

const FORM_STANDARD_DAYS: Record<number, string> = {
  1: '3-8', 2: '1-7', 3: '3-5', 4: '5-30', 5: '1-30',
  6: '1', 7: '1', 8: '1-7', 9: '5-14', 10: '1-3',
};

const STATUS_CONFIG: Record<ApprovalStatus, { label: string }> = {
  ALL: { label: 'All' },
  PENDING: { label: 'Pending*' },
  APPROVED: { label: 'Approved' },
  MY_REJECTIONS: { label: 'My Rejections' },
  OTHER_REJECTIONS: { label: 'Other Rejections' },
  IN_PROGRESS: { label: 'In Progress' },
  COMPLETED: { label: 'Completed' },
};

const APPROVAL_FILTERS: ApprovalStatus[] = ['ALL', 'PENDING', 'APPROVED', 'MY_REJECTIONS', 'OTHER_REJECTIONS', 'IN_PROGRESS', 'COMPLETED'];

const TASK_FILTERS: { label: string; key: TaskFilter; bg: string; activeBg: string }[] = [
  { label: 'All tasks', key: 'ALL',       bg: 'bg-[#1A438A]',    activeBg: 'bg-[#1A438A]' },
  { label: 'On Track',  key: 'ON_TRACK',  bg: 'bg-emerald-500',  activeBg: 'bg-emerald-500' },
  { label: 'Completed', key: 'COMPLETED', bg: 'bg-slate-400',    activeBg: 'bg-slate-400' },
  { label: 'Late',      key: 'LATE',      bg: 'bg-red-500',      activeBg: 'bg-red-500' },
];

// ─── Status border colours ────────────────────────────────────────────────────

const LEFT_BORDER: Partial<Record<ApprovalStatus, string>> = {
  PENDING:          'border-l-orange-400',
  IN_PROGRESS:      'border-l-blue-400',
  MY_REJECTIONS:    'border-l-red-500',
  OTHER_REJECTIONS: 'border-l-orange-500',
  APPROVED:         'border-l-emerald-400',
  COMPLETED:        'border-l-emerald-400',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapDbStatusToUI(s: string): ApprovalStatus {
  switch (s) {
    case 'PENDING_APPROVAL':
    case 'PENDING_LEGAL_GM':
    case 'PENDING_LEGAL_GM_FINAL': return 'PENDING';
    case 'PENDING_LEGAL_OFFICER':
    case 'PENDING_SPECIAL_APPROVER': return 'IN_PROGRESS';
    case 'SENT_BACK': return 'MY_REJECTIONS';
    case 'CANCELLED': return 'OTHER_REJECTIONS';
    case 'COMPLETED': return 'COMPLETED';
    default: return 'IN_PROGRESS';
  }
}

function mapDbStatusToLabel(s: string): string {
  switch (s) {
    case 'PENDING_APPROVAL':         return 'Pending BUM/FBP/Cluster Head Approvals';
    case 'PENDING_LEGAL_GM':         return 'Pending Legal GM Initial Review';
    case 'PENDING_LEGAL_GM_FINAL':   return 'Pending Legal GM Final Approval';
    case 'PENDING_LEGAL_OFFICER':    return 'In Progress with Legal Officer';
    case 'PENDING_SPECIAL_APPROVER': return 'Pending Special Approver';
    case 'SENT_BACK':                return 'Sent Back to Initiator';
    case 'CANCELLED':                return 'Cancelled';
    case 'COMPLETED':                return 'Completed';
    default:                         return s;
  }
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Quick Preview Modal ──────────────────────────────────────────────────────

function QuickPreview({ item, onShowMore, onClose }: {
  item: ApprovalItem; onShowMore: () => void; onClose: () => void;
}) {
  const statusColor: Record<string, string> = {
    PENDING_APPROVAL:         'text-yellow-600 bg-yellow-50',
    PENDING_LEGAL_GM:         'text-yellow-600 bg-yellow-50',
    PENDING_LEGAL_GM_FINAL:   'text-yellow-600 bg-yellow-50',
    PENDING_LEGAL_OFFICER:    'text-blue-500 bg-blue-50',
    PENDING_SPECIAL_APPROVER: 'text-blue-500 bg-blue-50',
    SENT_BACK:                'text-orange-500 bg-orange-50',
    CANCELLED:                'text-red-600 bg-red-50',
    COMPLETED:                'text-emerald-600 bg-emerald-50',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <span className="font-bold text-[#17293E] text-base">Request Summary</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {[
            { label: 'Submission No.', value: item.requestNo },
            { label: 'Form',           value: item.formTitle },
            { label: 'Legal Officer',  value: item.legalOfficer },
            { label: 'Created Date',   value: item.createdDate },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-3">
              <span className="text-[11px] text-slate-400 font-semibold w-28 flex-shrink-0">{label}</span>
              <span className="text-[11px] text-[#17293E] font-medium flex-1">: {value}</span>
            </div>
          ))}
          <div className="flex gap-3">
            <span className="text-[11px] text-slate-400 font-semibold w-28 flex-shrink-0">Status</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusColor[item.status] || 'text-slate-600 bg-slate-100'}`}>
              {item.statusLabel}
            </span>
          </div>
        </div>
        <div className="px-5 pb-5">
          <button onClick={onShowMore}
            className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
            Show more Details
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Approvals Sidebar ────────────────────────────────────────────────────────

function ApprovalsList({ approvals, loading, onSelect }: {
  approvals: ApprovalItem[]; loading: boolean; onSelect: (item: ApprovalItem) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<ApprovalStatus>('ALL');
  const [search, setSearch]             = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = approvals.filter((a) => {
    const matchFilter = activeFilter === 'ALL' || a.status === activeFilter;
    const matchSearch = !search || [a.requestNo, a.formTitle, a.legalOfficer]
      .some((v) => v.toLowerCase().includes(search.toLowerCase()));
    return matchFilter && matchSearch;
  });

  return (
    <div className="flex flex-col h-full bg-[#17293E]">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex-shrink-0 border-b border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-white font-bold text-sm">Approvals</span>
          {!loading && (
            <span className="text-[10px] bg-white/15 text-white/80 px-2 py-0.5 rounded-full font-bold">
              {filtered.length}
            </span>
          )}
          {/* Filter dropdown */}
          <div className="relative ml-auto">
            <button
              onClick={() => setShowDropdown((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-bold bg-[#1183B7]/30 text-white border border-[#1183B7]/40 rounded-lg pl-3 pr-2 py-1.5 hover:bg-[#1183B7]/50 transition-colors"
            >
              Filter by Status <ChevronDown className="w-3 h-3" />
            </button>
            {showDropdown && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden min-w-[150px]">
                {APPROVAL_FILTERS.map((f) => (
                  <button key={f} onClick={() => { setActiveFilter(f); setShowDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-[12px] font-semibold transition-colors ${activeFilter === f ? 'bg-[#1A438A] text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
                    {STATUS_CONFIG[f].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="request No, Requester name..."
            className="w-full bg-white rounded-lg pl-8 pr-3 py-2 text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1183B7]/40 border border-slate-200"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <AlertCircle className="w-8 h-8 text-white/20" />
            <p className="text-white/40 text-xs">No submissions found</p>
          </div>
        ) : (
          filtered.map((item) => (
            <button key={item.id} onClick={() => onSelect(item)}
              className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors group border-l-4 border-b border-white/5 ${LEFT_BORDER[item.status] || 'border-l-transparent'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[11px] font-bold truncate leading-tight mb-0.5">
                    {item.requestNo} – {item.formTitle}
                  </p>
                  <p className="text-slate-400 text-[10px]">Legal Officer : {item.legalOfficer || '—'}</p>
                  <p className="text-slate-400 text-[10px]">Created Date : {item.createdDate}</p>
                  <p className="text-slate-400 text-[10px] truncate">Status : {item.statusLabel}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white flex-shrink-0 mt-1 transition-colors" />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Dashboard Main Area ──────────────────────────────────────────────────────

function Dashboard({ statsCards, loStats, ongoingTasks, completedCounts, earlyCount, lateCount, statsLoading }: {
  statsCards: StatsCard[];
  loStats: LegalOfficerStat[];
  ongoingTasks: OngoingTask[];
  completedCounts: Record<number, number>;
  earlyCount: Record<number, number>;
  lateCount: Record<number, number>;
  statsLoading: boolean;
}) {
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('ALL');

  const filteredTasks = ongoingTasks.filter((t) => taskFilter === 'ALL' || t.filter === taskFilter);
  const taskCounts = {
    ALL:       ongoingTasks.length,
    ON_TRACK:  ongoingTasks.filter((t) => t.filter === 'ON_TRACK').length,
    COMPLETED: ongoingTasks.filter((t) => t.filter === 'COMPLETED').length,
    LATE:      ongoingTasks.filter((t) => t.filter === 'LATE').length,
  };

  const bestPerformer = loStats.length
    ? loStats.reduce((b, lo) => lo.onTrack > b.onTrack ? lo : b, loStats[0])
    : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f0f4f9]">

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-5 gap-2">
        {statsLoading
          ? Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-xl p-3 bg-slate-200 animate-pulse h-16" />
            ))
          : statsCards.map((card) => (
            <div
              key={card.formId}
              className={`rounded-xl p-3 text-white shadow-md cursor-pointer hover:scale-[1.03] transition-transform bg-gradient-to-br ${card.color}`}
            >
              <p className="text-2xl font-black leading-none mb-1">{card.count}</p>
              <p className="text-[10px] font-semibold opacity-90 leading-tight">{card.label}</p>
            </div>
          ))
        }
      </div>

      {/* ── Middle Row ── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Legal Officers Panel */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            {/* Best performer block */}
            <div className="flex-1 text-center">
              <p className="text-[11px] text-slate-400 font-semibold mb-0.5">Legal Officers</p>
              <p className="text-4xl font-black text-[#1A438A] leading-none">{loStats.length}</p>
              {bestPerformer && (
                <div className="mt-1">
                  <p className="text-[10px] font-bold text-[#AC9C2F]">Best Performer</p>
                  <p className="text-[11px] font-bold text-[#17293E]">{bestPerformer.name}</p>
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Ongoing Tasks by Legal Officer
            </p>
            {statsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-5 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : loStats.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No data yet</p>
            ) : (
              <div className="space-y-2">
                {loStats.map((lo, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <p className="text-xs text-[#17293E] font-medium flex-1 truncate">{lo.name}</p>
                    <div className="flex gap-1">
                      <span className="min-w-[28px] h-5 px-1 rounded text-[10px] font-bold text-white bg-emerald-500 flex items-center justify-center">
                        {lo.onTrack}
                      </span>
                      {lo.late > 0 && (
                        <span className="min-w-[20px] h-5 px-1 rounded text-[10px] font-bold text-white bg-yellow-500 flex items-center justify-center">
                          {lo.late}
                        </span>
                      )}
                      {lo.completed > 0 && (
                        <span className="min-w-[20px] h-5 px-1 rounded text-[10px] font-bold text-white bg-red-500 flex items-center justify-center">
                          {lo.completed}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ongoing Tasks Panel */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex flex-wrap gap-1.5">
              {TASK_FILTERS.map((tf) => (
                <button key={tf.key} onClick={() => setTaskFilter(tf.key)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                    taskFilter === tf.key
                      ? `${tf.bg} text-white shadow-sm`
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {tf.label} ({taskCounts[tf.key]})
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-50 max-h-52 overflow-y-auto">
            {statsLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : filteredTasks.length === 0 ? (
              <p className="text-xs text-slate-400 px-4 py-6 text-center">No tasks found</p>
            ) : (
              filteredTasks.map((task) => (
                <div key={task.id} className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <p className="text-xs font-bold text-[#17293E] leading-tight">
                    {task.requestNo} – {task.title}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{task.stage}</p>
                  {task.daysOverdue !== undefined && (
                    <p className="text-[10px] text-red-500 font-bold mt-0.5">{task.daysOverdue} Days overdue</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Function Performance Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#1A438A]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Function Performance</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Early
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> On Time
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Late
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Function</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Standard Time (Days)</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Completed Tasks Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {statsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={3} className="px-4 py-3">
                      <div className="h-4 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : (
                statsCards.map((form) => {
                  const completed = completedCounts[form.formId] ?? 0;
                  const early     = earlyCount[form.formId] ?? 0;
                  const late      = lateCount[form.formId] ?? 0;
                  return (
                    <tr key={form.formId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 text-[#17293E] font-medium">{form.label}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-lg text-slate-600 font-semibold">
                          {FORM_STANDARD_DAYS[form.formId] ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="min-w-[28px] h-5 px-1 rounded bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {early}
                          </span>
                          <span className="min-w-[28px] h-5 px-1 rounded bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {completed}
                          </span>
                          <span className="min-w-[28px] h-5 px-1 rounded bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {late}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LegalGMHomePage() {
  const [showSignOut, setShowSignOut] = useState(false);
  const router                                = useRouter();
  const { data: session, status } = useSession();

  if (status === 'loading') return null;
  if (status === 'authenticated' && session?.user?.role !== 'LEGAL_GM') {
    router.replace('/login');
    return null;
  }

  const [preview, setPreview]                 = useState<ApprovalItem | null>(null);
  const [approvals, setApprovals]             = useState<ApprovalItem[]>([]);
  const [statsCards, setStatsCards]           = useState<StatsCard[]>([]);
  const [loStats, setLoStats]                 = useState<LegalOfficerStat[]>([]);
  const [ongoingTasks, setOngoingTasks]       = useState<OngoingTask[]>([]);
  const [completedCounts, setCompletedCounts] = useState<Record<number, number>>({});
  const [earlyCount, setEarlyCount]           = useState<Record<number, number>>({});
  const [lateCount, setLateCount]             = useState<Record<number, number>>({});
  const [loadingList, setLoadingList]         = useState(true);
  const [loadingStats, setLoadingStats]       = useState(true);

  // Derived from real session
  const userName    = session?.user?.name  || 'Legal GM';
  const userInitial = getInitials(userName);

  // ── Load approvals list ──
  useEffect(() => {
    fetch('/api/submissions')
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.success) return;
        const mapped = data.data.filter((s: { status: string }) => s.status !== 'RESUBMITTED').map((s: {
            id: string; submissionNo: string; formName: string; formId: number;
            status: string; assignedLegalOfficer?: string; legalOfficerName?: string; createdAt: string;
          }) => ({
            id:          s.id,
            requestNo:   s.submissionNo,
            formTitle:   s.formName || s.submissionNo,
            legalOfficer: s.legalOfficerName || s.assignedLegalOfficer || '—',
            createdDate: fmtDate(s.createdAt),
            status:      mapDbStatusToUI(s.status),
            statusLabel: mapDbStatusToLabel(s.status),
            route:       `/form${s.formId || 1}/legal-gm?id=${s.id}`,
          }));
        setApprovals(mapped);
      })
      .catch((err) => console.error("Failed to load data:", err))
      .finally(() => setLoadingList(false));
  }, []);

  // ── Load stats ──
  useEffect(() => {
    fetch('/api/submissions/stats')
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return;
        const { statsCards: rawCards, loStats: rawLO, ongoingTasks: rawTasks,
                completedCounts: rawCompleted, earlyCount: rawEarly, lateCount: rawLate } = data.data;

        setStatsCards(
          rawCards.map((c: { formId: number; label: string; count: number }) => ({
            ...c,
            color: STATS_CARD_COLORS[c.formId] ?? 'from-slate-500 to-slate-600',
          }))
        );
        setLoStats(rawLO ?? []);
        setOngoingTasks(rawTasks ?? []);
        setCompletedCounts(rawCompleted ?? {});
        // earlyCount and lateCount come from stats API if/when dueDate is added to schema
        // Falls back to empty objects (shows 0) until then — no hardcoded values
        setEarlyCount(rawEarly ?? {});
        setLateCount(rawLate ?? {});
      })
      .catch((err) => console.error("Failed to load data:", err))
      .finally(() => setLoadingStats(false));
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f0f4f9]"
      style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&display=swap');`}</style>

      {/* ── Top Nav ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0 shadow-sm">
        {/* User */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-rose-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
            {userInitial}
          </div>
          <div>
            <p className="text-sm font-bold text-[#17293E] leading-tight">{userName}</p>
            <p className="text-[11px] text-[#4686B7] font-semibold">Legal GM</p>
          </div>
        </div>

        {/* Centre title */}
        <div className="text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">DIMO Legal Help Desk</p>
          <p className="text-base font-black text-[#1A438A]">Legal GM Dashboard</p>
        </div>

        {/* Logout */}
        <button
          onClick={() => router.push('/login')}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-semibold transition-colors">
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left sidebar nav icons (matching screenshot) */}
        <div className="w-12 flex-shrink-0 bg-[#17293E] flex flex-col items-center py-4 gap-5 border-r border-white/10">
          <button onClick={() => router.push('/legal-gm-home')} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors" title="Home">
            <Home className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:bg-white/10 transition-colors">
            <NotificationBell />
          </div>
          <div className="flex-1" />
          <button onClick={() => router.push('/settings')} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:bg-white/10 transition-colors" title="Settings">
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={() => setShowSignOut(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:bg-white/10 transition-colors" title="Sign Out">
            <User className="w-4 h-4" />
          </button>
        </div>

        {/* Approvals sidebar */}
        <div className="w-[280px] flex-shrink-0 flex flex-col overflow-hidden border-r border-white/10">
          <ApprovalsList approvals={approvals} loading={loadingList} onSelect={setPreview} />
        </div>

        {/* Dashboard */}
        <Dashboard
          statsCards={statsCards}
          loStats={loStats}
          ongoingTasks={ongoingTasks}
          completedCounts={completedCounts}
          earlyCount={earlyCount}
          lateCount={lateCount}
          statsLoading={loadingStats}
        />
      </div>

      {/* Quick Preview modal */}
      {preview && (
        <QuickPreview
          item={preview}
          onShowMore={() => { router.push(preview.route); setPreview(null); }}
          onClose={() => setPreview(null)}
        />
      )}
      {showSignOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSignOut(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-sm z-10">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Sign Out</h3>
            <p className="text-sm text-slate-500 mb-5">Are you sure you want to sign out?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowSignOut(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
              <button onClick={() => { setShowSignOut(false); router.push('/login'); }} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}