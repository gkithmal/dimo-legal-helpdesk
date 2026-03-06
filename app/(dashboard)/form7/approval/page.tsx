'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import {
  X, Home, Lightbulb, Search, Settings, User,
  ArrowLeft, CheckCircle2, FileText, Clock, XCircle,
  RotateCcw, Send, Paperclip, AlertCircle, Loader2, Eye,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'SENT_BACK' | 'CANCELLED';
type UserRole = 'BUM' | 'GENERAL_MANAGER';

type ApproverRecord = {
  id: string; role: string; label: string;
  approverName: string; approverEmail: string;
  status: ApprovalStatus; comment?: string | null; actionDate?: string | null;
};

type Submission = {
  id: string; submissionNo: string; status: string;
  companyCode: string; title: string; sapCostCenter: string;
  f7AgreementRefNo?: string; f7AgreementDate?: string;
  f7InitiatorContact?: string; f7AssessmentAddress?: string; f7OwnerNames?: string;
  f7EffectiveTerminationDate?: string; f7EarlyTerminationCharges?: string;
  f7RefundableDeposit?: string; f7PaymentDate1?: string; f7AdvanceRentals?: string;
  f7PaymentDate2?: string; f7Deductions?: string; f7FacilityPayments?: string;
  f7Penalty?: string; f7AmountDueByDimo?: string; f7BalanceToRecover?: string;
  f7DateInformedToLessee?: string; remarks?: string;
  initiatorComments?: string;
  initiatorName?: string;
  comments?: { id: string; authorName: string; authorRole: string; text: string; createdAt: string }[];
  approvals: ApproverRecord[];
  documents: { id: string; label: string; type: string; status: string; fileUrl?: string | null }[];
};

type LogEntry = { id: number; actor: string; role: string; action: string; comment?: string; timestamp: string };
type CommentEntry = { id: number; author: string; role: string; text: string; time: string };

const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' }, { label: 'Approvals' }, { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' }, { label: 'Legal GM\nApproval' }, { label: 'Ready\nto Collect' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function WorkflowStepper({ steps, activeStep }: { steps: { label: string }[]; activeStep: number }) {
  return (
    <div className="relative flex justify-between items-start">
      <div className="absolute top-[9px] left-[9px] right-[9px] h-px bg-slate-200" />
      <div className="absolute top-[9px] left-[9px] h-px bg-[#1A438A] transition-all"
        style={{ width: `${activeStep === 0 ? 0 : (activeStep / (steps.length - 1)) * 100}%` }} />
      {steps.map((step, i) => (
        <div key={i} className="relative flex flex-col items-center z-10" style={{ width: `${100 / steps.length}%` }}>
          <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all shadow-sm
            ${i < activeStep ? 'bg-[#1A438A] border-[#1A438A]'
            : i === activeStep ? 'bg-[#1A438A] border-[#1A438A] ring-4 ring-[#1A438A]/15'
            : 'bg-white border-slate-300'}`}>
            {i < activeStep && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
            {i === activeStep && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
          <p className="text-[9px] text-center leading-tight whitespace-pre-line mt-1.5 text-slate-500 font-medium px-0.5">{step.label}</p>
        </div>
      ))}
    </div>
  );
}

function SidebarIcon({ icon, onClick, active }: { icon: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full h-10 rounded-xl flex items-center justify-center transition-all ${active ? 'bg-white/20 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}>
      {icon}
    </button>
  );
}

function PanelSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</label>
      <div className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">
        {value || <span className="text-slate-400 italic">—</span>}
      </div>
    </div>
  );
}

function ApproverStatusIcon({ status }: { status: ApprovalStatus }) {
  if (status === 'APPROVED') return <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-white" /></span>;
  if (status === 'CANCELLED') return <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"><XCircle className="w-3 h-3 text-white" /></span>;
  if (status === 'SENT_BACK') return <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center"><RotateCcw className="w-3 h-3 text-white" /></span>;
  return <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center"><Clock className="w-3 h-3 text-white" /></span>;
}

function ViewLogModal({ log, onClose }: { log: LogEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
          <span className="text-white font-bold">View Log</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3">
          {log.length === 0 && <p className="text-sm text-slate-400 text-center">No log entries yet.</p>}
          {log.map((entry, i) => (
            <div key={entry.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-[#EEF3F8] border-2 border-[#1A438A]/20 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-[#1A438A]">{i + 1}</span>
                </div>
                {i < log.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-bold text-[#17293E]">{entry.actor}</span>
                  <span className="text-[10px] text-slate-400">{entry.timestamp}</span>
                </div>
                <span className="text-[11px] text-[#4686B7] font-semibold">{entry.role}</span>
                <p className="text-sm text-slate-600 mt-0.5">{entry.action}</p>
                {entry.comment && <p className="text-xs text-slate-500 mt-1 italic bg-slate-50 rounded-lg px-2 py-1">&quot;{entry.comment}&quot;</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
function Form7ApprovalContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [showSignOut, setShowSignOut] = useState(false);
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('id');

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('PENDING');
  const [actionDone, setActionDone] = useState(false);

  const myRole = session?.user?.role as UserRole;
  const approvalRole = myRole === 'GENERAL_MANAGER' ? 'GENERAL_MANAGER' : 'BUM';

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/submissions?formId=7');
      const data = await res.json();
      if (data.success) {
        const all = (data.data || []).filter((s: any) => s.formId === 7);
        setSubmissions(all);
        if (submissionId) {
          const found = all.find((s: any) => s.id === submissionId);
          if (found) setSelected(found);
        }
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [submissionId]);

  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  useEffect(() => {
    if (selected?.comments?.length) {
      setComments(selected.comments.map((c: any, i: number) => ({
        id: i, author: c.authorName, role: c.authorRole, text: c.text,
        time: new Date(c.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      })));
    }
  }, [selected]);

  const myApproval = selected?.approvals?.find((a) => a.role === approvalRole);
  const hasActed = myApproval?.status !== 'PENDING';

  const handleAction = async (action: 'APPROVED' | 'SENT_BACK' | 'CANCELLED') => {
    if (!selected || actionLoading) return;
    setActionLoading(true);
    try {
      await fetch(`/api/submissions/${selected.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: approvalRole,
          action,
          comment,
          approverName: session?.user?.name,
          approverEmail: session?.user?.email,
        }),
      });
      if (comment.trim()) {
        await fetch(`/api/submissions/${selected.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: comment, authorName: session?.user?.name, authorRole: approvalRole }),
        });
      }
      setActionDone(true);
      await loadSubmissions();
    } catch { /* silent */ }
    setActionLoading(false);
  };

  const postComment = async () => {
    if (!comment.trim() || !selected) return;
    await fetch(`/api/submissions/${selected.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: comment, authorName: session?.user?.name, authorRole: approvalRole }),
    });
    setComments((p) => [...p, { id: Date.now(), author: session?.user?.name || '', role: approvalRole, text: comment, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }]);
    setComment('');
  };

  const filteredSubs = submissions.filter((s) => {
    if (filterStatus === 'PENDING') return s.status === 'PENDING_APPROVAL';
    if (filterStatus === 'APPROVED') return ['PENDING_LEGAL_GM', 'PENDING_LEGAL_OFFICER', 'PENDING_LEGAL_GM_FINAL', 'COMPLETED'].includes(s.status);
    if (filterStatus === 'CANCELLED') return s.status === 'CANCELLED';
    return true;
  });

  if (status === 'loading' || loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"><Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" /></div>;
  }

  if (!selected) {
    return (
      <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');`}</style>
        <div className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen" style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
          <div className="relative mb-1">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">{session?.user?.name?.charAt(0) || 'U'}</div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]" />
          </div>
          <div className="text-center">
            <p className="text-white text-[10px] font-semibold">{session?.user?.name?.split(' ')[0] || 'Me'}</p>
            <p className="text-white/40 text-[9px]">{session?.user?.name?.split(' ').slice(1).join(' ') || ''}</p>
          </div>
          <div className="w-8 h-px bg-white/10" />
          <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
            <NotificationBell />
            <SidebarIcon icon={<Home className="w-[18px] h-[18px]" />} onClick={() => router.push(ROUTES.HOME)} />
            <SidebarIcon icon={<FileText className="w-[18px] h-[18px]" />} active />
            <SidebarIcon icon={<Lightbulb className="w-[18px] h-[18px]" />} />
          </nav>
          <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
            <SidebarIcon icon={<Settings className="w-[18px] h-[18px]" />} />
            <SidebarIcon icon={<User className="w-[18px] h-[18px]" />} onClick={() => setShowSignOut(true)} />
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => router.push(ROUTES.HOME)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50">
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
              <h1 className="text-lg font-black text-[#17293E]">Form 7 — Approvals</h1>
              <span className="text-[11px] text-slate-400 bg-white border border-slate-200 rounded-lg px-2 py-0.5">{myRole === 'GENERAL_MANAGER' ? 'General Manager' : 'BUM'}</span>
            </div>
            {/* Filter tabs */}
            <div className="flex gap-2 mb-4">
              {['ALL', 'PENDING', 'APPROVED', 'CANCELLED'].map((f) => (
                <button key={f} onClick={() => setFilterStatus(f)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${filterStatus === f ? 'text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                  style={filterStatus === f ? { background: '#1A438A' } : {}}>
                  {f}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {filteredSubs.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                  <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 font-medium">No submissions found</p>
                </div>
              )}
              {filteredSubs.map((s) => (
                <button key={s.id} onClick={() => setSelected(s)}
                  className="w-full text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:border-[#1A438A]/30 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#17293E]">{s.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{s.submissionNo} · {s.companyCode}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Ref: {s.f7AgreementRefNo || 'N/A'}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.status === 'PENDING_APPROVAL' ? 'bg-yellow-100 text-yellow-700' : s.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {s.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const myApprovalRecord = selected.approvals.find((a) => a.role === approvalRole);

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');`}</style>

      {/* Sidebar */}
      <div className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen" style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
        <div className="relative mb-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">
            {session?.user?.name?.charAt(0) || 'U'}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]" />
        </div>
        <div className="text-center">
          <p className="text-white text-[10px] font-semibold">{session?.user?.name?.split(' ')[0] || 'Me'}</p>
          <p className="text-white/40 text-[9px]">{session?.user?.name?.split(' ').slice(1).join(' ') || ''}</p>
        </div>
        <div className="w-8 h-px bg-white/10" />
        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          <NotificationBell />
          <SidebarIcon icon={<Home className="w-[18px] h-[18px]" />} onClick={() => router.push(ROUTES.HOME)} />
          <SidebarIcon icon={<FileText className="w-[18px] h-[18px]" />} active />
          <SidebarIcon icon={<Lightbulb className="w-[18px] h-[18px]" />} />
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <SidebarIcon icon={<Settings className="w-[18px] h-[18px]" />} />
          <SidebarIcon icon={<User className="w-[18px] h-[18px]" />} onClick={() => setShowSignOut(true)} />
        </div>
      </div>

      <div className="flex-1 flex gap-4 p-4 overflow-auto">
        {/* Left: Form details */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all">
                  <ArrowLeft className="w-4 h-4 text-white" />
                </button>
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><FileText className="w-5 h-5 text-white" /></div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">Termination of Lease Agreement</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono tracking-wide">16/FM/1641/07/07</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <NotificationBell />
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 7</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Submission Details</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ReadField label="Agreement Reference No" value={selected.f7AgreementRefNo || '—'} />
              <ReadField label="Agreement Date" value={selected.f7AgreementDate || '—'} />
              <ReadField label="Initiated by" value={selected.initiatorName || '—'} />
              <ReadField label="Initiator's Contact No" value={selected.f7InitiatorContact || '—'} />
              <ReadField label="Company Code" value={selected.companyCode} />
              <ReadField label="SAP Cost Centre" value={selected.sapCostCenter} />
            </div>
            <ReadField label="Assessment No./Address" value={selected.f7AssessmentAddress || '—'} />
            <ReadField label="Names of the Owner/s" value={selected.f7OwnerNames || '—'} />
            <div className="grid grid-cols-2 gap-3">
              <ReadField label="Effective Termination Date" value={selected.f7EffectiveTerminationDate || '—'} />
              <ReadField label="Early Termination Charges" value={selected.f7EarlyTerminationCharges || '—'} />
              <ReadField label="Refundable Deposit" value={selected.f7RefundableDeposit || '—'} />
              <ReadField label="Payment Date" value={selected.f7PaymentDate1 || '—'} />
              <ReadField label="Advance Rentals" value={selected.f7AdvanceRentals || '—'} />
              <ReadField label="Payment Date" value={selected.f7PaymentDate2 || '—'} />
            </div>
            <ReadField label="Deductions" value={selected.f7Deductions || '—'} />
            <div className="grid grid-cols-2 gap-3">
              <ReadField label="Facility Payments Due" value={selected.f7FacilityPayments || '—'} />
              <ReadField label="Penalty if Applicable" value={selected.f7Penalty || '—'} />
              <ReadField label="Amount Due by DIMO" value={selected.f7AmountDueByDimo || '—'} />
              <ReadField label="Balance to be Recovered from Owner/s" value={selected.f7BalanceToRecover || '—'} />
              <ReadField label="Date Informed to Lessee" value={selected.f7DateInformedToLessee || '—'} />
            </div>
            <ReadField label="Remarks" value={selected.remarks || '—'} />
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          {/* Submission No + Stepper */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
              <button onClick={() => setShowLog(true)} className="text-white/70 text-[10px] font-bold uppercase tracking-wider hover:text-white transition-colors">View Log</button>
              <span className="text-white font-black text-base">{selected.submissionNo}</span>
            </div>
            <div className="px-4 py-4">
              <WorkflowStepper steps={WORKFLOW_STEPS} activeStep={1} />
            </div>
          </div>

          {/* Required Documents */}
          <PanelSection title="Required Documents">
            <div className="p-3 space-y-2">
              {selected.documents.filter((d) => d.type === 'required').length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-2">No documents uploaded</p>
              )}
              {selected.documents.filter((d) => d.type === 'required').map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl">
                  <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-[11px] text-slate-600 flex-1 truncate">{doc.label}</span>
                  {doc.fileUrl && (
                    <button onClick={() => window.open(doc.fileUrl!, '_blank')} className="w-6 h-6 rounded-lg bg-[#EEF3F8] flex items-center justify-center hover:bg-[#d9e4f0]">
                      <Eye className="w-3 h-3 text-[#1A438A]" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </PanelSection>

          {/* Documents Prepared by Legal Dept */}
          <PanelSection title="Documents Prepared by Legal Department">
            <div className="p-3">
              <p className="text-[11px] text-slate-400 italic text-center py-2">No documents yet</p>
            </div>
          </PanelSection>

          {/* Approvals */}
          <PanelSection title="Approvals">
            <div className="p-3 space-y-2">
              {selected.approvals.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-1.5 px-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-slate-600 w-28 flex-shrink-0">{a.role === 'GENERAL_MANAGER' ? 'General Manager' : a.role}</span>
                    <span className="text-[11px] text-slate-500 truncate">{a.approverName || a.approverEmail || '—'}</span>
                  </div>
                  <ApproverStatusIcon status={a.status as ApprovalStatus} />
                </div>
              ))}
            </div>
          </PanelSection>

          {/* Comments */}
          <PanelSection title="Comments">
            <div className="p-3 space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#EEF3F8] flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-[#1A438A]">{c.author[0]}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-[#17293E]">{c.author}</p>
                    <p className="text-[11px] text-slate-600">{c.text}</p>
                  </div>
                  <span className="text-[9px] text-slate-400">{c.time}</span>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input value={comment} onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && postComment()}
                  placeholder="Post your comment here"
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:border-[#1A438A]" />
                <button onClick={postComment} className="w-7 h-7 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: '#1A438A' }}>
                  <Send className="w-3 h-3" />
                </button>
              </div>
            </div>
          </PanelSection>

          {/* Action buttons */}
          {!actionDone && !hasActed && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => handleAction('CANCELLED')} disabled={actionLoading}
                  className="py-2.5 rounded-xl font-bold text-white text-xs bg-red-500 hover:bg-red-600 transition-colors active:scale-95 disabled:opacity-60">
                  Cancel
                </button>
                <button onClick={() => handleAction('SENT_BACK')} disabled={actionLoading}
                  className="py-2.5 rounded-xl font-bold text-white text-xs bg-orange-500 hover:bg-orange-600 transition-colors active:scale-95 disabled:opacity-60">
                  Send Back
                </button>
                <button onClick={() => handleAction('APPROVED')} disabled={actionLoading}
                  className="py-2.5 rounded-xl font-bold text-white text-xs bg-emerald-500 hover:bg-emerald-600 transition-colors active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1">
                  {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Approve'}
                </button>
              </div>
            </div>
          )}
          {(actionDone || hasActed) && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <p className="text-xs font-bold text-green-700">Action recorded</p>
              <p className="text-[10px] text-green-600 mt-0.5">Your response: {myApprovalRecord?.status || 'APPROVED'}</p>
            </div>
          )}
        </div>
      </div>

      {showLog && <ViewLogModal log={log} onClose={() => setShowLog(false)} />}
      {/* ── Sign Out Modal ── */}
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

export default function Form7ApprovalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"><Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" /></div>}>
      <Form7ApprovalContent />
    </Suspense>
  );
}