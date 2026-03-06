'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import {
  X, Home, Lightbulb, Search, Settings, User, ArrowLeft, CheckCircle2, FileText, Clock, XCircle,
  RotateCcw, ChevronDown, Send, Eye, Paperclip,
  AlertCircle, Loader2,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────
type LegalGMStage = 'INITIAL_REVIEW' | 'FINAL_APPROVAL';
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'SENT_BACK' | 'CANCELLED';

type LogEntry = { id: number; actor: string; role: string; action: string; comment?: string; timestamp: string };
type CommentEntry = { id: number; author: string; role: string; text: string; time: string };
type ApproverRecord = { id: string; role: string; approverName: string; approverEmail: string; status: ApprovalStatus };

type Submission = {
  id: string; submissionNo: string; status: string; legalGmStage?: string; loStage?: string;
  companyCode: string; title: string; sapCostCenter: string;
  f7AgreementRefNo?: string; f7AgreementDate?: string; f7InitiatorContact?: string;
  f7AssessmentAddress?: string; f7OwnerNames?: string; f7EffectiveTerminationDate?: string;
  f7EarlyTerminationCharges?: string; f7RefundableDeposit?: string; f7PaymentDate1?: string;
  f7AdvanceRentals?: string; f7PaymentDate2?: string; f7Deductions?: string;
  f7FacilityPayments?: string; f7Penalty?: string; f7AmountDueByDimo?: string;
  f7BalanceToRecover?: string; f7DateInformedToLessee?: string; remarks?: string;
  assignedLegalOfficer?: string; legalOfficerName?: string; initiatorName?: string;
  approvals: ApproverRecord[];
  documents: { id: string; label: string; type: string; status: string; fileUrl?: string | null }[];
  comments?: any[];
};

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

function ApproverRow({ label, name, email, status }: { label: string; name: string; email: string; status: ApprovalStatus }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-1">
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-[10px] font-bold text-slate-600">{label}</span>
        <span className="text-[11px] text-slate-500 truncate">{name || email || '—'}</span>
      </div>
      {status === 'APPROVED' && <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center ml-2"><CheckCircle2 className="w-3 h-3 text-white" /></span>}
      {status === 'CANCELLED' && <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center ml-2"><XCircle className="w-3 h-3 text-white" /></span>}
      {status === 'SENT_BACK' && <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center ml-2"><RotateCcw className="w-3 h-3 text-white" /></span>}
      {status === 'PENDING' && <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center ml-2"><Clock className="w-3 h-3 text-white" /></span>}
    </div>
  );
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
          {log.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No log entries yet.</p>}
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

function ReassignModal({ currentOfficer, officers, onSave, onClose }: {
  currentOfficer: string; officers: { name: string; email: string }[];
  onSave: (name: string, email: string) => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [step, setStep] = useState<'select' | 'success'>('select');
  const officer = officers.find((o) => o.name === selected || o.email === selected);

  if (step === 'success') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-10 h-10 text-blue-500" />
        </div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Job has been Reassigned!</h2>
        <p className="text-slate-500 text-sm mb-6">The request has been reassigned to <span className="font-bold text-[#1A438A]">{selected}</span>.</p>
        <button onClick={() => { onSave(officer!.name, officer!.email); onClose(); }}
          className="w-full py-3 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>OK</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
          <span className="text-white font-bold">Reassign Legal Officer</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Current Officer</label>
            <div className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600">{currentOfficer || '—'}</div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">New Legal Officer</label>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-[#1A438A]">
              <option value="">Select officer…</option>
              {officers.map((o) => <option key={o.email} value={o.name}>{o.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors text-sm">Cancel</button>
            <button disabled={!selected} onClick={() => setStep('success')}
              className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
function Form7LegalGMContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [showSignOut, setShowSignOut] = useState(false);
  const searchParams = useSearchParams();
  const stageParam = searchParams.get('stage') as LegalGMStage | null;
  const submissionId = searchParams.get('id');

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [legalOfficers, setLegalOfficers] = useState<{ name: string; email: string }[]>([]);
  const [selectedOfficer, setSelectedOfficer] = useState('');
  const [showReassign, setShowReassign] = useState(false);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [log] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [actionDone, setActionDone] = useState(false);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/submissions');
      const data = await res.json();
      if (data.success) {
        const form7 = (data.data || []).filter((s: any) => s.formId === 7 &&
          ['PENDING_LEGAL_GM', 'PENDING_LEGAL_GM_FINAL'].includes(s.status)
        );
        setSubmissions(form7);
        if (submissionId) {
          const found = form7.find((s: any) => s.id === submissionId);
          if (found) { setSelected(found); setSelectedOfficer(found.legalOfficerName || found.assignedLegalOfficer || ''); }
        }
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [submissionId]);

  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((data) => {
        setLegalOfficers((data.data || []).filter((u: any) => u.role === 'LEGAL_OFFICER').map((u: any) => ({ name: u.name, email: u.email })));
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selected?.comments?.length) {
      setComments(selected.comments.map((c: any, i: number) => ({
        id: i, author: c.authorName, role: c.authorRole, text: c.text,
        time: new Date(c.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      })));
    }
  }, [selected]);

  const isFinalStage = selected?.status === 'PENDING_LEGAL_GM_FINAL' || stageParam === 'FINAL_APPROVAL';
  const activeStep = isFinalStage ? 4 : 2;
  const gmAlreadyActed = !!selected && !['PENDING_LEGAL_GM', 'PENDING_LEGAL_GM_FINAL'].includes(selected.status);

  const handleAction = async (action: 'APPROVED' | 'SENT_BACK' | 'CANCELLED') => {
    if (!selected || actionLoading) return;
    setActionLoading(true);
    try {
      const officerObj = legalOfficers.find((o) => o.name === selectedOfficer || o.email === selectedOfficer);
      await fetch(`/api/submissions/${selected.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'LEGAL_GM',
          action,
          comment,
          approverName: session?.user?.name,
          approverEmail: session?.user?.email,
          assignedOfficer: officerObj?.email || selectedOfficer,
          // No specialApprovers for Form 7
        }),
      });
      if (comment.trim()) {
        await fetch(`/api/submissions/${selected.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: comment, authorName: session?.user?.name, authorRole: 'LEGAL_GM' }),
        });
      }
      setActionDone(true);
      await loadSubmissions();
    } catch { /* silent */ }
    setActionLoading(false);
  };

  const handleReassign = async (newName: string, newEmail: string) => {
    if (!selected) return;
    await fetch(`/api/submissions/${selected.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'LEGAL_GM', action: 'REASSIGN',
        assignedOfficer: newEmail,
        approverName: session?.user?.name, approverEmail: session?.user?.email,
      }),
    });
    setSelectedOfficer(newName);
    await loadSubmissions();
  };

  const postComment = async () => {
    if (!comment.trim() || !selected) return;
    await fetch(`/api/submissions/${selected.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: comment, authorName: session?.user?.name, authorRole: 'LEGAL_GM' }),
    });
    setComments((p) => [...p, { id: Date.now(), author: session?.user?.name || '', role: 'LEGAL_GM', text: comment, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }]);
    setComment('');
  };

  if (status === 'loading' || loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"><Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" /></div>;
  }

  // List view
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
            <SidebarIcon icon={<Home className="w-[18px] h-[18px]" />} onClick={() => router.push(ROUTES.LEGAL_GM_HOME)} />
            <SidebarIcon icon={<FileText className="w-[18px] h-[18px]" />} active />
          </nav>
          <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
            <SidebarIcon icon={<Settings className="w-[18px] h-[18px]" />} />
            <SidebarIcon icon={<User className="w-[18px] h-[18px]" />} onClick={() => setShowSignOut(true)} />
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => router.push(ROUTES.LEGAL_GM_HOME)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50">
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
              <h1 className="text-lg font-black text-[#17293E]">Form 7 — Legal GM Review</h1>
            </div>
            <div className="space-y-3">
              {submissions.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                  <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No pending Form 7 submissions</p>
                </div>
              )}
              {submissions.map((s) => (
                <button key={s.id} onClick={() => { setSelected(s); setSelectedOfficer(s.legalOfficerName || s.assignedLegalOfficer || ''); setActionDone(false); }}
                  className="w-full text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:border-[#1A438A]/30 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#17293E]">{s.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{s.submissionNo} · Ref: {s.f7AgreementRefNo || 'N/A'}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Owner: {s.f7OwnerNames || '—'}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.status === 'PENDING_LEGAL_GM_FINAL' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {s.status === 'PENDING_LEGAL_GM_FINAL' ? 'Final Approval' : 'Initial Review'}
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
          <SidebarIcon icon={<Home className="w-[18px] h-[18px]" />} onClick={() => router.push(ROUTES.LEGAL_GM_HOME)} />
          <SidebarIcon icon={<FileText className="w-[18px] h-[18px]" />} active />
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <SidebarIcon icon={<Settings className="w-[18px] h-[18px]" />} />
          <SidebarIcon icon={<User className="w-[18px] h-[18px]" />} onClick={() => setShowSignOut(true)} />
        </div>
      </div>

      <div className="flex-1 flex gap-4 p-4 overflow-auto">
        {/* Left: Form */}
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
                <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border backdrop-blur-sm ${isFinalStage ? 'bg-purple-500/20 text-purple-200 border-purple-400/30' : 'bg-blue-500/20 text-blue-200 border-blue-400/30'}`}>
                  {isFinalStage ? 'Final Approval' : 'Initial Review'}
                </span>
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
              <ReadField label="Balance to be Recovered" value={selected.f7BalanceToRecover || '—'} />
              <ReadField label="Date Informed to Lessee" value={selected.f7DateInformedToLessee || '—'} />
            </div>
            <ReadField label="Remarks" value={selected.remarks || '—'} />
          </div>

          {/* Bottom action row */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-500 font-semibold">Assigned Legal Officer</span>
              <span className="text-[11px] font-bold text-[#1A438A]">{selectedOfficer || '(not assigned)'}</span>
            </div>
            {!isFinalStage && (
              <button onClick={() => setShowReassign(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors"
                style={{ background: 'linear-gradient(135deg, #4686B7, #3a6e9e)' }}>
                Reassign
              </button>
            )}
            {!actionDone && (
              <div className="flex gap-2 ml-auto">
                <button onClick={() => handleAction('CANCELLED')} disabled={actionLoading || gmAlreadyActed}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-60">
                  Cancel Request
                </button>
                <button onClick={() => handleAction('SENT_BACK')} disabled={actionLoading || gmAlreadyActed}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors disabled:opacity-60">
                  Send Back
                </button>
                <button onClick={() => handleAction('APPROVED')} disabled={actionLoading || gmAlreadyActed || (!isFinalStage && !selectedOfficer)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors disabled:opacity-60 flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                  {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : isFinalStage ? 'Approve' : 'OK to Proceed'}
                </button>
              </div>
            )}
            {actionDone && (
              <div className="flex items-center gap-2 text-green-600 text-sm font-bold ml-auto">
                <CheckCircle2 className="w-4 h-4" /> Action recorded
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          {/* Submission No + Stepper */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
              <button onClick={() => setShowLog(true)} className="text-white/70 text-[10px] font-bold uppercase tracking-wider hover:text-white">View Log</button>
              <span className="text-white font-black text-base">{selected.submissionNo}</span>
            </div>
            <div className="px-4 py-4">
              <WorkflowStepper steps={WORKFLOW_STEPS} activeStep={activeStep} />
            </div>
          </div>

          {/* Required Documents */}
          <PanelSection title="Required Documents" action={
            <button className="px-3 py-1 rounded-lg text-[10px] font-bold text-white" style={{ background: '#AC9C2F' }}>
              Request More Documents
            </button>
          }>
            <div className="p-3 space-y-2">
              {selected.documents.filter((d) => d.type === 'required').map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl">
                  <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-[11px] text-slate-600 flex-1 truncate">{doc.label}</span>
                  {doc.fileUrl && (
                    <button onClick={() => window.open(doc.fileUrl!, '_blank')} className="w-6 h-6 rounded-lg bg-[#EEF3F8] flex items-center justify-center">
                      <Eye className="w-3 h-3 text-[#1A438A]" />
                    </button>
                  )}
                </div>
              ))}
              {selected.documents.filter((d) => d.type === 'required').length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-2">No documents uploaded</p>
              )}
            </div>
          </PanelSection>

          {/* Documents Prepared by Legal Dept */}
          <PanelSection title="Documents Prepared by Legal Department">
            <div className="p-3 space-y-2">
              {selected.documents.filter((d) => d.type === 'legal').map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl">
                  <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-[11px] text-slate-600 flex-1 truncate">{doc.label}</span>
                  {doc.fileUrl && (
                    <button onClick={() => window.open(doc.fileUrl!, '_blank')} className="w-6 h-6 rounded-lg bg-[#EEF3F8] flex items-center justify-center">
                      <Eye className="w-3 h-3 text-[#1A438A]" />
                    </button>
                  )}
                </div>
              ))}
              {selected.documents.filter((d) => d.type === 'legal').length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-2">No documents yet</p>
              )}
            </div>
          </PanelSection>

          {/* Approvals — first level (BUM + GM) */}
          <PanelSection title="Approvals">
            <div className="p-3 space-y-1">
              {selected.approvals.map((a) => (
                <ApproverRow key={a.id} label={a.role === 'GENERAL_MANAGER' ? 'General Manager' : a.role}
                  name={a.approverName} email={a.approverEmail} status={a.status} />
              ))}
              {selected.approvals.length === 0 && <p className="text-[11px] text-slate-400 text-center py-2">No approvals</p>}
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
        </div>
      </div>

      {showLog && <ViewLogModal log={log} onClose={() => setShowLog(false)} />}
      {showReassign && (
        <ReassignModal
          currentOfficer={selectedOfficer}
          officers={legalOfficers}
          onSave={handleReassign}
          onClose={() => setShowReassign(false)}
        />
      )}
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

export default function Form7LegalGMPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"><Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" /></div>}>
      <Form7LegalGMContent />
    </Suspense>
  );
}