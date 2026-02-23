'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  FileText, LogOut, X, Search, ChevronRight, Clock,
  AlertCircle, CheckCircle2, XCircle, RotateCcw, Loader2, Eye} from "lucide-react";
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = 'INITIATOR' | 'BUM' | 'FBP' | 'CLUSTER_HEAD' | 'LEGAL_GM' | 'LEGAL_OFFICER' | 'CEO';
type ApprovalFilter = 'PENDING' | 'APPROVED' | 'MY_REJECTIONS' | 'OTHER_REJECTIONS' | 'ALL';
type SubmissionFilter = 'ALL' | 'APPROVAL_PENDING' | 'ONGOING' | 'COMPLETED' | 'RESUBMIT' | 'CANCELLED' | 'DRAFT' | 'RESUBMITTED';

const DB_TO_SUBMISSION: Record<string, SubmissionFilter> = {
  DRAFT: 'DRAFT', PENDING_APPROVAL: 'APPROVAL_PENDING',
  PENDING_LEGAL_GM: 'ONGOING', PENDING_LEGAL_OFFICER: 'ONGOING',
  PENDING_LEGAL_GM_FINAL: 'ONGOING', PENDING_SPECIAL_APPROVER: 'ONGOING',
  COMPLETED: 'COMPLETED', SENT_BACK: 'RESUBMIT', CANCELLED: 'CANCELLED', RESUBMITTED: 'RESUBMITTED',
};

type WorkflowItem  = { id: string; requestNo: string; formTitle: string; formType: string; submittedBy: string; submittedDate: string; actionRequired: 'APPROVAL_NEEDED' | 'MORE_DOCS_NEEDED' | 'RESUBMISSION_NEEDED' | 'VIEW_ONLY'; dueDate: string; isOverdue: boolean; route: string; };
type ApprovalItem  = { id: string; requestNo: string; formTitle: string; formType: string; submittedBy: string; submittedDate: string; status: ApprovalFilter; route: string; };
type SubmissionItem = { id: string; requestNo: string; formTitle: string; formType: string; submittedDate: string; status: SubmissionFilter; lastUpdated: string; };

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
  PENDING:          { label: 'Pending',          color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  APPROVED:         { label: 'Approved',         color: 'bg-green-500/20 text-green-300 border-green-500/40' },
  MY_REJECTIONS:    { label: 'My Rejections',    color: 'bg-red-500/20 text-red-300 border-red-500/40' },
  OTHER_REJECTIONS: { label: 'Other Rejections', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
  ALL:              { label: 'All',              color: 'bg-white/10 text-white border-white/20' },
};

const SUBMISSION_STATUS_CONFIG: Record<SubmissionFilter, { label: string; color: string; icon: React.ReactNode }> = {
  ALL:              { label: 'All',              color: 'bg-white/10 text-white border-white/20',                icon: null },
  DRAFT:            { label: 'Draft',            color: 'bg-slate-500/20 text-slate-300 border-slate-500/40',     icon: null },
  APPROVAL_PENDING: { label: 'Approval Pending', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', icon: <Clock className="w-3 h-3" /> },
  ONGOING:          { label: 'Ongoing',          color: 'bg-blue-500/20 text-blue-300 border-blue-500/40',       icon: <Loader2 className="w-3 h-3" /> },
  COMPLETED:        { label: 'Completed',        color: 'bg-green-500/20 text-green-300 border-green-500/40',    icon: <CheckCircle2 className="w-3 h-3" /> },
  RESUBMIT:         { label: 'Re-Submit',        color: 'bg-orange-500/20 text-orange-300 border-orange-500/40', icon: <RotateCcw className="w-3 h-3" /> },
  CANCELLED:        { label: 'Cancelled',        color: 'bg-red-500/20 text-red-300 border-red-500/40',          icon: <XCircle className="w-3 h-3" /> },
  RESUBMITTED:      { label: 'Resubmitted',      color: 'bg-slate-500/20 text-slate-300 border-slate-500/40',     icon: <RotateCcw className="w-3 h-3" /> },
};

const SUBMISSION_BORDER: Record<SubmissionFilter, string> = {
  ALL: 'border-l-white/30', DRAFT: 'border-l-slate-400', APPROVAL_PENDING: 'border-l-yellow-400',
  ONGOING: 'border-l-blue-400', COMPLETED: 'border-l-green-400',
  RESUBMIT: 'border-l-orange-400', CANCELLED: 'border-l-red-400', RESUBMITTED: 'border-l-slate-400',
};

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getUTCDate()).padStart(2,'0')} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function getRoleLabel(role: UserRole): string {
  const map: Record<UserRole, string> = {
    INITIATOR: 'Initiator', BUM: 'BUM', FBP: 'FBP',
    CLUSTER_HEAD: 'Cluster Head', LEGAL_GM: 'Legal GM', LEGAL_OFFICER: 'Legal Officer', CEO: 'CEO',
  };
  return map[role];
}

function ActionBadge({ action, isOverdue }: { action: WorkflowItem['actionRequired']; isOverdue: boolean }) {
  if (isOverdue) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/40"><AlertCircle className="w-3 h-3" /> Overdue</span>;
  if (action === 'VIEW_ONLY') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-300 border border-slate-500/40"><Eye className="w-3 h-3" /> View Only</span>;
  if (action === 'APPROVAL_NEEDED') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"><Clock className="w-3 h-3" /> Approval Needed</span>;
  if (action === 'MORE_DOCS_NEEDED') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/40"><AlertCircle className="w-3 h-3" /> More Docs Needed</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40"><RotateCcw className="w-3 h-3" /> Resubmission</span>;
}

function ApprovalStatusBadge({ status }: { status: ApprovalFilter }) {
  const config = APPROVAL_FILTER_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${config.color}`}>
      {status === 'PENDING' && <Clock className="w-3 h-3" />}
      {status === 'APPROVED' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'MY_REJECTIONS' && <XCircle className="w-3 h-3" />}
      {status === 'OTHER_REJECTIONS' && <AlertCircle className="w-3 h-3" />}
      {config.label}
    </span>
  );
}

function SubmissionStatusBadge({ status }: { status: SubmissionFilter }) {
  const config = SUBMISSION_STATUS_CONFIG[status];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${config.color}`}>{config.icon}{config.label}</span>;
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function WorkflowsPanel({ items, loading, onClose, onNavigate }: { items: WorkflowItem[]; loading: boolean; onClose: () => void; onNavigate: (r: string) => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#17293E] border border-[#1183B7]/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1183B7]/30 bg-[#1A3A5C]">
          <div><h2 className="text-white text-lg font-bold">My Workflows</h2><p className="text-[#91ADC5] text-xs mt-0.5">Tasks requiring your attention</p></div>
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
                <div className="flex flex-col items-end gap-2 flex-shrink-0"><ActionBadge action={item.actionRequired} isOverdue={item.isOverdue} /><ChevronRight className="w-4 h-4 text-[#91ADC5] group-hover:text-white transition-all" /></div>
              </div>
            </button>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-[#1183B7]/20 bg-[#17293E]/80 text-center"><p className="text-[#91ADC5] text-xs">{items.length} pending items</p></div>
      </div>
    </div>
  );
}

function ApprovalsPanel({ items, loading, onClose, onNavigate }: { items: ApprovalItem[]; loading: boolean; onClose: () => void; onNavigate: (route: string) => void }) {
  const [activeFilter, setActiveFilter] = useState<ApprovalFilter>('PENDING');
  const [search, setSearch] = useState('');
  const FILTERS: ApprovalFilter[] = ['PENDING', 'APPROVED', 'MY_REJECTIONS', 'OTHER_REJECTIONS', 'ALL'];
  const filtered = items.filter((item) => {
    const matchesFilter = activeFilter === 'ALL' || item.status === activeFilter;
    const matchesSearch = search === '' || item.requestNo.toLowerCase().includes(search.toLowerCase()) || item.formTitle.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#17293E] border border-[#1183B7]/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1183B7]/30 bg-[#1A3A5C]">
          <div><h2 className="text-white text-lg font-bold">Approvals</h2><p className="text-[#91ADC5] text-xs mt-0.5">Requests assigned to you for approval</p></div>
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
        <div className="px-6 py-3 border-t border-[#1183B7]/20 bg-[#17293E]/80 text-center"><p className="text-[#91ADC5] text-xs">{items.filter(a => a.status === 'PENDING').length} pending · {filtered.length} of {items.length} shown</p></div>
      </div>
    </div>
  );
}


function DraftsPanel({ items, loading, onClose, onNavigate }: { items: SubmissionItem[]; loading: boolean; onClose: () => void; onNavigate: (route: string) => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#17293E] border border-[#1183B7]/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1183B7]/30 bg-[#1A3A5C]">
          <div><h2 className="text-white text-lg font-bold">My Drafts</h2><p className="text-[#91ADC5] text-xs mt-0.5">Saved drafts you can continue editing</p></div>
          <button onClick={onClose} className="text-[#91ADC5] hover:text-white rounded-lg p-1 hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#1183B7]/20">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[#91ADC5]"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#91ADC5]"><FileText className="w-10 h-10 mb-3 opacity-30" /><p className="text-sm">No drafts saved yet</p></div>
          ) : items.map((item) => (
            <button key={item.id} onClick={() => { onClose(); onNavigate(`/form1?mode=draft&id=${item.id}`); }} className="w-full text-left px-6 py-4 hover:bg-[#1183B7]/10 transition-colors group border-l-4 border-l-slate-400">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1"><span className="text-[#91ADC5] text-xs font-mono">{item.requestNo}</span><span className="text-[#AC9C2F] text-xs font-semibold">{item.formType}</span></div>
                  <p className="text-white text-sm font-semibold truncate mb-1.5">{item.formTitle}</p>
                  <div className="flex items-center gap-3 text-xs text-[#91ADC5]"><span>Started {item.submittedDate}</span><span>•</span><span>Last saved {item.lastUpdated}</span></div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-500/20 text-slate-300 border-slate-500/40">Draft</span>
                  <ChevronRight className="w-4 h-4 text-[#91ADC5] group-hover:text-white transition-all" />
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-[#1183B7]/20 bg-[#17293E]/80 text-center"><p className="text-[#91ADC5] text-xs">{items.length} draft{items.length !== 1 ? 's' : ''} saved</p></div>
      </div>
    </div>
  );
}

function SubmissionsPanel({ items, loading, onClose, onNavigate }: { items: SubmissionItem[]; loading: boolean; onClose: () => void; onNavigate: (route: string) => void }) {
  const [activeFilter, setActiveFilter] = useState<SubmissionFilter>('ALL');
  const [search, setSearch] = useState('');
  const FILTERS: SubmissionFilter[] = ['ALL', 'APPROVAL_PENDING', 'ONGOING', 'COMPLETED', 'RESUBMIT', 'CANCELLED'];
  const filtered = items.filter((item) => {
    const matchesFilter = activeFilter === 'ALL' || item.status === activeFilter;
    const matchesSearch = search === '' || item.requestNo.toLowerCase().includes(search.toLowerCase()) || item.formTitle.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#17293E] border border-[#1183B7]/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1183B7]/30 bg-[#1A3A5C]">
          <div><h2 className="text-white text-lg font-bold">My Submissions</h2><p className="text-[#91ADC5] text-xs mt-0.5">All requests you have submitted</p></div>
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
            <button key={item.id} onClick={() => { onClose(); onNavigate(`/form1?mode=${item.status === 'RESUBMIT' ? 'resubmit' : 'view'}&id=${item.id}`); }} className={`w-full text-left px-6 py-4 hover:bg-[#1183B7]/10 transition-colors group border-l-4 ${SUBMISSION_BORDER[item.status]}`}>
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
        <div className="px-6 py-3 border-t border-[#1183B7]/20 bg-[#17293E]/80 text-center"><p className="text-[#91ADC5] text-xs">{filtered.length} of {items.length} submissions</p></div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { data: session } = useSession();
  const currentRole = (session?.user?.role as UserRole) ?? 'INITIATOR';
  const currentUserName = session?.user?.name ?? 'User';
  const currentUserId = session?.user?.id ?? '';
  const router = useRouter();
  const isApprover = currentRole !== 'INITIATOR';

  type TabType = 'workflows' | 'submissions' | 'approvals' | 'drafts' | null;
  const [activeTab, setActiveTab] = useState<TabType>(null);

  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [drafts, setDrafts]             = useState<SubmissionItem[]>([]);
  const [approvals, setApprovals]     = useState<ApprovalItem[]>([]);
  const [workflows, setWorkflows]     = useState<WorkflowItem[]>([]);
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res  = await fetch('/api/submissions');
        const json = await res.json();
        if (!json.success) return;
        const all = json.data;

        // ── My Submissions (initiator view — all statuses) ─────────────────
        setSubmissions(
          all.filter((s: any) => s.initiatorId === currentUserId && s.status !== 'RESUBMITTED').map((s: any) => ({
            id: s.id, requestNo: s.submissionNo, formTitle: s.formName,
            formType: `FORM ${s.formId}`, submittedDate: formatDate(s.createdAt),
            status: DB_TO_SUBMISSION[s.status] || 'ONGOING', lastUpdated: formatDate(s.updatedAt),
          }))
        );

        // ── My Drafts (initiator only) ──────────────────────────────────────
        setDrafts(
          all.filter((s: any) => s.initiatorId === currentUserId && s.status === 'DRAFT').map((s: any) => ({
            id: s.id, requestNo: s.submissionNo, formTitle: s.formName,
            formType: `FORM ${s.formId}`, submittedDate: formatDate(s.createdAt),
            status: 'DRAFT' as SubmissionFilter, lastUpdated: formatDate(s.updatedAt),
          }))
        );

        if (isApprover) {
          // ── Collect ALL submissions this role has EVER been involved with ──
          // This is the key fix: we never filter by current status.
          // Instead we look at each role's historical involvement.
          const mySubmissions = (() => {
            if (currentRole === 'BUM')
              // BUM sees all submissions where they are assigned as BUM
              return all.filter((s: any) => s.bumId === currentUserId);

            if (currentRole === 'FBP')
              // FBP sees all submissions where they are assigned as FBP
              return all.filter((s: any) => s.fbpId === currentUserId);

            if (currentRole === 'CLUSTER_HEAD')
              // Cluster Head sees all submissions where they are assigned
              return all.filter((s: any) => s.clusterHeadId === currentUserId);

            if (currentRole === 'LEGAL_GM')
              // FIX: GM sees ALL submissions that have EVER reached GM stage
              // (not just currently at GM stage). We detect this by checking
              // if the submission has passed the initial approval stage at all.
              return all.filter((s: any) => ![
                'PENDING_APPROVAL', 'DRAFT'
              ].includes(s.status));

            if (currentRole === 'LEGAL_OFFICER')
              // FIX: LO sees ALL submissions ever assigned to them
              // (not just those currently at LO stage)
              return all.filter((s: any) => s.assignedLegalOfficer === currentUserId);

            return [];
          })();

          // ── Map each submission to an approval status for this role ────────
          const firstLevelRoles = ['BUM', 'FBP', 'CLUSTER_HEAD'];

          setApprovals(
            mySubmissions.map((s: any) => {
              let status: ApprovalFilter = 'PENDING';

              if (firstLevelRoles.includes(currentRole)) {
                // Use the individual approval record — persists regardless of overall submission status
                const myRecord = s.approvals?.find((a: any) => a.role === currentRole);
                if (myRecord) {
                  if (myRecord.status === 'APPROVED')   status = 'APPROVED';
                  else if (myRecord.status === 'SENT_BACK' || myRecord.status === 'CANCELLED') status = 'MY_REJECTIONS';
                  else status = 'PENDING';
                }
              } else if (currentRole === 'LEGAL_GM') {
                // Map current submission status to GM perspective
                if (['COMPLETED'].includes(s.status))                         status = 'APPROVED';
                else if (s.status === 'CANCELLED')                            status = 'OTHER_REJECTIONS';
                else if (s.status === 'SENT_BACK')                            status = 'MY_REJECTIONS';
                else if (['PENDING_LEGAL_GM', 'PENDING_LEGAL_GM_FINAL'].includes(s.status)) status = 'PENDING';
                else status = 'APPROVED'; // past GM stage = GM already approved
              } else if (currentRole === 'LEGAL_OFFICER') {
                // Map current submission status to LO perspective
                if (s.status === 'COMPLETED')                                 status = 'APPROVED';
                else if (s.status === 'CANCELLED')                            status = 'OTHER_REJECTIONS';
                else if (s.status === 'SENT_BACK')                            status = 'MY_REJECTIONS';
                else if (s.status === 'PENDING_LEGAL_OFFICER')                status = 'PENDING';
                else status = 'APPROVED'; // past LO stage = LO already approved/forwarded
              }

              const route =
                currentRole === 'LEGAL_OFFICER' ? `/form${s.formId}/legal-officer?id=${s.id}` :
                currentRole === 'LEGAL_GM'       ? `/form${s.formId}/legal-gm?id=${s.id}` :
                currentRole === 'CEO'           ? `/form${s.formId}/ceo?id=${s.id}` :
                                                   `/form${s.formId}/approval?id=${s.id}`;

              return {
                id: s.id, requestNo: s.submissionNo, formTitle: s.formName,
                formType: `FORM ${s.formId}`, submittedBy: s.initiatorName || s.initiatorId,
                submittedDate: formatDate(s.createdAt), status, route,
              };
            })
          );

          // ── Pending workflows = items needing action OR viewable by LO/GM ──
          const needsAction = (s: any): boolean => {
            if (currentRole === 'BUM' || currentRole === 'FBP' || currentRole === 'CLUSTER_HEAD')
              return s.status === 'PENDING_APPROVAL' &&
                     s.approvals?.some((a: any) => a.role === currentRole && a.status === 'PENDING');
            if (currentRole === 'LEGAL_GM')
              return ['PENDING_LEGAL_GM', 'PENDING_LEGAL_GM_FINAL'].includes(s.status);
            if (currentRole === 'LEGAL_OFFICER')
              return s.status === 'PENDING_LEGAL_OFFICER';
            return false;
          };

          // LO and GM also see all their past submissions (view only)
          const workflowSubmissions = (currentRole === 'LEGAL_OFFICER' || currentRole === 'LEGAL_GM')
            ? mySubmissions
            : mySubmissions.filter((s: any) => needsAction(s));

          setWorkflows(
            workflowSubmissions.map((s: any) => ({
              id: s.id, requestNo: s.submissionNo, formTitle: s.formName,
              formType: `FORM ${s.formId}`, submittedBy: s.initiatorName || s.initiatorId,
              submittedDate: formatDate(s.createdAt),
              actionRequired: needsAction(s) ? 'APPROVAL_NEEDED' as const : 'VIEW_ONLY' as const,
              dueDate: s.dueDate ? formatDate(s.dueDate) : formatDate(s.createdAt),
              isOverdue: needsAction(s) && s.dueDate ? new Date() > new Date(s.dueDate) : false,
              route:
                currentRole === 'LEGAL_OFFICER' ? `/form${s.formId}/legal-officer?id=${s.id}` :
                currentRole === 'LEGAL_GM'       ? `/form${s.formId}/legal-gm?id=${s.id}` :
                currentRole === 'CEO'           ? `/form${s.formId}/ceo?id=${s.id}` :
                                                   `/form${s.formId}/approval?id=${s.id}`,
            }))
          );

        } else {
          // ── Initiator workflows — sent back items needing resubmission ─────
          setWorkflows(
            all.filter((s: any) => s.initiatorId === currentUserId && s.status === 'SENT_BACK')
               .map((s: any) => ({
                 id: s.id, requestNo: s.submissionNo, formTitle: s.formName,
                 formType: `FORM ${s.formId}`, submittedBy: currentUserName,
                 submittedDate: formatDate(s.createdAt), actionRequired: 'RESUBMISSION_NEEDED' as const,
                 dueDate: s.dueDate ? formatDate(s.dueDate) : formatDate(s.updatedAt),
                 isOverdue: s.dueDate ? new Date() > new Date(s.dueDate) : false,
                 route: `/form${s.formId}?id=${s.id}`,
               }))
          );
        }
      } catch (err) {
        console.error('Failed to load home data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [currentUserId, currentRole, isApprover, currentUserName]);

  const firstName = currentUserName.split(' ')[0];

  return (
    <div className="h-screen flex flex-col overflow-hidden relative"
      style={{ background: 'linear-gradient(160deg, #0f2240 0%, #1A438A 50%, #0f2240 100%)' }}>

      <div className="flex items-center justify-between px-6 pt-4 pb-2 flex-shrink-0">
        <div className="flex gap-6">
          <button onClick={() => setActiveTab(activeTab === 'workflows' ? null : 'workflows')}
            className={`relative text-white font-medium pb-2 transition-all text-sm ${activeTab === 'workflows' ? 'border-b-2 border-white' : 'opacity-70 hover:opacity-100'}`}>
            My Workflows
            {workflows.length > 0 && <span className="absolute -top-2 -right-5 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">{workflows.length}</span>}
          </button>
          <button onClick={() => setActiveTab(activeTab === 'submissions' ? null : 'submissions')}
            className={`relative text-white font-medium pb-2 transition-all text-sm ${activeTab === 'submissions' ? 'border-b-2 border-white' : 'opacity-70 hover:opacity-100'}`}>
            My Submissions
            {submissions.length > 0 && <span className="absolute -top-2 -right-5 bg-[#1183B7] text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">{submissions.length}</span>}
          </button>
          {!isApprover && (
            <button onClick={() => setActiveTab(activeTab === 'drafts' ? null : 'drafts')}
              className={`relative text-white font-medium pb-2 transition-all text-sm ${activeTab === 'drafts' ? 'border-b-2 border-white' : 'opacity-70 hover:opacity-100'}`}>
              My Drafts
              {drafts.length > 0 && <span className="absolute -top-2 -right-5 bg-slate-400 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">{drafts.length}</span>}
            </button>
          )}
          {isApprover && (
            <button onClick={() => setActiveTab(activeTab === 'approvals' ? null : 'approvals')}
              className={`relative text-white font-medium pb-2 transition-all text-sm ${activeTab === 'approvals' ? 'border-b-2 border-white' : 'opacity-70 hover:opacity-100'}`}>
              Approvals
              {approvals.filter(a => a.status === 'PENDING').length > 0 && <span className="absolute -top-2 -right-5 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">{approvals.filter(a => a.status === 'PENDING').length}</span>}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold px-3 py-1 rounded-full border border-white/20 text-white/70 bg-white/10">{getRoleLabel(currentRole)}</span>
          <Button variant="ghost" className="text-white hover:bg-white/10 text-sm" onClick={() => router.push('/login')}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </div>

      <div className="text-center py-3 flex-shrink-0">
        <div className="w-20 h-20 mx-auto mb-2 rounded-full bg-yellow-500 border-4 border-yellow-400 flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-black/30">{firstName.charAt(0)}</div>
        <h1 className="text-white text-xl font-medium mb-1">Welcome, {firstName}!</h1>
        <h2 className="text-[#AC9C2F] text-3xl font-bold">DIMO Legal Help Desk</h2>
      </div>

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
              {Array.from({ length: 18 }).map((_, i) => (<div key={i} className="w-px h-2 rounded-full" style={{ background: 'rgba(17,131,183,0.25)' }} />))}
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

      {activeTab === 'workflows'   && <WorkflowsPanel  items={workflows}   loading={loading} onClose={() => setActiveTab(null)} onNavigate={(r) => router.push(r)} />}
      {activeTab === 'submissions' && <SubmissionsPanel items={submissions} loading={loading} onClose={() => setActiveTab(null)} onNavigate={(r) => router.push(r)} />}
      {activeTab === 'drafts'      && <DraftsPanel      items={drafts}      loading={loading} onClose={() => setActiveTab(null)} onNavigate={(r) => router.push(r)} />}
      {activeTab === 'approvals'   && <ApprovalsPanel   items={approvals}   loading={loading} onClose={() => setActiveTab(null)} onNavigate={(r) => router.push(r)} />}
    </div>
  );
}