'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import {
  X, LogOut, Home, Lightbulb, Search, Settings, User,
  ArrowLeft, CheckCircle2, FileText, Clock, XCircle,
  RotateCcw, Send, Paperclip, AlertCircle, Loader2, ChevronDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'SENT_BACK' | 'CANCELLED';
type LegalGMStage = 'INITIAL_REVIEW' | 'FINAL_APPROVAL';

type ApproverRecord = {
  id: string; role: string; approverName: string; approverEmail: string;
  status: ApprovalStatus; comment?: string | null; actionDate?: string | null;
};

type Submission = {
  id: string; submissionNo: string; status: string;
  companyCode: string; title: string; sapCostCenter: string;
  scopeOfAgreement: string; term: string; value: string;
  remarks?: string; initiatorComments?: string;
  assignedLegalOfficer?: string; legalOfficerName?: string;
  legalGmStage?: string; loStage?: string;
  parties: { type: string; name: string }[];
  approvals: ApproverRecord[];
  documents: { id: string; label: string; type: string; status: string; fileUrl?: string | null }[];
  comments: { id: string; authorName: string; authorRole: string; text: string; createdAt: string }[];
};

type LogEntry = { id: number; actor: string; role: string; action: string; comment?: string; timestamp: string; };
type CommentEntry = { id: number; author: string; role: string; text: string; time: string; };

const ROLE_LABEL: Record<string, string> = { BUM: 'BUM', FBP: 'FBP', LEGAL_GM: 'Legal GM', LEGAL_OFFICER: 'Legal Officer', COURT_OFFICER: 'Court Officer' };

const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' }, { label: 'Approvals' }, { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' }, { label: 'Legal GM\nApproval' }, { label: 'Ready to\nCollect' },
];

function fmtDate(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ReadField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      <div className={`w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 ${multiline ? 'whitespace-pre-wrap leading-relaxed' : ''}`}>
        {value || <span className="text-slate-400 italic">—</span>}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg px-4 py-2.5 mb-3" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
      <span className="text-white text-sm font-bold">{children}</span>
    </div>
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

// ─── View Log Modal ───────────────────────────────────────────────────────────
function ViewLogModal({ log, onClose }: { log: LogEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <span className="text-white font-bold text-base">View Log</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {log.map((entry, i) => (
            <div key={entry.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-[#EEF3F8] border-2 border-[#1A438A]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-[#1A438A]">{i + 1}</span>
                </div>
                {i < log.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-bold text-[#17293E]">{entry.actor}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{entry.timestamp}</span>
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

// ─── Reassign Modal ───────────────────────────────────────────────────────────
function ReassignModal({ currentOfficer, officers, onSave, onClose }: {
  currentOfficer: string;
  officers: { id?: string; name: string; email: string }[];
  onSave: (name: string, email: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [step, setStep] = useState<'select' | 'success'>('select');
  const officer = officers.find(o => o.name === selected);

  if (step === 'success') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center mb-5"><CheckCircle2 className="w-10 h-10 text-blue-500" /></div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Legal Officer Assigned!</h2>
        <p className="text-slate-500 text-sm mb-6">The request has been assigned to <span className="font-bold text-[#1A438A]">{selected}</span>.</p>
        <button onClick={() => { onSave(officer!.name, officer!.email); onClose(); }}
          className="w-full py-3 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>OK</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <span className="text-white font-bold">Select Legal Officer</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Select Legal Officer</label>
            <div className="relative">
              <select value={selected} onChange={e => setSelected(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white text-slate-700 focus:outline-none focus:border-[#1A438A] appearance-none pr-8">
                <option value="">Choose an officer...</option>
                {officers.filter(o => o.name !== currentOfficer).map(o => (
                  <option key={o.email} value={o.name}>{o.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {selected && (
            <div className="bg-[#EEF3F8] rounded-lg px-3.5 py-2.5">
              <p className="text-[11px] text-slate-500">Email</p>
              <p className="text-sm font-semibold text-[#1A438A]">{officers.find(o => o.name === selected)?.email}</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
          <button disabled={!selected} onClick={() => setStep('success')}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, confirmColor, onConfirm, onClose, requireComment = false, loading = false }: {
  title: string; message: string; confirmLabel: string; confirmColor: string;
  onConfirm: (comment: string) => void; onClose: () => void; requireComment?: boolean; loading?: boolean;
}) {
  const [comment, setComment] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5">
          <h3 className="text-[#17293E] font-bold text-base text-center mb-1">{title}</h3>
          <p className="text-slate-500 text-xs text-center mb-4 leading-relaxed">{message}</p>
          {requireComment && (
            <div className="mb-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Comment <span className="text-red-400">*</span></label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Please provide a reason..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A]" />
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} disabled={loading} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button disabled={(requireComment && !comment.trim()) || loading} onClick={() => onConfirm(comment)}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: confirmColor }}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Success Modal ────────────────────────────────────────────────────────────
function SuccessModal({ title, message, submissionNo, onClose }: { title: string; message: string; submissionNo: string; onClose: () => void }) {
  const isApprove = title.toLowerCase().includes('approv') || title.toLowerCase().includes('proceed');
  const isCancel = title.toLowerCase().includes('reject') || title.toLowerCase().includes('cancel');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-5 shadow-lg ${isApprove ? 'bg-emerald-100 shadow-emerald-500/20' : isCancel ? 'bg-red-100 shadow-red-500/20' : 'bg-orange-100 shadow-orange-500/20'}`}>
          {isApprove && <CheckCircle2 className="w-10 h-10 text-emerald-500" />}
          {isCancel && <XCircle className="w-10 h-10 text-red-500" />}
          {!isApprove && !isCancel && <RotateCcw className="w-10 h-10 text-orange-500" />}
        </div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">{title}</h2>
        <p className="text-slate-500 text-sm mb-1 leading-relaxed">{message}</p>
        <p className="text-[#1A438A] font-bold text-sm font-mono mb-6">Submission ID : #{submissionNo.split('_').pop()}</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>OK</button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function LegalGMForm3PageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  if (status === 'loading') return null;
  if (status === 'authenticated' && !['LEGAL_GM'].includes(session?.user?.role as string)) {
    router.replace('/');
    return null;
  }
  const submissionId = searchParams.get('id');
  const [showSignOut, setShowSignOut] = useState(false);

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [apiError, setApiError] = useState('');
  const [assignedOfficer, setAssignedOfficer] = useState({ name: '', email: '' });
  const [legalOfficers, setLegalOfficers] = useState<{ id?: string; name: string; email: string }[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [showConfirmAction, setShowConfirmAction] = useState<'approve' | 'sendback' | 'cancel' | null>(null);
  const [showSuccess, setShowSuccess] = useState<'approve' | 'sendback' | 'cancel' | null>(null);

  const loadSubmission = useCallback(async () => {
    if (!submissionId) { setLoadError('No submission ID in URL.'); setIsLoading(false); return; }
    try {
      const res = await fetch(`/api/submissions/${submissionId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load');
      const s = data.data;
      setSubmission(s);
      setAssignedOfficer({ name: s.legalOfficerName || s.assignedLegalOfficer || '', email: '' });
      const seedLog: LogEntry[] = [
        { id: 0, actor: 'System', role: 'System', action: 'Submission created', timestamp: fmtDate(s.createdAt) },
        ...s.approvals.filter((a: ApproverRecord) => a.actionDate).map((a: ApproverRecord, i: number) => ({
          id: i + 1, actor: a.approverName || a.role, role: ROLE_LABEL[a.role] ?? a.role,
          action: a.status === 'APPROVED' ? 'Approved' : a.status === 'SENT_BACK' ? 'Sent Back' : 'Cancelled',
          comment: a.comment ?? undefined, timestamp: fmtDate(a.actionDate),
        })),
      ];
      setLog(seedLog);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setIsLoading(false); }
  }, [submissionId]);

  useEffect(() => { loadSubmission(); }, [loadSubmission]);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(d => { if (d.success) setLegalOfficers(d.data.filter((u: any) => u.role === 'LEGAL_OFFICER' && u.isActive).map((u: any) => ({ id: u.id, name: u.name || u.email, email: u.email }))); })
      .catch(() => {});
  }, []);

  const callApproveAPI = async (action: 'APPROVED' | 'SENT_BACK' | 'CANCELLED', comment?: string) => {
    if (!submissionId) return;
    setIsActing(true); setApiError('');
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'LEGAL_GM', action, comment: comment || null,
          approverName: session?.user?.name || '',
          approverEmail: session?.user?.email || '',
          assignedOfficer: assignedOfficer.email || assignedOfficer.name,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Action failed');
      setSubmission(data.data);
      setLog(prev => [...prev, {
        id: Date.now(), actor: session?.user?.name || 'Legal GM', role: 'Legal GM',
        action: action === 'APPROVED'
          ? (stage === 'FINAL_APPROVAL' ? 'Final Approved — sent to Court Officer' : 'OK to Proceed — sent to Legal Officer')
          : action === 'SENT_BACK' ? 'Sent Back to Initiator' : 'Cancelled',
        comment, timestamp: new Date().toLocaleString('en-GB'),
      }]);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Action failed.');
      throw err;
    } finally { setIsActing(false); }
  };

  const handleAction = async (type: 'approve' | 'sendback' | 'cancel', comment: string) => {
    const actionMap = { approve: 'APPROVED', sendback: 'SENT_BACK', cancel: 'CANCELLED' } as const;
    try { await callApproveAPI(actionMap[type], comment); setShowConfirmAction(null); setShowSuccess(type); }
    catch { /* error set inside */ }
  };

  const handlePostComment = () => {
    if (!commentInput.trim()) return;
    setComments(prev => [...prev, { id: Date.now(), author: session?.user?.name || 'Legal GM', role: 'Legal GM', text: commentInput.trim(), time: 'Just now' }]);
    if (submissionId) fetch(`/api/submissions/${submissionId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorName: session?.user?.name || 'Legal GM', authorRole: 'LEGAL_GM', text: commentInput.trim() }) });
    setCommentInput('');
  };

  // ── Derived ──
  const stage: LegalGMStage = (submission?.status === 'PENDING_LEGAL_GM_FINAL' || submission?.legalGmStage === 'FINAL_APPROVAL') ? 'FINAL_APPROVAL' : 'INITIAL_REVIEW';
  const isInitial = stage === 'INITIAL_REVIEW';

  const statusToStep: Record<string, number> = {
    PENDING_APPROVAL: 1, PENDING_LEGAL_GM: 2,
    PENDING_LEGAL_OFFICER: 3, PENDING_COURT_OFFICER: 3,
    PENDING_LEGAL_GM_FINAL: 4, COMPLETED: 5, SENT_BACK: 1, CANCELLED: 1,
  };
  const activeStep = statusToStep[submission?.status ?? ''] ?? 2;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let meta: Record<string, any> = {};
  if (submission?.scopeOfAgreement) { try { meta = JSON.parse(submission.scopeOfAgreement); } catch {} }

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"><Loader2 className="w-10 h-10 text-[#1A438A] animate-spin" /></div>;
  if (loadError || !submission) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]">
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 max-w-sm w-full text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
        <h3 className="font-bold text-base mb-2">Could not load submission</h3>
        <p className="text-slate-500 text-sm mb-4">{loadError}</p>
        <button onClick={() => router.push(ROUTES.LEGAL_GM_HOME)} className="w-full py-2.5 rounded-xl font-bold text-white text-sm" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Return to Home</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* ── Sidebar ── */}
      <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen" style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
        <div className="relative mb-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">
            {(session?.user?.name || 'G').charAt(0)}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]" />
        </div>
        <div className="text-center">
          <p className="text-white text-[10px] font-semibold">{(session?.user?.name || '').split(' ')[0]}</p>
          <p className="text-white/40 text-[9px]">GM Legal</p>
        </div>
        <div className="w-8 h-px bg-white/10" />
        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          <NotificationBell />
          <button onClick={() => router.push(ROUTES.LEGAL_GM_HOME)} className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Home className="w-[18px] h-[18px]" /></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Lightbulb className="w-[18px] h-[18px]" /></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Search className="w-[18px] h-[18px]" /></button>
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><Settings className="w-[18px] h-[18px]" /></button>
          <button onClick={() => setShowSignOut(true)} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><User className="w-[18px] h-[18px]" /></button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex gap-5 p-5 overflow-auto min-w-0">

        {/* ── Left ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Header */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><FileText className="w-5 h-5 text-white" /></div>
                <div>
                  <h1 className="text-white font-bold text-base">Instruction For Litigation</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono">16/FM/1641/07/03</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold px-3 py-1 rounded-full border bg-purple-500/20 text-purple-200 border-purple-400/30">
                  Legal GM {isInitial ? 'Review' : 'Final Approval'}
                </span>
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl">Form 3</div>
              </div>
            </div>
          </div>

          {apiError && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">{apiError}</p>
              <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Form Body */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Submission Details</span>
            </div>
            <div className="px-6 py-6 space-y-5">
              <ReadField label="Letter of Demand Sent Date" value={meta.demandDate || submission.term || ''} />

              <div>
                <SectionHeader>Initiator&apos;s Information</SectionHeader>
                <div className="grid grid-cols-2 gap-4">
                  <ReadField label="Name" value={meta.initiatorName || ''} />
                  <ReadField label="Contact No" value={meta.initiatorContact || ''} />
                </div>
              </div>

              <div>
                <SectionHeader>Department&apos;s Details of the Creditor / Initiator</SectionHeader>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <ReadField label="Manager in Charge" value={meta.managerInCharge || ''} />
                  <ReadField label="Officer in Charge" value={meta.officerInCharge || ''} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <ReadField label="Company Code" value={submission.companyCode || ''} />
                  <ReadField label="SAP Cost Center No" value={submission.sapCostCenter || ''} />
                  <ReadField label="Cluster No" value={meta.clusterNo || ''} />
                </div>
              </div>

              <div>
                <SectionHeader>Representative Details (for Court Representation)</SectionHeader>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <ReadField label="Name" value={meta.repName || ''} />
                  <ReadField label="Designation" value={meta.repDesignation || ''} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <ReadField label="NIC" value={meta.repNic || ''} />
                  <ReadField label="Contact No" value={meta.repContact || ''} />
                  <ReadField label="Email Address" value={meta.repEmail || ''} />
                </div>
              </div>

              <div>
                <SectionHeader>Customer&apos;s Personal and Business Information</SectionHeader>
                <div className="mb-3"><ReadField label="Type of Customer" value={meta.customerType || ''} /></div>
                {meta.customerType === 'Individual' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Name" value={meta.customerData?.customerName || ''} /><ReadField label="SAP BP Code" value={meta.customerData?.sapBpCode || ''} /></div>
                    <ReadField label="NIC No" value={meta.customerData?.nicNo || ''} />
                    <ReadField label="Residential Address" value={meta.customerData?.residentialAddress || ''} />
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Contact No" value={meta.customerData?.contactNo || ''} /><ReadField label="Email Address" value={meta.customerData?.emailAddress || ''} /></div>
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Outstanding Amount Rs." value={meta.customerData?.outstandingAmount || ''} /><ReadField label="Vehicle No" value={meta.customerData?.vehicleNo || ''} /></div>
                  </div>
                )}
              </div>

              {meta.legalHistory?.length > 0 && (
                <div>
                  <SectionHeader>Legal Actions History</SectionHeader>
                  {meta.legalHistory.map((h: { caseNo: string; court: string; outstandingAmount: string; statusOfCase: string; remarks?: string }, i: number) => (
                    <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3"><ReadField label="Case No" value={h.caseNo || ''} /><ReadField label="Court" value={h.court || ''} /></div>
                      <div className="grid grid-cols-2 gap-3"><ReadField label="Outstanding Amount" value={h.outstandingAmount || ''} /><ReadField label="Status of Case/s" value={h.statusOfCase || ''} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-[296px] flex-shrink-0 flex flex-col gap-4">

          {/* Workflow */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-5">
              <button onClick={() => setShowLog(true)} className="text-[11px] font-semibold text-[#1A438A] hover:underline">View Log</button>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Submission No.</p>
                <p className="text-[#1A438A] font-bold text-sm font-mono">{submission.submissionNo}</p>
              </div>
            </div>
            <div className="relative flex justify-between items-start">
              <div className="absolute top-[9px] left-[9px] right-[9px] h-px bg-slate-200" />
              {WORKFLOW_STEPS.map((step, i) => {
                const isActive = i <= activeStep;
                const dotColor = isActive ? '#1A438A' : '#cbd5e1';
                return (
                  <div key={i} className="relative flex flex-col items-center z-10" style={{ width: `${100 / WORKFLOW_STEPS.length}%` }}>
                    <div className="w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shadow-sm"
                      style={{ background: isActive ? dotColor : 'white', borderColor: isActive ? dotColor : '#cbd5e1', boxShadow: i === activeStep ? `0 0 0 4px ${dotColor}25` : undefined }}>
                      {i < activeStep && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                      {i === activeStep && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <p className="text-[9px] text-center leading-tight whitespace-pre-line mt-1.5 text-slate-500 font-medium px-0.5">{step.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Required Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
            </div>
            <div className="p-3 space-y-1.5">
              {submission.documents.filter(d => !d.type?.startsWith('LO_PREPARED')).map((doc, i) => (
                <div key={doc.id} onClick={() => doc.fileUrl && window.open(doc.fileUrl, '_blank')}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all ${doc.fileUrl ? 'bg-emerald-50 border-emerald-200 cursor-pointer hover:bg-emerald-100' : 'bg-slate-50 border-slate-100 cursor-default'}`}>
                  <span className="text-[11px] text-slate-600 flex-1 mr-2"><span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{doc.label}</span>
                  {doc.fileUrl ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <Paperclip className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100">
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                <span className="text-white text-xs font-semibold">Documents Prepared by Legal Dept.</span>
              </div>
              <div className="p-3">
                {submission.documents.filter(d => d.type?.startsWith('LO_PREPARED')).length === 0
                  ? <p className="text-[11px] text-slate-400 italic">Not applicable at this stage</p>
                  : submission.documents.filter(d => d.type?.startsWith('LO_PREPARED')).map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-[#EEF3F8] border border-[#1A438A]/20 mb-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#1A438A]" />
                      <span className="text-[11px] font-semibold text-[#1A438A] flex-1 truncate">{doc.label}</span>
                      {doc.fileUrl && <button onClick={() => window.open(doc.fileUrl!, '_blank')} className="w-5 h-5 flex items-center justify-center rounded text-[#1A438A] hover:bg-[#1A438A]/20"><FileText className="w-3.5 h-3.5" /></button>}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Approvals */}
          <PanelSection title="Approvals">
            <div className="px-4 py-3 divide-y divide-slate-100">
              {submission.approvals.filter(a => ['BUM', 'FBP'].includes(a.role)).map(a => (
                <div key={a.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-slate-600 w-20 flex-shrink-0">{ROLE_LABEL[a.role] ?? a.role}</span>
                    <span className="text-[11px] text-slate-500 truncate">{a.approverName || a.approverEmail}</span>
                  </div>
                  {a.status === 'APPROVED' && <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 ml-2"><CheckCircle2 className="w-3 h-3 text-white" /></span>}
                  {a.status === 'PENDING' && <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0 ml-2"><Clock className="w-3 h-3 text-white" /></span>}
                  {a.status === 'CANCELLED' && <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 ml-2"><XCircle className="w-3 h-3 text-white" /></span>}
                </div>
              ))}
            </div>
          </PanelSection>

          {/* Comments */}
          <PanelSection title="Comments">
            <div className="p-3">
              {comments.length > 0 && (
                <div className="mb-3 space-y-2 max-h-36 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex justify-between mb-0.5"><span className="text-[11px] font-bold text-[#1A438A]">{c.author}</span><span className="text-[10px] text-slate-400">{c.time}</span></div>
                      <p className="text-[10px] text-[#4686B7] font-semibold mb-1">{c.role}</p>
                      <p className="text-xs text-slate-600 leading-relaxed">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${commentInput ? 'border-[#1A438A] bg-white ring-2 ring-[#1A438A]/10' : 'border-slate-200 bg-slate-50/80'}`}>
                <input type="text" value={commentInput} onChange={e => setCommentInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                  placeholder="Post your comment here"
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />
                <button onClick={handlePostComment} disabled={!commentInput.trim()}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </PanelSection>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => router.push(ROUTES.LEGAL_GM_HOME)} disabled={isActing}
                className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all disabled:opacity-50">
                <ArrowLeft className="w-4 h-4" />Back
              </button>
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 flex-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider">Assigned Legal Officer</p>
                  <p className="text-xs font-bold text-[#17293E] truncate">{assignedOfficer.name || '—'}</p>
                </div>
                <button onClick={() => setShowReassign(true)} disabled={isActing}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg text-white flex-shrink-0 transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
                  {assignedOfficer.name ? 'Reassign' : 'Assign'}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowConfirmAction('cancel')} disabled={isActing}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>Cancel</button>
              <button onClick={() => setShowConfirmAction('sendback')} disabled={isActing}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>Send Back</button>
              <button onClick={() => setShowConfirmAction('approve')} disabled={isActing || (isInitial && !assignedOfficer.name)}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-1"
                style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : isInitial ? 'OK to Proceed' : 'Approve'}
              </button>
            </div>
            {isInitial && !assignedOfficer.name && (
              <p className="text-[11px] text-amber-600 text-center">Please assign a Legal Officer before proceeding.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showLog && <ViewLogModal log={log} onClose={() => setShowLog(false)} />}
      {showReassign && (
        <ReassignModal currentOfficer={assignedOfficer.name} officers={legalOfficers}
          onSave={async (name, email) => {
            setAssignedOfficer({ name, email });
            if (submissionId) {
              await fetch(`/api/submissions/${submissionId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assignedLegalOfficer: legalOfficers.find((o: any) => o.name === name)?.id || email || name }),
              });
            }
          }}
          onClose={() => setShowReassign(false)} />
      )}

      {showConfirmAction === 'approve' && (
        <ConfirmModal
          title={isInitial ? 'OK to Proceed?' : 'Final Approval?'}
          message={isInitial
            ? `The request will be sent to ${assignedOfficer.name} to assign a Court Officer.`
            : 'This will send the request to the Court Officer for final confirmation.'}
          confirmLabel={isInitial ? 'Yes, Proceed' : 'Yes, Approve'}
          confirmColor="linear-gradient(135deg, #22c55e, #16a34a)"
          onConfirm={c => handleAction('approve', c)}
          onClose={() => setShowConfirmAction(null)}
          loading={isActing}
        />
      )}
      {showConfirmAction === 'sendback' && (
        <ConfirmModal title="Send Back the request?" message="The request will be returned to the Initiator for corrections."
          confirmLabel="Yes, Send Back" confirmColor="linear-gradient(135deg, #f97316, #ea580c)"
          requireComment onConfirm={c => handleAction('sendback', c)} onClose={() => setShowConfirmAction(null)} loading={isActing} />
      )}
      {showConfirmAction === 'cancel' && (
        <ConfirmModal title="Reject & Cancel the request?" message="This action is irreversible. The request will be permanently cancelled."
          confirmLabel="Yes, Cancel" confirmColor="linear-gradient(135deg, #ef4444, #dc2626)"
          requireComment onConfirm={c => handleAction('cancel', c)} onClose={() => setShowConfirmAction(null)} loading={isActing} />
      )}

      {showSuccess === 'approve' && <SuccessModal title={isInitial ? 'Approved!' : 'Final Approved!'} message={isInitial ? 'Request has been sent to the Legal Officer.' : 'Request sent to Court Officer for final confirmation.'} submissionNo={submission.submissionNo} onClose={() => { setShowSuccess(null); router.push(ROUTES.LEGAL_GM_HOME); }} />}
      {showSuccess === 'sendback' && <SuccessModal title="Sent Back!" message="Request has been sent back to the Initiator." submissionNo={submission.submissionNo} onClose={() => { setShowSuccess(null); router.push(ROUTES.LEGAL_GM_HOME); }} />}
      {showSuccess === 'cancel' && <SuccessModal title="Rejected!" message="Request has been rejected and cancelled." submissionNo={submission.submissionNo} onClose={() => { setShowSuccess(null); router.push(ROUTES.LEGAL_GM_HOME); }} />}

      {showSignOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSignOut(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-7 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mb-4"><LogOut className="w-7 h-7 text-red-500" /></div>
            <h3 className="text-[#17293E] font-bold text-base mb-1">Sign Out?</h3>
            <p className="text-slate-500 text-sm mb-6">You will be redirected to the login page.</p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setShowSignOut(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => { setShowSignOut(false); router.push('/login'); }} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LegalGMForm3Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <LegalGMForm3PageContent />
    </Suspense>
  );
}