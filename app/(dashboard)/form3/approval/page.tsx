'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import {
  X, LogOut, Home, Lightbulb, Search, Settings, User,
  ArrowLeft, CheckCircle2, FileText, Clock, XCircle,
  RotateCcw, Send, Paperclip, AlertCircle, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'SENT_BACK' | 'CANCELLED';
type UserRole = 'BUM' | 'FBP';

type ApproverRecord = {
  id: string; role: UserRole; label: string;
  approverName: string; approverEmail: string;
  status: ApprovalStatus; comment?: string | null; actionDate?: string | null;
};
type Party = { type: string; name: string };
type Submission = {
  id: string; submissionNo: string; status: string;
  companyCode: string; title: string; sapCostCenter: string;
  scopeOfAgreement: string; term: string; value: string;
  remarks?: string; initiatorComments?: string; isResubmission?: boolean;
  parties: Party[];
  approvals: ApproverRecord[];
  documents: { id: string; label: string; type: string; status: string; fileUrl?: string | null }[];
};
type LogEntry = { id: number; actor: string; role: string; action: string; comment?: string; timestamp: string; };
type CommentEntry = { id: number; author: string; role: string; text: string; time: string; };

const ROLE_LABEL: Record<UserRole, string> = { BUM: 'BUM', FBP: 'FBP' };

const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' }, { label: 'Approvals' }, { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' }, { label: 'Legal GM\nApproval' }, { label: 'Ready to\nCollect' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getOverallStatus(approvals: ApproverRecord[]): 'PENDING' | 'APPROVED' | 'REJECTED' {
  if (approvals.some((a) => a.status === 'CANCELLED' || a.status === 'SENT_BACK')) return 'REJECTED';
  if (approvals.every((a) => a.status === 'APPROVED')) return 'APPROVED';
  return 'PENDING';
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ApproverStatusIcon({ status }: { status: ApprovalStatus }) {
  if (status === 'APPROVED')  return <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0"><CheckCircle2 className="w-3 h-3 text-white"/></span>;
  if (status === 'CANCELLED') return <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0"><XCircle className="w-3 h-3 text-white"/></span>;
  if (status === 'SENT_BACK') return <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0"><RotateCcw className="w-3 h-3 text-white"/></span>;
  return <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0"><Clock className="w-3 h-3 text-white"/></span>;
}
function ApproverStatusLabel({ status }: { status: ApprovalStatus }) {
  if (status === 'APPROVED')  return <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Approved</span>;
  if (status === 'CANCELLED') return <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">Cancelled</span>;
  if (status === 'SENT_BACK') return <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wide">Sent Back</span>;
  return <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-wide">Pending</span>;
}
function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <div className="w-0.5 h-4 rounded-full bg-[#1A438A]"/>
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">{title}</span>
      </div>
      {children}
    </div>
  );
}
function ReadField({ label, value, multiline=false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      <div className={`w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 ${multiline?'whitespace-pre-wrap leading-relaxed':''}`}>
        {value||<span className="text-slate-400 italic">—</span>}
      </div>
    </div>
  );
}
function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg px-4 py-2.5 mb-3" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}><span className="text-white text-sm font-bold">{children}</span></div>;
}

// ─── View Log Modal ───────────────────────────────────────────────────────────
function ViewLogModal({ log, onClose }: { log: LogEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>
          <span className="text-white font-bold text-base">View Log</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {log.map((entry, i) => (
            <div key={entry.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-[#EEF3F8] border-2 border-[#1A438A]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-[#1A438A]">{i+1}</span>
                </div>
                {i<log.length-1&&<div className="w-px flex-1 bg-slate-200 my-1"/>}
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-bold text-[#17293E]">{entry.actor}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{entry.timestamp}</span>
                </div>
                <span className="text-[11px] text-[#4686B7] font-semibold">{entry.role}</span>
                <p className="text-sm text-slate-600 mt-0.5">{entry.action}</p>
                {entry.comment&&<p className="text-xs text-slate-500 mt-1 italic bg-slate-50 rounded-lg px-2 py-1">&quot;{entry.comment}&quot;</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Action Modals ────────────────────────────────────────────────────────────
function ApproveModal({ submissionNo, onClose }: { submissionNo: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-emerald-100 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/20">
          <CheckCircle2 className="w-10 h-10 text-emerald-500"/>
        </div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Successfully Approved</h2>
        <p className="text-slate-500 text-sm mb-1 leading-relaxed">Instruction for Litigation has been approved.</p>
        <p className="text-[#1A438A] font-bold text-sm font-mono mb-6">Submission ID : #{submissionNo.split('_').pop()}</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>OK</button>
      </div>
    </div>
  );
}
function SendBackModal({ submissionNo, onConfirm, onClose, loading }: { submissionNo: string; onConfirm: (c: string) => void; onClose: () => void; loading: boolean; }) {
  const [step, setStep] = useState<'confirm'|'success'>('confirm');
  const [comment, setComment] = useState('');
  if (step==='success') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-orange-100 flex items-center justify-center mb-5"><RotateCcw className="w-10 h-10 text-orange-500"/></div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Sent Back!</h2>
        <p className="text-slate-500 text-sm mb-1">Request returned to the initiator.</p>
        <p className="text-[#1A438A] font-bold text-sm font-mono mb-6">Submission ID : #{submissionNo.split('_').pop()}</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-white" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>OK</button>
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5">
          <h3 className="text-[#17293E] font-bold text-base text-center mb-1">Send back this request?</h3>
          <p className="text-slate-500 text-xs text-center mb-4">This will reset all approvals and return the request to the initiator.</p>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Reason / Comment <span className="text-red-400">*</span></label>
          <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} placeholder="Please provide a reason..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A]"/>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} disabled={loading} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button disabled={!comment.trim()||loading} onClick={()=>{onConfirm(comment);setStep('success');}}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{background:'linear-gradient(135deg, #f97316, #ea580c)'}}>
            {loading?<><Loader2 className="w-4 h-4 animate-spin"/>Saving...</>:'Yes, Send Back'}
          </button>
        </div>
      </div>
    </div>
  );
}
function CancelModal({ submissionNo, onConfirm, onClose, loading }: { submissionNo: string; onConfirm: (c: string) => void; onClose: () => void; loading: boolean; }) {
  const [step, setStep] = useState<'confirm'|'success'>('confirm');
  const [comment, setComment] = useState('');
  if (step==='success') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-red-100 flex items-center justify-center mb-5"><XCircle className="w-10 h-10 text-red-500"/></div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Cancelled!</h2>
        <p className="text-slate-500 text-sm mb-1">Request has been cancelled.</p>
        <p className="text-[#1A438A] font-bold text-sm font-mono mb-6">Submission ID : #{submissionNo.split('_').pop()}</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-white" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>OK</button>
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5">
          <h3 className="text-[#17293E] font-bold text-base text-center mb-1">Cancel this request?</h3>
          <p className="text-slate-500 text-xs text-center mb-4">This action is <span className="font-bold text-red-500">irreversible</span>.</p>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Reason / Comment <span className="text-red-400">*</span></label>
          <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} placeholder="Please provide a reason..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A]"/>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} disabled={loading} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button disabled={!comment.trim()||loading} onClick={()=>{onConfirm(comment);setStep('success');}}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{background:'linear-gradient(135deg, #ef4444, #dc2626)'}}>
            {loading?<><Loader2 className="w-4 h-4 animate-spin"/>Saving...</>:'Yes, Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function Form3ApprovalPageContent() {
  const { data: session, status } = useSession();
  const currentUserRole = (session?.user?.role as UserRole) ?? 'BUM';
  const currentUserName = session?.user?.name ?? '';
  const currentUserEmail = session?.user?.email ?? '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('id');
  const [showSignOut, setShowSignOut] = useState(false);

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showSendBackModal, setShowSendBackModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [apiError, setApiError] = useState('');

  const loadSubmission = useCallback(async () => {
    if (!submissionId) { setLoadError('No submission ID provided.'); setIsLoading(false); return; }
    try {
      const res = await fetch(`/api/submissions/${submissionId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load');
      const s = data.data;
      const enriched: Submission = {
        ...s,
        approvals: s.approvals
          .filter((a: ApproverRecord) => ['BUM','FBP'].includes(a.role))
          .map((a: ApproverRecord) => ({ ...a, label: ROLE_LABEL[a.role as UserRole] ?? a.role })),
      };
      setSubmission(enriched);
      const seedLog: LogEntry[] = [
        { id:0, actor:'System', role:'System', action:'Submission created', timestamp: fmtDate(s.createdAt) },
        ...s.approvals.filter((a: ApproverRecord) => a.actionDate).map((a: ApproverRecord, i: number) => ({
          id: i+1, actor: a.approverName||a.role, role: ROLE_LABEL[a.role as UserRole]??a.role,
          action: a.status==='APPROVED'?'Approved':a.status==='SENT_BACK'?'Sent Back':'Cancelled',
          comment: a.comment??undefined, timestamp: fmtDate(a.actionDate),
        })),
      ];
      setLog(seedLog);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setIsLoading(false); }
  }, [submissionId]);

  useEffect(() => { loadSubmission(); }, [loadSubmission]);

  const callApproveAPI = async (action: 'APPROVED'|'SENT_BACK'|'CANCELLED', comment?: string) => {
    if (!submissionId||!submission) return;
    setIsActing(true); setApiError('');
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ role: currentUserRole, action, comment: comment||null, approverName: currentUserName, approverEmail: currentUserEmail }),
      });
      const data = await res.json();
      if (!res.ok||!data.success) throw new Error(data.error||'Action failed');
      const s = data.data;
      setSubmission({
        ...s,
        approvals: s.approvals
          .filter((a: ApproverRecord) => ['BUM','FBP'].includes(a.role))
          .map((a: ApproverRecord) => ({ ...a, label: ROLE_LABEL[a.role as UserRole]??a.role })),
      });
      setLog(prev => [...prev, {
        id: Date.now(), actor: currentUserName, role: ROLE_LABEL[currentUserRole],
        action: action==='APPROVED'?'Approved':action==='SENT_BACK'?'Sent Back — all approvals reset':'Cancelled the request',
        comment, timestamp: new Date().toLocaleString('en-GB'),
      }]);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Action failed.');
    } finally { setIsActing(false); }
  };

  const handleApprove  = async () => { await callApproveAPI('APPROVED'); };
  const handleSendBack = async (c: string) => { await callApproveAPI('SENT_BACK', c); };
  const handleCancel   = async (c: string) => { await callApproveAPI('CANCELLED', c); };
  const handlePostComment = () => {
    if (!commentInput.trim()) return;
    setComments(prev => [...prev, { id: Date.now(), author: currentUserName, role: currentUserRole, text: commentInput.trim(), time: 'Just now' }]);
    if (submissionId) fetch(`/api/submissions/${submissionId}/comments`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({authorName:currentUserName,authorRole:currentUserRole,text:commentInput.trim()}) });
    setCommentInput('');
  };

  const approvals = submission?.approvals ?? [];
  const myRecord = approvals.find(a => a.role === currentUserRole);
  const alreadyActed = myRecord?.status !== 'PENDING';
  const overallStatus = getOverallStatus(approvals);
  const requestIsCancelled = approvals.some(a => a.status==='CANCELLED') || submission?.status==='CANCELLED';
  const approvalStepColor = overallStatus==='APPROVED'?'#22c55e':overallStatus==='REJECTED'?'#ef4444':'#eab308';

  // Parse Form 3 meta
  let meta: Record<string, any> = {};
  if (submission?.scopeOfAgreement) { try { meta = JSON.parse(submission.scopeOfAgreement); } catch {} }

    if (status === 'loading') return null;
  if (status === 'authenticated' && !['BUM', 'FBP', 'CLUSTER_HEAD'].includes(session?.user?.role as string)) {
    router.replace('/');
    return null;
  }
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"><Loader2 className="w-10 h-10 text-[#1A438A] animate-spin"/></div>;
  if (loadError||!submission) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]">
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 max-w-sm w-full text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3"/>
        <h3 className="font-bold text-base mb-2">Could not load submission</h3>
        <p className="text-slate-500 text-sm mb-4">{loadError}</p>
        <button onClick={()=>router.push(ROUTES.HOME)} className="w-full py-2.5 rounded-xl font-bold text-white text-sm" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>Return to Home</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{fontFamily:"'DM Sans', sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* ── Sidebar ── */}
      <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen" style={{background:'linear-gradient(180deg, #1A438A 0%, #17293E 100%)'}}>
        <div className="relative mb-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">{currentUserName.charAt(0)}</div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]"/>
        </div>
        <div className="text-center">
          <p className="text-white text-[10px] font-semibold">{currentUserName.split(' ')[0]}</p>
          <p className="text-white/40 text-[9px]">{currentUserName.split(' ')[1]||''}</p>
        </div>
        <div className="w-8 h-px bg-white/10"/>
        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          <button onClick={()=>router.push(ROUTES.HOME)} className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Home className="w-[18px] h-[18px]"/></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Lightbulb className="w-[18px] h-[18px]"/></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Search className="w-[18px] h-[18px]"/></button>
          <NotificationBell/>
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><Settings className="w-[18px] h-[18px]"/></button>
          <button onClick={()=>setShowSignOut(true)} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><User className="w-[18px] h-[18px]"/></button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex gap-5 p-5 overflow-auto min-w-0">

        {/* ── Left ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Header */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><FileText className="w-5 h-5 text-white"/></div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">Instruction For Litigation</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono tracking-wide">16/FM/1641/07/03</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {submission.isResubmission&&<span className="text-[11px] font-bold px-3 py-1 rounded-full border bg-amber-400/25 text-amber-200 border-amber-400/40 flex items-center gap-1.5 animate-pulse"><RotateCcw className="w-3 h-3"/>Resubmission</span>}
                <span className="text-[11px] font-semibold px-3 py-1 rounded-full border bg-blue-500/20 text-blue-200 border-blue-400/30">Pending Approval</span>
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 3</div>
              </div>
            </div>
          </div>

          {apiError && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0"/>
              <p className="text-sm text-red-700 font-medium">{apiError}</p>
              <button onClick={()=>setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4"/></button>
            </div>
          )}

          {/* Form Body */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 rounded-full bg-[#1A438A]"/>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Submission Details</span>
            </div>
            <div className="px-6 py-6 space-y-5">

              <ReadField label="Letter of Demand Sent Date" value={meta.demandDate||submission.term||''}/>

              <div>
                <SectionHeader>Initiator&apos;s Information</SectionHeader>
                <div className="grid grid-cols-2 gap-4">
                  <ReadField label="Name" value={meta.initiatorName||''}/>
                  <ReadField label="Contact No" value={meta.initiatorContact||''}/>
                </div>
              </div>

              <div>
                <SectionHeader>Department&apos;s Details of the Creditor / Initiator</SectionHeader>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <ReadField label="Manager in Charge" value={meta.managerInCharge||''}/>
                  <ReadField label="Officer in Charge" value={meta.officerInCharge||''}/>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <ReadField label="Company Code" value={submission.companyCode||''}/>
                  <ReadField label="SAP Cost Center No" value={submission.sapCostCenter||''}/>
                  <ReadField label="Cluster No" value={meta.clusterNo||''}/>
                </div>
              </div>

              <div>
                <SectionHeader>Representative Details (for Court Representation)</SectionHeader>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <ReadField label="Name" value={meta.repName||''}/>
                  <ReadField label="Designation" value={meta.repDesignation||''}/>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <ReadField label="NIC" value={meta.repNic||''}/>
                  <ReadField label="Contact No" value={meta.repContact||''}/>
                  <ReadField label="Email Address" value={meta.repEmail||''}/>
                </div>
              </div>

              <div>
                <SectionHeader>Customer&apos;s Personal and Business Information</SectionHeader>
                <div className="mb-3"><ReadField label="Type of Customer" value={meta.customerType||''}/></div>
                {meta.customerType === 'Individual' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Name" value={meta.customerData?.customerName||''}/><ReadField label="SAP BP Code" value={meta.customerData?.sapBpCode||''}/></div>
                    <ReadField label="NIC No" value={meta.customerData?.nicNo||''}/>
                    <ReadField label="Residential Address" value={meta.customerData?.residentialAddress||''}/>
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Contact No" value={meta.customerData?.contactNo||''}/><ReadField label="Email Address" value={meta.customerData?.emailAddress||''}/></div>
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Outstanding Amount Rs." value={meta.customerData?.outstandingAmount||''}/><ReadField label="Vehicle No" value={meta.customerData?.vehicleNo||''}/></div>
                    {meta.customerData?.otherDetails&&<ReadField label="Other Details" value={meta.customerData.otherDetails}/>}
                  </div>
                )}
                {meta.customerType === 'Company' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Company Name" value={meta.customerData?.companyName||''}/><ReadField label="SAP BP Code" value={meta.customerData?.sapBpCode||''}/></div>
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Registration No" value={meta.customerData?.companyRegNo||''}/><ReadField label="Registered Address" value={meta.customerData?.registeredAddress||''}/></div>
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Contact No" value={meta.customerData?.contactNo||''}/><ReadField label="Email Address" value={meta.customerData?.emailAddress||''}/></div>
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Outstanding Amount Rs." value={meta.customerData?.outstandingAmount||''}/><ReadField label="Vehicle No" value={meta.customerData?.vehicleNo||''}/></div>
                  </div>
                )}
                {(meta.customerType === 'Sole-proprietorship' || meta.customerType === 'Partnership') && (
                  <div className="space-y-3">
                    {meta.customerType==='Sole-proprietorship'&&<div className="grid grid-cols-2 gap-4"><ReadField label="Name of Owner" value={meta.customerData?.ownerName||''}/><ReadField label="SAP BP Code" value={meta.customerData?.sapBpCode||''}/></div>}
                    {meta.customerType==='Partnership'&&(meta.customerData?.owners||[]).map((o: any, i: number)=>(
                      <div key={i} className="grid grid-cols-2 gap-4"><ReadField label={`Owner ${i+1} Name`} value={o.name||''}/><ReadField label="Residential Address" value={o.address||''}/></div>
                    ))}
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Business Name" value={meta.customerData?.businessName||''}/><ReadField label="Business Registration No" value={meta.customerData?.businessRegNo||''}/></div>
                    <ReadField label="Principal Place of Business" value={meta.customerData?.principalPlaceOfBusiness||''}/>
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Contact No" value={meta.customerData?.contactNo||''}/><ReadField label="Email Address" value={meta.customerData?.emailAddress||''}/></div>
                    <div className="grid grid-cols-2 gap-4"><ReadField label="Outstanding Amount Rs." value={meta.customerData?.outstandingAmount||''}/><ReadField label="Vehicle No" value={meta.customerData?.vehicleNo||''}/></div>
                  </div>
                )}
              </div>

              {meta.legalHistory?.length > 0 && (
                <div>
                  <SectionHeader>Legal Actions History</SectionHeader>
                  {meta.legalHistory.map((h: any, i: number) => (
                    <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3"><ReadField label="Case No" value={h.caseNo||''}/><ReadField label="Court" value={h.court||''}/></div>
                      <div className="grid grid-cols-2 gap-3"><ReadField label="Outstanding Amount" value={h.outstandingAmount||''}/><ReadField label="Status of Case/s" value={h.statusOfCase||''}/></div>
                      {h.remarks&&<ReadField label="Remarks" value={h.remarks}/>}
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-[296px] flex-shrink-0 flex flex-col gap-4">

          {/* Workflow Tracker */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-5">
              <button onClick={()=>setShowLog(true)} className="text-[11px] font-semibold text-[#1A438A] hover:underline">View Log</button>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Submission No.</p>
                <p className="text-[#1A438A] font-bold text-sm font-mono">{submission.submissionNo}</p>
              </div>
            </div>
            <div className="relative flex justify-between items-start">
              <div className="absolute top-[9px] left-[9px] right-[9px] h-px bg-slate-200"/>
              {WORKFLOW_STEPS.map((step, i) => {
                const statusToStep: Record<string,number> = { PENDING_APPROVAL:1, PENDING_LEGAL_GM:2, PENDING_LEGAL_OFFICER:3, PENDING_COURT_OFFICER:3, PENDING_LEGAL_GM_FINAL:4, COMPLETED:5, SENT_BACK:1, CANCELLED:1 };
                const activeStep = statusToStep[submission?.status??'']??1;
                const isActive = i<=activeStep;
                const isApprovalStep = i===1;
                const dotColor = isApprovalStep ? approvalStepColor : isActive ? '#1A438A' : '#cbd5e1';
                return (
                  <div key={i} className="relative flex flex-col items-center z-10" style={{width:`${100/WORKFLOW_STEPS.length}%`}}>
                    <div className="w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all shadow-sm"
                      style={{background:isActive?dotColor:'white', borderColor:isActive?dotColor:'#cbd5e1', boxShadow:isApprovalStep?`0 0 0 4px ${approvalStepColor}25`:undefined}}>
                      {i===0&&<CheckCircle2 className="w-2.5 h-2.5 text-white"/>}
                      {isApprovalStep&&overallStatus==='APPROVED'&&<CheckCircle2 className="w-2.5 h-2.5 text-white"/>}
                      {isApprovalStep&&overallStatus==='REJECTED'&&<XCircle className="w-2.5 h-2.5 text-white"/>}
                      {isApprovalStep&&overallStatus==='PENDING'&&<div className="w-2 h-2 rounded-full bg-white"/>}
                    </div>
                    <p className="text-[9px] text-center leading-tight whitespace-pre-line mt-1.5 text-slate-500 font-medium px-0.5">{step.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Required Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
            </div>
            <div className="p-3 space-y-1.5">
              {submission.documents.map((doc, i) => (
                <div key={doc.id} onClick={()=>doc.fileUrl&&window.open(doc.fileUrl,'_blank')}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all ${doc.fileUrl?'bg-emerald-50 border-emerald-200 cursor-pointer hover:bg-emerald-100':'bg-slate-50 border-slate-100 cursor-default'}`}>
                  <span className="text-[11px] text-slate-600 flex-1 mr-2"><span className="font-bold text-slate-300 mr-1">{i+1}.</span>{doc.label}</span>
                  {doc.fileUrl?<CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0"/>:<Paperclip className="w-4 h-4 text-slate-300 flex-shrink-0"/>}
                </div>
              ))}
            </div>
          </div>

          {/* Approvals */}
          <PanelSection title="Approvals">
            <div className="p-4 space-y-3">
              {approvals.map(a => (
                <div key={a.role} className={`rounded-xl border px-3 py-2.5 transition-all ${a.status==='APPROVED'?'bg-emerald-50 border-emerald-200':a.status==='CANCELLED'?'bg-red-50 border-red-200':a.status==='SENT_BACK'?'bg-orange-50 border-orange-200':'bg-slate-50 border-slate-100'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <ApproverStatusIcon status={a.status}/>
                      <span className="text-[11px] font-bold text-slate-700">{ROLE_LABEL[a.role as UserRole]??a.role}</span>
                      {a.role===currentUserRole&&<span className="text-[9px] bg-[#1A438A] text-white px-1.5 py-0.5 rounded-full font-bold">YOU</span>}
                    </div>
                    <ApproverStatusLabel status={a.status}/>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate pl-7">{a.approverName||a.approverEmail||'—'}</p>
                  {a.comment&&<p className="text-[11px] text-slate-500 italic mt-1 pl-7">&quot;{a.comment}&quot;</p>}
                  {a.actionDate&&<p className="text-[10px] text-slate-400 mt-0.5 pl-7 font-mono">{fmtDate(a.actionDate)}</p>}
                </div>
              ))}
              <div className={`rounded-xl px-3 py-2 text-center text-[11px] font-bold border ${overallStatus==='APPROVED'?'bg-emerald-50 border-emerald-200 text-emerald-700':overallStatus==='REJECTED'?'bg-red-50 border-red-200 text-red-700':'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
                {overallStatus==='APPROVED'&&'✓ All approved — proceeding to Legal GM'}
                {overallStatus==='REJECTED'&&'✗ Request has been rejected / sent back'}
                {overallStatus==='PENDING'&&'⏳ Waiting for all approvers to respond'}
              </div>
            </div>
          </PanelSection>

          {/* Comments */}
          <PanelSection title="Comments">
            <div className="p-3">
              {comments.length>0&&(
                <div className="mb-3 space-y-2 max-h-36 overflow-y-auto">
                  {comments.map(c=>(
                    <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex justify-between mb-0.5"><span className="text-[11px] font-bold text-[#1A438A]">{c.author}</span><span className="text-[10px] text-slate-400">{c.time}</span></div>
                      <p className="text-[10px] text-[#4686B7] font-semibold mb-1">{c.role}</p>
                      <p className="text-xs text-slate-600 leading-relaxed">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${commentInput?'border-[#1A438A] bg-white ring-2 ring-[#1A438A]/10':'border-slate-200 bg-slate-50/80'}`}>
                <input type="text" value={commentInput} onChange={e=>setCommentInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handlePostComment()}
                  placeholder="Post your comment here" disabled={requestIsCancelled}
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"/>
                <button onClick={handlePostComment} disabled={requestIsCancelled||!commentInput.trim()}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white"/>
                </button>
              </div>
            </div>
          </PanelSection>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <button onClick={()=>router.push(ROUTES.HOME)} disabled={isActing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all disabled:opacity-50">
              <ArrowLeft className="w-4 h-4"/>Back
            </button>
            {!alreadyActed&&!requestIsCancelled&&(
              <div className="flex gap-2">
                <button onClick={()=>setShowCancelModal(true)} disabled={isActing} className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70" style={{background:'linear-gradient(135deg, #ef4444, #dc2626)'}}>Cancel</button>
                <button onClick={()=>setShowSendBackModal(true)} disabled={isActing} className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70" style={{background:'linear-gradient(135deg, #f97316, #ea580c)'}}>Send Back</button>
                <button disabled={isActing} onClick={async()=>{await handleApprove();if(!apiError)setShowApproveModal(true);}}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-1"
                  style={{background:'linear-gradient(135deg, #22c55e, #16a34a)'}}>
                  {isActing?<Loader2 className="w-4 h-4 animate-spin"/>:'Approve'}
                </button>
              </div>
            )}
            {alreadyActed&&(
              <div className={`w-full py-3 rounded-xl text-center text-sm font-bold border-2 ${myRecord?.status==='APPROVED'?'bg-emerald-50 border-emerald-200 text-emerald-700':myRecord?.status==='CANCELLED'?'bg-red-50 border-red-200 text-red-700':'bg-orange-50 border-orange-200 text-orange-700'}`}>
                {myRecord?.status==='APPROVED'&&'✓ You have approved this request'}
                {myRecord?.status==='CANCELLED'&&'✗ You have cancelled this request'}
                {myRecord?.status==='SENT_BACK'&&'↩ You have sent this request back'}
              </div>
            )}
            {requestIsCancelled&&!alreadyActed&&(
              <div className="w-full py-3 rounded-xl text-center text-sm font-bold bg-red-50 border-2 border-red-200 text-red-700">✗ This request has been cancelled</div>
            )}
          </div>
        </div>
      </div>

      {showLog&&<ViewLogModal log={log} onClose={()=>setShowLog(false)}/>}
      {showApproveModal&&<ApproveModal submissionNo={submission.submissionNo} onClose={()=>{setShowApproveModal(false);router.push(ROUTES.HOME);}}/>}
      {showSendBackModal&&<SendBackModal submissionNo={submission.submissionNo} onConfirm={handleSendBack} onClose={()=>setShowSendBackModal(false)} loading={isActing}/>}
      {showCancelModal&&<CancelModal submissionNo={submission.submissionNo} onConfirm={handleCancel} onClose={()=>setShowCancelModal(false)} loading={isActing}/>}

      {showSignOut&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setShowSignOut(false)}/>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-7 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mb-4"><LogOut className="w-7 h-7 text-red-500"/></div>
            <h3 className="text-[#17293E] font-bold text-base mb-1">Sign Out?</h3>
            <p className="text-slate-500 text-sm mb-6">You will be redirected to the login page.</p>
            <div className="flex gap-3 w-full">
              <button onClick={()=>setShowSignOut(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={()=>{setShowSignOut(false);router.push('/login');}} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white" style={{background:'linear-gradient(135deg, #ef4444, #dc2626)'}}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Form3ApprovalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <Form3ApprovalPageContent/>
    </Suspense>
  );
}