'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import {
  X, Home, Lightbulb, Search, Settings, User,
  ArrowLeft, CheckCircle2, FileText, Clock, XCircle,
  RotateCcw, Send, Paperclip, AlertCircle, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'SENT_BACK' | 'CANCELLED';
type UserRole = 'BUM' | 'FBP' | 'CLUSTER_HEAD';

type ApproverRecord = {
  id: string; role: UserRole; label: string;
  approverName: string; approverEmail: string;
  status: ApprovalStatus; comment?: string | null; actionDate?: string | null;
};

type Submission = {
  id: string; submissionNo: string; status: string;
  scopeOfAgreement: string; isResubmission?: boolean;
  createdAt?: string;
  approvals: ApproverRecord[];
  documents: { id: string; label: string; type: string; status: string; fileUrl?: string | null }[];
};

type LogEntry = { id: number; actor: string; role: string; action: string; comment?: string; timestamp: string };
type CommentEntry = { id: number; author: string; role: string; text: string; time: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<UserRole, string> = { BUM: 'BUM', FBP: 'FBP', CLUSTER_HEAD: 'Cluster Head' };

const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' },
  { label: 'Approvals' },
  { label: 'CEO\nApproval' },
  { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' },
  { label: 'Legal GM\nApproval' },
  { label: 'Ready to\nCollect' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getOverallStatus(approvals: ApproverRecord[]): 'PENDING' | 'APPROVED' | 'REJECTED' {
  const levelApprovals = approvals.filter(a => ['BUM', 'FBP', 'CLUSTER_HEAD'].includes(a.role));
  if (levelApprovals.some(a => a.status === 'CANCELLED' || a.status === 'SENT_BACK')) return 'REJECTED';
  if (levelApprovals.every(a => a.status === 'APPROVED')) return 'APPROVED';
  return 'PENDING';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ApproverStatusIcon({ status }: { status: ApprovalStatus }) {
  if (status === 'APPROVED') return (
    <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
      <CheckCircle2 className="w-3 h-3 text-white" />
    </span>
  );
  if (status === 'CANCELLED') return (
    <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
      <XCircle className="w-3 h-3 text-white" />
    </span>
  );
  if (status === 'SENT_BACK') return (
    <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
      <RotateCcw className="w-3 h-3 text-white" />
    </span>
  );
  return (
    <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0">
      <Clock className="w-3 h-3 text-white" />
    </span>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      <div className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">
        {value || <span className="text-slate-400 italic">—</span>}
      </div>
    </div>
  );
}

function ViewLogModal({ log, onClose }: { log: LogEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <span className="text-white font-bold text-base">Workflow Log</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {log.map((entry, i) => (
            <div key={entry.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#EEF3F8] border-2 border-[#1A438A]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-[#1A438A]">{i + 1}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-bold text-[#17293E]">{entry.actor}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{entry.timestamp}</span>
                </div>
                <span className="text-[11px] text-[#4686B7] font-semibold">{entry.role}</span>
                <p className="text-sm text-slate-600 mt-0.5">{entry.action}</p>
                {entry.comment && (
                  <p className="text-xs text-slate-500 italic mt-1 bg-slate-50 rounded-lg px-2 py-1">&ldquo;{entry.comment}&rdquo;</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SendBackModal({ onConfirm, onClose, loading }: {
  onConfirm: (comment: string) => void; onClose: () => void; loading: boolean;
}) {
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-orange-100 flex items-center justify-center mb-5">
          <RotateCcw className="w-10 h-10 text-orange-500" />
        </div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Sent Back!</h2>
        <p className="text-slate-500 text-sm mb-6">The request has been returned to the initiator for revision.</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>OK</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5">
          <h3 className="text-[#17293E] font-bold text-base text-center mb-1">Send back this request?</h3>
          <p className="text-slate-500 text-xs text-center mb-4 leading-relaxed">
            This will reset all approvals and return the request to the initiator.
          </p>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Reason <span className="text-red-400">*</span>
          </label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
            placeholder="Please provide a reason..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10" />
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
            Cancel
          </button>
          <button disabled={!comment.trim() || loading}
            onClick={() => { onConfirm(comment); setDone(true); }}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : 'Send Back'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelModal({ onConfirm, onClose, loading }: {
  onConfirm: (comment: string) => void; onClose: () => void; loading: boolean;
}) {
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-red-100 flex items-center justify-center mb-5">
          <XCircle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Cancelled!</h2>
        <p className="text-slate-500 text-sm mb-6">The request has been permanently cancelled.</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>OK</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5">
          <h3 className="text-[#17293E] font-bold text-base text-center mb-1">Cancel this request?</h3>
          <p className="text-slate-500 text-xs text-center mb-4 leading-relaxed">
            This action is <span className="font-bold text-red-500">irreversible</span>.
          </p>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Reason <span className="text-red-400">*</span>
          </label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
            placeholder="Please provide a reason..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10" />
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
            Cancel
          </button>
          <button disabled={!comment.trim() || loading}
            onClick={() => { onConfirm(comment); setDone(true); }}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : 'Yes, Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function Form2ApprovalPageContent() {
  const { data: session, status } = useSession();
  const currentUserRole = (session?.user?.role as UserRole) ?? 'BUM';
  const currentUserName = session?.user?.name ?? '';
  const currentUserEmail = session?.user?.email ?? '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('id');

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [apiError, setApiError] = useState('');
  const [showSignOut, setShowSignOut] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showSendBackModal, setShowSendBackModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // ── Load submission ──
  const loadSubmission = useCallback(async () => {
    if (!submissionId) { setLoadError('No submission ID provided.'); setIsLoading(false); return; }
    try {
      const res = await fetch(`/api/submissions/${submissionId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load submission');
      const s = data.data;
      setSubmission({
        ...s,
        approvals: s.approvals.map((a: ApproverRecord) => ({
          ...a,
          label: ROLE_LABEL[a.role as UserRole] ?? a.role,
        })),
      });
      setLog([
        { id: 0, actor: 'System', role: 'System', action: 'Submission created', timestamp: fmtDate(s.createdAt) },
        ...s.approvals
          .filter((a: ApproverRecord) => a.actionDate)
          .map((a: ApproverRecord, i: number) => ({
            id: i + 1,
            actor: a.approverName || a.role,
            role: ROLE_LABEL[a.role as UserRole] ?? a.role,
            action: a.status === 'APPROVED' ? 'Approved' : a.status === 'SENT_BACK' ? 'Sent Back' : 'Cancelled',
            comment: a.comment ?? undefined,
            timestamp: fmtDate(a.actionDate),
          })),
      ]);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [submissionId]);

  useEffect(() => { loadSubmission(); }, [loadSubmission]);

  // ── API call ──
  const callApproveAPI = async (action: 'APPROVED' | 'SENT_BACK' | 'CANCELLED', comment?: string) => {
    if (!submissionId || !submission) return;
    setIsActing(true);
    setApiError('');
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: currentUserRole,
          action,
          comment: comment || null,
          approverName: currentUserName,
          approverEmail: currentUserEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Action failed');
      setSubmission({
        ...data.data,
        approvals: data.data.approvals.map((a: ApproverRecord) => ({
          ...a,
          label: ROLE_LABEL[a.role as UserRole] ?? a.role,
        })),
      });
      setLog(prev => [...prev, {
        id: Date.now(),
        actor: currentUserName,
        role: ROLE_LABEL[currentUserRole],
        action: action === 'APPROVED' ? 'Approved' : action === 'SENT_BACK' ? 'Sent Back' : 'Cancelled',
        comment,
        timestamp: new Date().toLocaleString('en-GB'),
      }]);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Action failed. Please try again.');
    } finally {
      setIsActing(false);
    }
  };

  // ── Derived state ──
  const approvals = (submission?.approvals ?? []).filter(a =>
    ['BUM', 'FBP', 'CLUSTER_HEAD'].includes(a.role)
  );
  const myRecord = approvals.find(a => a.role === currentUserRole);
  const alreadyActed = myRecord?.status !== 'PENDING';
  const overallStatus = getOverallStatus(submission?.approvals ?? []);
  const requestIsCancelled = submission?.status === 'CANCELLED';

  const meta = (() => {
    try { return JSON.parse(submission?.scopeOfAgreement || '{}'); }
    catch { return {}; }
  })();

  const activeStep = (() => {
    switch (submission?.status) {
      case 'PENDING_APPROVAL': return 1;
      case 'PENDING_CEO': return 2;
      case 'PENDING_LEGAL_GM': return 3;
      case 'PENDING_LEGAL_OFFICER': return 4;
      case 'PENDING_LEGAL_GM_FINAL': return 5;
      case 'COMPLETED': return 6;
      default: return 1;
    }
  })();

  // ── Loading / error states ──
    if (status === 'loading') return null;
  if (status === 'authenticated' && !['BUM', 'FBP', 'CLUSTER_HEAD'].includes(session?.user?.role as string)) {
    router.replace('/');
    return null;
  }
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-[#1A438A] animate-spin" />
        <p className="text-slate-500 text-sm font-medium">Loading submission...</p>
      </div>
    </div>
  );

  if (loadError || !submission) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]">
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 max-w-sm w-full text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
        <p className="text-slate-600 text-sm mb-4">{loadError || 'Submission not found'}</p>
        <button onClick={() => router.push(ROUTES.HOME)}
          className="w-full py-2.5 rounded-xl font-bold text-white text-sm"
          style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
          Return to Home
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* ── Sidebar ── */}
      <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen"
        style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
        <div className="relative mb-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">
            {currentUserName.charAt(0)}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]" />
        </div>
        <div className="text-center">
          <p className="text-white text-[10px] font-semibold">{currentUserName.split(' ')[0]}</p>
          <p className="text-white/40 text-[9px]">{currentUserName.split(' ')[1] || ''}</p>
        </div>
        <div className="w-8 h-px bg-white/10" />
        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          <NotificationBell />
          <button onClick={() => router.push(ROUTES.HOME)}
            className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all" title="Home">
            <Home className="w-[18px] h-[18px]" />
          </button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all">
            <Lightbulb className="w-[18px] h-[18px]" />
          </button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all">
            <Search className="w-[18px] h-[18px]" />
          </button>
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all">
            <Settings className="w-[18px] h-[18px]" />
          </button>
          <button onClick={() => setShowSignOut(true)}
            className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all">
            <User className="w-[18px] h-[18px]" />
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex gap-5 p-5 overflow-auto min-w-0">

        {/* ── Left: Form read-only ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Header */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">Lease Agreement</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono tracking-wide">16/FM/1641/07/02</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {submission.isResubmission && (
                  <span className="text-[11px] font-bold px-3 py-1 rounded-full border bg-amber-400/25 text-amber-200 border-amber-400/40 flex items-center gap-1.5">
                    <RotateCcw className="w-3 h-3" />Resubmission
                  </span>
                )}
                <span className="text-[11px] font-semibold px-3 py-1 rounded-full border bg-blue-500/20 text-blue-200 border-blue-400/30">
                  Pending Approval
                </span>
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 2</div>
              </div>
            </div>
          </div>

          {/* API Error banner */}
          {apiError && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">{apiError}</p>
              <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Form fields read-only */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Submission Details</span>
            </div>
            <div className="px-6 py-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Contact No" value={meta.contactNo || ''} />
                <ReadField label="Dept. SAP Code" value={meta.deptSapCode || ''} />
              </div>
              <ReadField label="Purpose of Lease" value={meta.purposeOfLease || ''} />

              {/* Lessor parties table */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Property Owner (Lessor)
                </label>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="grid grid-cols-2 bg-slate-50 border-b border-slate-200">
                    <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Type</div>
                    <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-l border-slate-200">Name</div>
                  </div>
                  {(meta.lessorParties || []).filter((p: { type: string; name: string }) => p.type || p.name).map((p: { type: string; name: string }, i: number) => (
                    <div key={i} className="grid grid-cols-2 border-b border-slate-100 last:border-0">
                      <div className="px-3.5 py-2.5 text-sm text-slate-700">{p.type}</div>
                      <div className="px-3.5 py-2.5 text-sm text-slate-700 border-l border-slate-100 font-medium">{p.name}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ReadField label="NIC No" value={meta.nicNo || ''} />
                <ReadField label="VAT Reg. No." value={meta.vatRegNo || ''} />
              </div>
              <ReadField label="Contact (Lessor)" value={meta.lessorContact || ''} />
              <ReadField label="Name of Lessee/Tenant" value={meta.leaseName || ''} />
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Premises bearing Asst. No" value={meta.premisesAssetNo || ''} />
                <ReadField label="Period of Lease" value={meta.periodOfLease || ''} />
              </div>

              {/* Asset Type */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Asset Type</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {meta.assetHouse && <span className="px-3 py-1 rounded-full bg-[#EEF3F8] text-[#1A438A] text-xs font-bold">House</span>}
                  {meta.assetLand && <span className="px-3 py-1 rounded-full bg-[#EEF3F8] text-[#1A438A] text-xs font-bold">Land</span>}
                  {meta.assetBuilding && <span className="px-3 py-1 rounded-full bg-[#EEF3F8] text-[#1A438A] text-xs font-bold">Building</span>}
                  {meta.assetExtent && <span className="text-sm text-slate-500 ml-2">Extent: {meta.assetExtent}</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Commencing from" value={meta.commencingFrom || ''} />
                <ReadField label="Ending on" value={meta.endingOn || ''} />
              </div>
              <ReadField label="Monthly Rental Rs." value={meta.monthlyRental || ''} />
              <div className="grid grid-cols-3 gap-4">
                <ReadField label="Advance Payment Rs." value={meta.advancePayment || ''} />
                <ReadField label="Deductible Rate Rs." value={meta.deductibleRate || ''} />
                <ReadField label="Period" value={meta.deductiblePeriod || ''} />
              </div>
              <ReadField label="Refundable Deposit Rs." value={meta.refundableDeposit || ''} />
              <ReadField label="Electricity, Water & Phone" value={meta.electricityWaterPhone || ''} />
              <ReadField label="If a Renewal, Previous Agreement No" value={meta.previousAgreementNo || ''} />
              <ReadField label="Date of the Principal Agreement" value={meta.dateOfPrincipalAgreement || ''} />
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Buildings fully/partly constructed?" value={meta.buildingsConstructed || ''} />
                <ReadField label="Intend to construct?" value={meta.intendToConstruct || ''} />
              </div>
              <ReadField label="Remarks" value={meta.remarks || ''} />
            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-[296px] flex-shrink-0 flex flex-col gap-4">

          {/* Workflow Tracker */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-5">
              <button onClick={() => setShowLog(true)} className="text-[11px] font-semibold text-[#1A438A] hover:underline">
                View Log
              </button>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Submission No.</p>
                <p className="text-[#1A438A] font-bold text-sm font-mono">{submission.submissionNo}</p>
              </div>
            </div>
            <div className="relative flex justify-between items-start">
              <div className="absolute top-[9px] left-[9px] right-[9px] h-px bg-slate-200" />
              <div className="absolute top-[9px] left-[9px] h-px bg-[#1A438A] transition-all"
                style={{ width: `${(activeStep / (WORKFLOW_STEPS.length - 1)) * 100}%` }} />
              {WORKFLOW_STEPS.map((step, i) => (
                <div key={i} className="relative flex flex-col items-center z-10"
                  style={{ width: `${100 / WORKFLOW_STEPS.length}%` }}>
                  <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all shadow-sm
                    ${i < activeStep ? 'bg-[#1A438A] border-[#1A438A]'
                    : i === activeStep ? 'bg-[#1A438A] border-[#1A438A] ring-4 ring-[#1A438A]/15'
                    : 'bg-white border-slate-300'}`}>
                    {i < activeStep && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                    {i === activeStep && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <p className="text-[9px] text-center leading-tight whitespace-pre-line mt-1.5 text-slate-500 font-medium px-0.5">
                    {step.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Required Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3"
              style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
            </div>
            <div className="p-3 space-y-1.5">
              {submission.documents.map((doc, i) => (
                <div key={doc.id}
                  onClick={() => doc.fileUrl && window.open(doc.fileUrl, '_blank')}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all
                    ${doc.fileUrl ? 'bg-emerald-50 border-emerald-200 cursor-pointer hover:bg-emerald-100'
                    : 'bg-slate-50 border-slate-100'}`}>
                  <span className="text-[11px] text-slate-600 flex-1 mr-2">
                    <span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{doc.label}
                  </span>
                  {doc.fileUrl
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    : <Paperclip className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* Approvals status */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Approvals</span>
            </div>
            <div className="p-4 space-y-3">
              {approvals.map(a => (
                <div key={a.role}
                  className={`rounded-xl border px-3 py-2.5 transition-all
                    ${a.status === 'APPROVED' ? 'bg-emerald-50 border-emerald-200'
                    : a.status === 'CANCELLED' ? 'bg-red-50 border-red-200'
                    : a.status === 'SENT_BACK' ? 'bg-orange-50 border-orange-200'
                    : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <ApproverStatusIcon status={a.status} />
                      <span className="text-[11px] font-bold text-slate-700">
                        {ROLE_LABEL[a.role as UserRole] ?? a.role}
                      </span>
                      {a.role === currentUserRole && (
                        <span className="text-[9px] bg-[#1A438A] text-white px-1.5 py-0.5 rounded-full font-bold">YOU</span>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wide
                      ${a.status === 'APPROVED' ? 'text-emerald-600'
                      : a.status === 'CANCELLED' ? 'text-red-500'
                      : a.status === 'SENT_BACK' ? 'text-orange-500'
                      : 'text-yellow-600'}`}>
                      {a.status === 'APPROVED' ? 'Approved'
                        : a.status === 'CANCELLED' ? 'Cancelled'
                        : a.status === 'SENT_BACK' ? 'Sent Back'
                        : 'Pending'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate pl-7">{a.approverName || '—'}</p>
                  {a.comment && (
                    <p className="text-[11px] text-slate-500 italic mt-1 pl-7">&ldquo;{a.comment}&rdquo;</p>
                  )}
                </div>
              ))}

              {/* CEO step — locked until first level done */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-300 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-3 h-3 text-white" />
                    </span>
                    <span className="text-[11px] font-bold text-amber-700">CEO</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-500">Awaiting</span>
                </div>
                <p className="text-[10px] text-amber-600 mt-1 pl-7">
                  {overallStatus === 'APPROVED'
                    ? 'First level approved — pending CEO'
                    : 'Pending first level approvals'}
                </p>
              </div>

              {/* Overall summary badge */}
              <div className={`rounded-xl px-3 py-2 text-center text-[11px] font-bold border
                ${overallStatus === 'APPROVED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : overallStatus === 'REJECTED' ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
                {overallStatus === 'APPROVED' && '✓ All approved — proceeding to CEO'}
                {overallStatus === 'REJECTED' && '✗ Request has been rejected / sent back'}
                {overallStatus === 'PENDING' && '⏳ Waiting for all approvers to respond'}
              </div>
            </div>
          </div>

          {/* Comments */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Comments</span>
            </div>
            <div className="p-3">
              {comments.length > 0 && (
                <div className="mb-3 space-y-2 max-h-36 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[11px] font-bold text-[#1A438A]">{c.author}</span>
                        <span className="text-[10px] text-slate-400">{c.time}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all
                ${commentInput ? 'border-[#1A438A] bg-white ring-2 ring-[#1A438A]/10' : 'border-slate-200 bg-slate-50/80'}`}>
                <input type="text" value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && commentInput.trim()) {
                      setComments(prev => [...prev, {
                        id: Date.now(), author: currentUserName, role: currentUserRole,
                        text: commentInput.trim(), time: 'Just now',
                      }]);
                      setCommentInput('');
                    }
                  }}
                  placeholder="Post your comment here"
                  disabled={requestIsCancelled}
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
                />
                <button
                  onClick={() => {
                    if (!commentInput.trim()) return;
                    setComments(prev => [...prev, {
                      id: Date.now(), author: currentUserName, role: currentUserRole,
                      text: commentInput.trim(), time: 'Just now',
                    }]);
                    setCommentInput('');
                  }}
                  disabled={requestIsCancelled || !commentInput.trim()}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <button onClick={() => router.push(ROUTES.HOME)} disabled={isActing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all disabled:opacity-50">
              <ArrowLeft className="w-4 h-4" />Back
            </button>

            {!alreadyActed && !requestIsCancelled && (
              <div className="flex gap-2">
                <button onClick={() => setShowCancelModal(true)} disabled={isActing}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70"
                  style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                  Cancel
                </button>
                <button onClick={() => setShowSendBackModal(true)} disabled={isActing}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70"
                  style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                  Send Back
                </button>
                <button
                  disabled={isActing}
                  onClick={async () => {
                    await callApproveAPI('APPROVED');
                    setShowApproveModal(true);
                  }}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                  {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Approve'}
                </button>
              </div>
            )}

            {alreadyActed && (
              <div className={`w-full py-3 rounded-xl text-center text-sm font-bold border-2
                ${myRecord?.status === 'APPROVED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : myRecord?.status === 'CANCELLED' ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
                {myRecord?.status === 'APPROVED' && '✓ You have approved this request'}
                {myRecord?.status === 'CANCELLED' && '✗ You have cancelled this request'}
                {myRecord?.status === 'SENT_BACK' && '↩ You have sent this request back'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showLog && <ViewLogModal log={log} onClose={() => setShowLog(false)} />}

      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-green-500/30"
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-[#17293E] text-xl font-bold mb-2">Approved!</h2>
            <p className="text-slate-500 text-sm mb-6">Your approval has been recorded successfully.</p>
            <button
              onClick={() => { setShowApproveModal(false); router.push(ROUTES.HOME); }}
              className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
              Return to Home
            </button>
          </div>
        </div>
      )}

      {showSendBackModal && (
        <SendBackModal
          onConfirm={(c) => callApproveAPI('SENT_BACK', c)}
          onClose={() => { setShowSendBackModal(false); router.push(ROUTES.HOME); }}
          loading={isActing}
        />
      )}

      {showCancelModal && (
        <CancelModal
          onConfirm={(c) => callApproveAPI('CANCELLED', c)}
          onClose={() => { setShowCancelModal(false); router.push(ROUTES.HOME); }}
          loading={isActing}
        />
      )}

      {showSignOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSignOut(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm z-10">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Sign Out</h3>
            <p className="text-sm text-slate-500 mb-5">Are you sure you want to sign out?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowSignOut(false)}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => { setShowSignOut(false); router.push('/login'); }}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white active:scale-95"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Form2ApprovalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    }>
      <Form2ApprovalPageContent />
    </Suspense>
  );
}