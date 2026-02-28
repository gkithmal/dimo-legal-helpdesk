'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  FileText, LogOut, X, Search, ChevronRight, Clock,
  CheckCircle2, XCircle, RotateCcw, Loader2, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalFilter = 'PENDING' | 'APPROVED' | 'CANCELLED' | 'ALL';
type SubmissionFilter = 'ALL' | 'APPROVAL_PENDING' | 'ONGOING' | 'COMPLETED' | 'RESUBMIT' | 'CANCELLED';

const DB_TO_SUBMISSION: Record<string, SubmissionFilter> = {
  DRAFT: 'APPROVAL_PENDING', PENDING_APPROVAL: 'APPROVAL_PENDING',
  PENDING_LEGAL_GM: 'ONGOING', PENDING_LEGAL_OFFICER: 'ONGOING',
  PENDING_LEGAL_GM_FINAL: 'ONGOING', PENDING_SPECIAL_APPROVER: 'ONGOING',
  COMPLETED: 'COMPLETED', SENT_BACK: 'RESUBMIT', CANCELLED: 'CANCELLED',
};

type WorkflowItem = {
  id: string; requestNo: string; formTitle: string; formType: string;
  submittedBy: string; submittedDate: string; route: string;
};

type ApprovalItem = {
  id: string; requestNo: string; formTitle: string; formType: string;
  submittedBy: string; submittedDate: string; status: ApprovalFilter; route: string;
};

type SubmissionItem = {
  id: string; requestNo: string; formTitle: string; formType: string; formId: number;
  submittedDate: string; status: SubmissionFilter; lastUpdated: string;
};

const FORMS = [
  { id: 1,  title: 'FORM 1',  description: 'Contract Review Form',                      color: 'bg-orange-500', route: '/form1' },
  { id: 2,  title: 'FORM 2',  description: 'Lease Agreement',                            color: 'bg-orange-400', route: '/form2' },
  { id: 3,  title: 'FORM 3',  description: 'Instruction For Litigation',                 color: 'bg-red-400',    route: '/form3' },
  { id: 4,  title: 'FORM 4',  description: 'Vehicle Rent Agreement',                     color: 'bg-pink-400',   route: '/form4' },
  { id: 5,  title: 'FORM 5',  description: 'Request for Power of Attorney',              color: 'bg-purple-500', route: '/form5' },
  { id: 6,  title: 'FORM 6',  description: 'Registration of a Trademark',                color: 'bg-yellow-500', route: '/form6' },
  { id: 7,  title: 'FORM 7',  description: 'Termination of agreements/lease agreements', color: 'bg-yellow-400', route: '/form7' },
  { id: 8,  title: 'FORM 8',  description: 'Handing over of the leased premises',        color: 'bg-lime-500',   route: '/form8' },
  { id: 9,  title: 'FORM 9',  description: 'Approval for Purchasing of a Premises',      color: 'bg-green-500',  route: '/form9' },
  { id: 10, title: 'FORM 10', description: 'Instruction to Issue Letter of Demand',      color: 'bg-teal-500',   route: '/form10' },
];

const APPROVAL_FILTER_CONFIG: Record<ApprovalFilter, { label: string; color: string }> = {
  PENDING:   { label: 'Pending',   color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  APPROVED:  { label: 'Approved',  color: 'bg-green-500/20 text-green-300 border-green-500/40'   },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-500/20 text-red-300 border-red-500/40'         },
  ALL:       { label: 'All',       color: 'bg-white/10 text-white border-white/20'               },
};

const SUBMISSION_STATUS_CONFIG: Record<SubmissionFilter, { label: string; color: string; icon: React.ReactNode }> = {
  ALL:              { label: 'All',              color: 'bg-white/10 text-white border-white/20',                icon: null },
  APPROVAL_PENDING: { label: 'Approval Pending', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', icon: <Clock className="w-3 h-3" /> },
  ONGOING:          { label: 'Ongoing',          color: 'bg-blue-500/20 text-blue-300 border-blue-500/40',       icon: <Loader2 className="w-3 h-3" /> },
  COMPLETED:        { label: 'Completed',        color: 'bg-green-500/20 text-green-300 border-green-500/40',    icon: <CheckCircle2 className="w-3 h-3" /> },
  RESUBMIT:         { label: 'Re-Submit',        color: 'bg-orange-500/20 text-orange-300 border-orange-500/40', icon: <RotateCcw className="w-3 h-3" /> },
  CANCELLED:        { label: 'Cancelled',        color: 'bg-red-500/20 text-red-300 border-red-500/40',          icon: <XCircle className="w-3 h-3" /> },
};

const SUBMISSION_BORDER: Record<SubmissionFilter, string> = {
  ALL: 'border-l-white/30', APPROVAL_PENDING: 'border-l-yellow-400',
  ONGOING: 'border-l-blue-400', COMPLETED: 'border-l-green-400',
  RESUBMIT: 'border-l-orange-400', CANCELLED: 'border-l-red-400',
};

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getUTCDate()).padStart(2,'0')} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function ApprovalStatusBadge({ status }: { status: ApprovalFilter }) {
  const config = APPROVAL_FILTER_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${config.color}`}>
      {status === 'PENDING'   && <Clock        className="w-3 h-3" />}
      {status === 'APPROVED'  && <CheckCircle2 className="w-3 h-3" />}
      {status === 'CANCELLED' && <XCircle      className="w-3 h-3" />}
      {config.label}
    </span>
  );
}

function SubmissionStatusBadge({ status }: { status: SubmissionFilter }) {
  const config = SUBMISSION_STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${config.color}`}>
      {config.icon}{config.label}
    </span>
  );
}

// ─── Workflows Panel ──────────────────────────────────────────────────────────

function WorkflowsPanel({ items, loading, onClose, onNavigate }: {
  items: WorkflowItem[]; loading: boolean; onClose: () => void; onNavigate: (r: string) => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#17293E] border border-[#1183B7]/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1183B7]/30 bg-[#1A3A5C]">
          <div>
            <h2 className="text-white text-lg font-bold">My Workflows</h2>
            <p className="text-[#91ADC5] text-xs mt-0.5">Special approval tasks requiring your attention</p>
          </div>
          <button onClick={onClose} className="text-[#91ADC5] hover:text-white rounded-lg p-1 hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#1183B7]/20">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[#91ADC5]"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#91ADC5]"><CheckCircle2 className="w-10 h-10 mb-3 opacity-30" /><p className="text-sm">No pending workflows</p></div>
          ) : items.map((item) => (
            <button key={item.id} onClick={() => { onClose(); onNavigate(item.route); }} className="w-full text-left px-6 py-4 hover:bg-[#1183B7]/10 transition-colors group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1"><span className="text-[#91ADC5] text-xs font-mono">{item.requestNo}</span><span className="text-[#AC9C2F] text-xs font-semibold">{item.formType}</span></div>
                  <p className="text-white text-sm font-semibold truncate mb-1.5">{item.formTitle}</p>
                  <div className="flex items-center gap-3 text-xs text-[#91ADC5]"><span>By {item.submittedBy}</span><span>•</span><span>Submitted {item.submittedDate}</span></div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-yellow-500/20 text-yellow-300 border-yellow-500/40"><Clock className="w-3 h-3" /> Approval Needed</span>
                  <ChevronRight className="w-4 h-4 text-[#91ADC5] group-hover:text-white transition-all" />
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-[#1183B7]/20 bg-[#17293E]/80 text-center">
          <p className="text-[#91ADC5] text-xs">{items.length} pending items</p>
        </div>
      </div>
    </div>
  );
}

// ─── Approvals Panel ──────────────────────────────────────────────────────────

function ApprovalsPanel({ items, loading, onClose, onNavigate }: {
  items: ApprovalItem[]; loading: boolean; onClose: () => void; onNavigate: (r: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<ApprovalFilter>('PENDING');
  const [search, setSearch] = useState('');
  const FILTERS: ApprovalFilter[] = ['PENDING', 'APPROVED', 'CANCELLED', 'ALL'];

  const filtered = items.filter((item) => {
    const matchFilter = activeFilter === 'ALL' || item.status === activeFilter;
    const matchSearch = search === '' ||
      item.requestNo.toLowerCase().includes(search.toLowerCase()) ||
      item.formTitle.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#17293E] border border-[#1183B7]/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1183B7]/30 bg-[#1A3A5C]">
          <div>
            <h2 className="text-white text-lg font-bold">Special Approvals</h2>
            <p className="text-[#91ADC5] text-xs mt-0.5">Requests assigned to you for special approval</p>
          </div>
          <button onClick={onClose} className="text-[#91ADC5] hover:text-white rounded-lg p-1 hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-3 border-b border-[#1183B7]/20">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#91ADC5]" /><input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-[#1A438A]/40 border border-[#1183B7]/30 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder:text-[#91ADC5]/60 focus:outline-none focus:border-[#1183B7]" /></div>
        </div>
        <div className="flex gap-1.5 px-6 py-3 border-b border-[#1183B7]/20 overflow-x-auto flex-shrink-0">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeFilter === f ? 'bg-[#1183B7] text-white' : 'bg-[#1A438A]/40 text-[#91ADC5] hover:bg-[#1A438A]/70 hover:text-white'}`}>
              {APPROVAL_FILTER_CONFIG[f].label} <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${activeFilter === f ? 'bg-white/20' : 'bg-white/10'}`}>{f === 'ALL' ? items.length : items.filter(a => a.status === f).length}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#1183B7]/20">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[#91ADC5]"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#91ADC5]"><CheckCircle2 className="w-10 h-10 mb-3 opacity-30" /><p className="text-sm">No requests found</p></div>
          ) : filtered.map((item) => (
            <button key={item.id} onClick={() => { onClose(); onNavigate(item.route); }} className="w-full text-left px-6 py-4 hover:bg-[#1183B7]/10 transition-colors group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1"><span className="text-[#91ADC5] text-xs font-mono">{item.requestNo}</span><span className="text-[#AC9C2F] text-xs font-semibold">{item.formType}</span></div>
                  <p className="text-white text-sm font-semibold truncate mb-1.5">{item.formTitle}</p>
                  <div className="flex items-center gap-3 text-xs text-[#91ADC5]"><span>By {item.submittedBy}</span><span>•</span><span>Submitted {item.submittedDate}</span></div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0"><ApprovalStatusBadge status={item.status} /><ChevronRight className="w-4 h-4 text-[#91ADC5] group-hover:text-white transition-all" /></div>
              </div>
            </button>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-[#1183B7]/20 bg-[#17293E]/80 text-center">
          <p className="text-[#91ADC5] text-xs">{items.filter(a => a.status === 'PENDING').length} pending · {filtered.length} of {items.length} shown</p>
        </div>
      </div>
    </div>
  );
}

// ─── Submissions Panel ────────────────────────────────────────────────────────

function SubmissionsPanel({ items, loading, onClose, onNavigate }: {
  items: SubmissionItem[]; loading: boolean; onClose: () => void; onNavigate: (r: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<SubmissionFilter>('ALL');
  const [search, setSearch] = useState('');
  const FILTERS: SubmissionFilter[] = ['ALL', 'APPROVAL_PENDING', 'ONGOING', 'COMPLETED', 'RESUBMIT', 'CANCELLED'];

  const filtered = items.filter((item) => {
    const matchFilter = activeFilter === 'ALL' || item.status === activeFilter;
    const matchSearch = search === '' ||
      item.requestNo.toLowerCase().includes(search.toLowerCase()) ||
      item.formTitle.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#17293E] border border-[#1183B7]/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1183B7]/30 bg-[#1A3A5C]">
          <div>
            <h2 className="text-white text-lg font-bold">My Submissions</h2>
            <p className="text-[#91ADC5] text-xs mt-0.5">All requests you have submitted</p>
          </div>
          <button onClick={onClose} className="text-[#91ADC5] hover:text-white rounded-lg p-1 hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-3 border-b border-[#1183B7]/20">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#91ADC5]" /><input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-[#1A438A]/40 border border-[#1183B7]/30 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder:text-[#91ADC5]/60 focus:outline-none focus:border-[#1183B7]" /></div>
        </div>
        <div className="flex gap-1.5 px-6 py-3 border-b border-[#1183B7]/20 overflow-x-auto flex-shrink-0">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeFilter === f ? 'bg-[#1183B7] text-white' : 'bg-[#1A438A]/40 text-[#91ADC5] hover:bg-[#1A438A]/70 hover:text-white'}`}>
              {SUBMISSION_STATUS_CONFIG[f].label} <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${activeFilter === f ? 'bg-white/20' : 'bg-white/10'}`}>{f === 'ALL' ? items.length : items.filter(s => s.status === f).length}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#1183B7]/20">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[#91ADC5]"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#91ADC5]"><FileText className="w-10 h-10 mb-3 opacity-30" /><p className="text-sm">No submissions found</p></div>
          ) : filtered.map((item) => (
            <button key={item.id} onClick={() => { onClose(); onNavigate(`/form${item.formId}?mode=${item.status === 'RESUBMIT' ? 'resubmit' : 'view'}&id=${item.id}`); }} className={`w-full text-left px-6 py-4 hover:bg-[#1183B7]/10 transition-colors group border-l-4 ${SUBMISSION_BORDER[item.status]}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1"><span className="text-[#91ADC5] text-xs font-mono">{item.requestNo}</span><span className="text-[#AC9C2F] text-xs font-semibold">{item.formType}</span></div>
                  <p className="text-white text-sm font-semibold truncate mb-1.5">{item.formTitle}</p>
                  <div className="flex items-center gap-3 text-xs text-[#91ADC5]"><span>Submitted {item.submittedDate}</span><span>•</span><span>Updated {item.lastUpdated}</span></div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0"><SubmissionStatusBadge status={item.status} /><ChevronRight className="w-4 h-4 text-[#91ADC5] group-hover:text-white transition-all" /></div>
              </div>
            </button>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-[#1183B7]/20 bg-[#17293E]/80 text-center">
          <p className="text-[#91ADC5] text-xs">{filtered.length} of {items.length} submissions</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SpecialApproverHomePage() {
  const { data: session, status } = useSession();
  const currentUserName = session?.user?.name ?? 'User';
  const currentUserId   = session?.user?.id   ?? '';
  const currentUserEmail = session?.user?.email ?? '';
  const router = useRouter();
  if (status === 'loading') return null;
  if (status === 'authenticated' && !['SPECIAL_APPROVER'].includes(session?.user?.role as string)) {
    router.replace('/');
    return null;
  }

  type TabType = 'workflows' | 'submissions' | 'approvals' | null;
  const [activeTab, setActiveTab] = useState<TabType>(null);

  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [approvals,   setApprovals]   = useState<ApprovalItem[]>([]);
  const [workflows,   setWorkflows]   = useState<WorkflowItem[]>([]);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res  = await fetch('/api/submissions');
        const json = await res.json();
        if (!json.success) return;
        const all = json.data;

        // ── My own submissions (as initiator) ──────────────────────────────
        setSubmissions(
          all.filter((s: any) => s.initiatorId === currentUserId).map((s: any) => ({
            id: s.id, requestNo: s.submissionNo, formTitle: s.formName,
            formId: s.formId, formType: `FORM ${s.formId}`, submittedDate: formatDate(s.createdAt),
            status: DB_TO_SUBMISSION[s.status] || 'ONGOING', lastUpdated: formatDate(s.updatedAt),
          }))
        );

        // ── FIX: Match by email against specialApprovers table ─────────────
        // Special approvers are stored in submissionSpecialApprover by email,
        // NOT in the approvals table. We must check specialApprovers, not approvals.
        const myApprovals = all.filter((s: any) =>
          s.status === 'PENDING_SPECIAL_APPROVER' ||
          s.specialApprovers?.some((a: any) => a.approverEmail === currentUserEmail)
        );

        setApprovals(
          myApprovals.map((s: any) => {
            // Find the specific record for this user by email
            const myRecord = s.specialApprovers?.find(
              (a: any) => a.approverEmail === currentUserEmail
            ) ?? s.specialApprovers?.[0];

            // Map the record status → UI filter status
            const approvalStatus: ApprovalFilter =
              myRecord?.status === 'APPROVED'   ? 'APPROVED'  :
              myRecord?.status === 'CANCELLED'  ? 'CANCELLED' :
              myRecord?.status === 'SENT_BACK'  ? 'CANCELLED' : 'PENDING';

            return {
              id: s.id, requestNo: s.submissionNo, formTitle: s.formName,
              formType: `FORM ${s.formId}`,
              submittedBy: s.initiatorName || s.initiatorId,
              submittedDate: formatDate(s.createdAt),
              status: approvalStatus,
              route: `/form${s.formId}/special-approver?id=${s.id}`,
            };
          })
        );

        // ── Pending workflows = only items STILL awaiting action ───────────
        setWorkflows(
          myApprovals
            .filter((s: any) => s.status === 'PENDING_SPECIAL_APPROVER')
            .map((s: any) => ({
              id: s.id, requestNo: s.submissionNo, formTitle: s.formName,
              formType: `FORM ${s.formId}`,
              submittedBy: s.initiatorName || s.initiatorId,
              submittedDate: formatDate(s.createdAt),
              route: `/form${s.formId}/special-approver?id=${s.id}`,
            }))
        );

        // ── Also include initiator resubmission workflows ──────────────────
        const resubmitItems = all
          .filter((s: any) => s.initiatorId === currentUserId && s.status === 'SENT_BACK')
          .map((s: any) => ({
            id: s.id, requestNo: s.submissionNo, formTitle: s.formName,
            formType: `FORM ${s.formId}`,
            submittedBy: currentUserName,
            submittedDate: formatDate(s.createdAt),
            route: `/form${s.formId}?mode=view&id=${s.id}`,
          }));

        setWorkflows(prev => [...prev, ...resubmitItems]);

      } catch (err) {
        console.error('Failed to load home data:', err);
      } finally {
        setLoading(false);
      }
    }
    if (currentUserId) loadData();
  }, [currentUserId, currentUserName, currentUserEmail]);

  const firstName = currentUserName.split(' ')[0];

  return (
    <div className="h-screen flex flex-col overflow-hidden relative"
      style={{ background: 'linear-gradient(160deg, #0f2240 0%, #1A438A 50%, #0f2240 100%)' }}>

      {/* ── Top Nav ── */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2 flex-shrink-0">
        <div className="flex gap-6">
          <button onClick={() => setActiveTab(activeTab === 'workflows' ? null : 'workflows')}
            className={`relative text-white font-medium pb-2 transition-all text-sm ${activeTab === 'workflows' ? 'border-b-2 border-white' : 'opacity-70 hover:opacity-100'}`}>
            My Workflows
            {workflows.length > 0 && (
              <span className="absolute -top-2 -right-5 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {workflows.length}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab(activeTab === 'submissions' ? null : 'submissions')}
            className={`relative text-white font-medium pb-2 transition-all text-sm ${activeTab === 'submissions' ? 'border-b-2 border-white' : 'opacity-70 hover:opacity-100'}`}>
            My Submissions
            {submissions.length > 0 && (
              <span className="absolute -top-2 -right-5 bg-[#1183B7] text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {submissions.length}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab(activeTab === 'approvals' ? null : 'approvals')}
            className={`relative text-white font-medium pb-2 transition-all text-sm ${activeTab === 'approvals' ? 'border-b-2 border-white' : 'opacity-70 hover:opacity-100'}`}>
            Special Approvals
            {approvals.filter(a => a.status === 'PENDING').length > 0 && (
              <span className="absolute -top-2 -right-5 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {approvals.filter(a => a.status === 'PENDING').length}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold px-3 py-1 rounded-full border border-white/20 text-white/70 bg-white/10">
            Special Approver
          </span>
          <Button variant="ghost" className="text-white hover:bg-white/10 text-sm" onClick={() => router.push('/login')}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="text-center py-3 flex-shrink-0">
        <div className="w-20 h-20 mx-auto mb-2 rounded-full bg-yellow-500 border-4 border-yellow-400 flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-black/30">
          {firstName.charAt(0)}
        </div>
        <h1 className="text-white text-xl font-medium mb-1">Welcome, {firstName}!</h1>
        <h2 className="text-[#AC9C2F] text-3xl font-bold">DIMO Legal Help Desk</h2>
      </div>

      {/* ── Form Grid ── */}
      <div className="flex-1 px-6 pb-4 overflow-hidden">
        <div className="h-full max-w-7xl mx-auto">
          <div className="grid h-full" style={{ gridTemplateColumns: '1fr 12px 1fr', gridAutoRows: '1fr' }}>
            <div className="grid gap-2" style={{ gridTemplateRows: 'repeat(5, 1fr)' }}>
              {FORMS.filter((_, i) => i % 2 === 0).map((form) => (
                <button key={form.id} onClick={() => router.push(form.route)}
                  className="group relative backdrop-blur-sm border rounded-xl p-3 transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl flex items-center min-h-0 text-left"
                  style={{ background: 'rgba(15, 34, 64, 0.55)', borderColor: 'rgba(17, 131, 183, 0.35)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(17, 131, 183, 0.25)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(15, 34, 64, 0.55)')}>
                  <div className={`w-11 h-11 ${form.color} rounded-full flex items-center justify-center flex-shrink-0 shadow-lg`}><FileText className="w-5 h-5 text-white" /></div>
                  <div className="text-left flex-1 ml-3 min-w-0"><h3 className="text-white text-sm font-bold mb-0.5 truncate">{form.title}</h3><p className="text-[#91ADC5] text-xs leading-tight line-clamp-2">{form.description}</p></div>
                  <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/60 flex-shrink-0 ml-2 transition-colors" />
                </button>
              ))}
            </div>
            <div className="flex flex-col items-center justify-center gap-1 py-2">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="w-px h-2 rounded-full" style={{ background: 'rgba(17,131,183,0.25)' }} />
              ))}
            </div>
            <div className="grid gap-2" style={{ gridTemplateRows: 'repeat(5, 1fr)' }}>
              {FORMS.filter((_, i) => i % 2 !== 0).map((form) => (
                <button key={form.id} onClick={() => router.push(form.route)}
                  className="group relative backdrop-blur-sm border rounded-xl p-3 transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl flex items-center min-h-0 text-left"
                  style={{ background: 'rgba(15, 34, 64, 0.55)', borderColor: 'rgba(17, 131, 183, 0.35)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(17, 131, 183, 0.25)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(15, 34, 64, 0.55)')}>
                  <div className={`w-11 h-11 ${form.color} rounded-full flex items-center justify-center flex-shrink-0 shadow-lg`}><FileText className="w-5 h-5 text-white" /></div>
                  <div className="text-left flex-1 ml-3 min-w-0"><h3 className="text-white text-sm font-bold mb-0.5 truncate">{form.title}</h3><p className="text-[#91ADC5] text-xs leading-tight line-clamp-2">{form.description}</p></div>
                  <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/60 flex-shrink-0 ml-2 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Panels ── */}
      {activeTab === 'workflows'   && <WorkflowsPanel  items={workflows}   loading={loading} onClose={() => setActiveTab(null)} onNavigate={(r) => router.push(r)} />}
      {activeTab === 'submissions' && <SubmissionsPanel items={submissions} loading={loading} onClose={() => setActiveTab(null)} onNavigate={(r) => router.push(r)} />}
      {activeTab === 'approvals'   && <ApprovalsPanel   items={approvals}   loading={loading} onClose={() => setActiveTab(null)} onNavigate={(r) => router.push(r)} />}
    </div>
  );
}