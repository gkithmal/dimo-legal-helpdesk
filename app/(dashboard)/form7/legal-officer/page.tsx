'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import {
  Home, Settings, User,
  ArrowLeft, CheckCircle2, FileText, Clock, XCircle,
  RotateCcw, Send, Eye, Plus,
  AlertCircle, Upload, X, Loader2, Paperclip,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';

// ─── Types ─────────────────────────────────────────────────────────────────────
type LOStage = 'PENDING_GM' | 'REASSIGNED' | 'ACTIVE' | 'POST_GM_APPROVAL' | 'FINALIZATION';
type DocStatus = 'NONE' | 'OK' | 'ATTENTION' | 'RESUBMIT' | 'UPLOADED';

type RequiredDoc = { id: string; label: string; status: DocStatus; hasFile: boolean; fileUrl?: string | null; comment?: string };
type PreparedDoc = { id: string; name: string; type: 'draft'; fileUrl?: string | null };
type CommentEntry = { id: number; author: string; role: string; text: string; time: string };
type ApproverRecord = { id: string; role: string; approverName: string; approverEmail: string; status: string };

type Submission = {
  id: string; submissionNo: string; status: string; loStage?: string;
  companyCode: string; title: string; sapCostCenter: string;
  f7AgreementRefNo?: string; f7AgreementDate?: string; f7InitiatorContact?: string;
  f7AssessmentAddress?: string; f7OwnerNames?: string; f7EffectiveTerminationDate?: string;
  f7EarlyTerminationCharges?: string; f7RefundableDeposit?: string; f7PaymentDate1?: string;
  f7AdvanceRentals?: string; f7PaymentDate2?: string; f7Deductions?: string;
  f7FacilityPayments?: string; f7Penalty?: string; f7AmountDueByDimo?: string;
  f7BalanceToRecover?: string; f7DateInformedToLessee?: string; remarks?: string;
  f7TerminationLetterRefNo?: string; f7TerminationLetterSentDate?: string;
  f7TerminationLetterFileUrl?: string; f7OfficialRemarks?: string;
  f7LegalReviewCompleted?: boolean;
  assignedLegalOfficer?: string; initiatorName?: string;
  approvals: ApproverRecord[];
  documents: { id: string; label: string; type: string; status: string; fileUrl?: string | null; comment?: string | null }[];
  comments?: any[];
};

const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' }, { label: 'Approvals' }, { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' }, { label: 'Legal GM\nApproval' }, { label: 'Ready\nto Collect' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function mapLoStage(dbStage: string | undefined): LOStage {
  if (dbStage === 'POST_GM_APPROVAL') return 'POST_GM_APPROVAL';
  if (dbStage === 'FINALIZATION') return 'FINALIZATION';
  if (dbStage === 'REASSIGNED') return 'REASSIGNED';
  if (dbStage === 'ACTIVE' || dbStage === 'INITIAL_REVIEW') return 'ACTIVE';
  return 'PENDING_GM';
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

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function DocStatusIcon({ status }: { status: DocStatus }) {
  if (status === 'UPLOADED') return <span className="w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center"><Paperclip className="w-2.5 h-2.5 text-white" /></span>;
  if (status === 'OK') return <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center"><CheckCircle2 className="w-2.5 h-2.5 text-white" /></span>;
  if (status === 'ATTENTION') return <span className="w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center"><AlertCircle className="w-2.5 h-2.5 text-white" /></span>;
  if (status === 'RESUBMIT') return <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center"><XCircle className="w-2.5 h-2.5 text-white" /></span>;
  return null;
}

// ─── Main Component ────────────────────────────────────────────────────────────
function Form7LegalOfficerContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stageParam = searchParams.get('stage') as LOStage | null;
  const submissionId = searchParams.get('id');

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Finalization fields (Official Use Only)
  const [terminationLetterRefNo, setTerminationLetterRefNo] = useState('');
  const [terminationLetterSentDate, setTerminationLetterSentDate] = useState('');
  const [terminationLetterFile, setTerminationLetterFile] = useState<{ name: string; url: string } | null>(null);
  const [officialRemarks, setOfficialRemarks] = useState('');
  const [uploadingLetter, setUploadingLetter] = useState(false);

  // Doc management
  const [docs, setDocs] = useState<RequiredDoc[]>([]);
  const [preparedDocs, setPreparedDocs] = useState<PreparedDoc[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [showSuccessModal, setShowSuccessModal] = useState<null | 'save' | 'complete'>(null);

  const letterFileRef = useRef<HTMLInputElement | null>(null);
  const legalDocRef = useRef<HTMLInputElement | null>(null);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/submissions');
      const data = await res.json();
      if (data.success) {
        const myEmail = session?.user?.email;
        const form7 = (data.data || []).filter((s: any) =>
          s.formId === 7 &&
          s.status === 'PENDING_LEGAL_OFFICER' &&
          (!myEmail || s.assignedLegalOfficer === myEmail || s.legalOfficerName === session?.user?.name)
        );
        setSubmissions(form7);
        if (submissionId) {
          const found = form7.find((s: any) => s.id === submissionId) || (data.data || []).find((s: any) => s.id === submissionId);
          if (found) initSelected(found);
        }
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [submissionId, session]);

  const initSelected = (s: Submission) => {
    setSelected(s);
    setDocs(s.documents.filter((d) => d.type === 'required').map((d) => ({
      id: d.id, label: d.label, status: d.status as DocStatus, hasFile: !!d.fileUrl, fileUrl: d.fileUrl, comment: d.comment || '',
    })));
    setPreparedDocs(s.documents.filter((d) => d.type === 'legal').map((d) => ({
      id: d.id, name: d.label, type: 'draft', fileUrl: d.fileUrl,
    })));
    if (s.f7TerminationLetterRefNo) setTerminationLetterRefNo(s.f7TerminationLetterRefNo);
    if (s.f7TerminationLetterSentDate) setTerminationLetterSentDate(s.f7TerminationLetterSentDate);
    if (s.f7TerminationLetterFileUrl) setTerminationLetterFile({ name: 'Termination Letter', url: s.f7TerminationLetterFileUrl });
    if (s.f7OfficialRemarks) setOfficialRemarks(s.f7OfficialRemarks);
    if (s.comments?.length) {
      setComments(s.comments.map((c: any, i: number) => ({
        id: i, author: c.authorName, role: c.authorRole, text: c.text,
        time: new Date(c.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      })));
    }
  };

  useEffect(() => { if (session) loadSubmissions(); }, [loadSubmissions, session]);

  const loStage = mapLoStage(selected?.loStage);
  const isPostGM = loStage === 'POST_GM_APPROVAL' || loStage === 'FINALIZATION';
  const isActive = loStage === 'ACTIVE' || loStage === 'REASSIGNED';
  const activeStep = isPostGM ? 5 : isActive ? 3 : 2;

  const updateDocStatus = (docId: string, newStatus: DocStatus) => {
    setDocs((prev) => prev.map((d) => d.id === docId ? { ...d, status: newStatus } : d));
  };

  const handleUploadDoc = async (file: File) => {
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', `form7-legal-${selected?.id || 'unknown'}`);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        const newDoc: PreparedDoc = { id: Date.now().toString(), name: file.name, type: 'draft', fileUrl: data.url };
        setPreparedDocs((prev) => [...prev, newDoc]);
        if (selected) {
          await fetch(`/api/submissions/${selected.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addDocument: { label: file.name, type: 'legal', fileUrl: data.url } }),
          });
        }
      }
    } catch { /* silent */ }
    setUploadingDoc(false);
  };

  const handleUploadLetter = async (file: File) => {
    setUploadingLetter(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', `form7-letter-${selected?.id || 'unknown'}`);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) setTerminationLetterFile({ name: file.name, url: data.url });
    } catch { /* silent */ }
    setUploadingLetter(false);
  };

  const handleSubmitToLegalGM = async () => {
    if (!selected || actionLoading) return;
    setActionLoading(true);
    try {
      if (comment.trim()) {
        await fetch(`/api/submissions/${selected.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: comment, authorName: session?.user?.name, authorRole: 'LEGAL_OFFICER' }),
        });
      }
      await fetch(`/api/submissions/${selected.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'LEGAL_OFFICER', action: 'SUBMIT_TO_LEGAL_GM',
          approverName: session?.user?.name, approverEmail: session?.user?.email,
        }),
      });
      await loadSubmissions();
      setSelected(null);
    } catch { /* silent */ }
    setActionLoading(false);
  };

  const handleRequestMoreDocs = async () => {
    if (!selected) return;
    await fetch(`/api/submissions/${selected.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'LEGAL_OFFICER', action: 'RETURNED_TO_INITIATOR',
        comment, approverName: session?.user?.name,
        docStatuses: docs.map((d) => ({ id: d.id, status: d.status, comment: d.comment })),
      }),
    });
    setSelected(null);
    loadSubmissions();
  };

  const saveOfficialUse = async (complete: boolean) => {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch(`/api/submissions/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          f7TerminationLetterRefNo: terminationLetterRefNo,
          f7TerminationLetterSentDate: terminationLetterSentDate,
          f7TerminationLetterFileUrl: terminationLetterFile?.url || null,
          f7OfficialRemarks: officialRemarks,
          f7LegalReviewCompleted: complete,
        }),
      });
      if (complete) {
        await fetch(`/api/submissions/${selected.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'LEGAL_OFFICER', action: 'COMPLETED', approverName: session?.user?.name }),
        });
        setShowSuccessModal('complete');
      } else {
        setShowSuccessModal('save');
      }
      await loadSubmissions();
    } catch { /* silent */ }
    setSaving(false);
  };

  const postComment = async () => {
    if (!comment.trim() || !selected) return;
    await fetch(`/api/submissions/${selected.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: comment, authorName: session?.user?.name, authorRole: 'LEGAL_OFFICER' }),
    });
    setComments((p) => [...p, { id: Date.now(), author: session?.user?.name || '', role: 'LEGAL_OFFICER', text: comment, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }]);
    setComment('');
  };

  if (status === 'loading' || loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"><Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" /></div>;
  }

  // ── List view ──────────────────────────────────────────────────────────────
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
          </nav>
          <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
            <SidebarIcon icon={<Settings className="w-[18px] h-[18px]" />} />
            <SidebarIcon icon={<User className="w-[18px] h-[18px]" />} />
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => router.push(ROUTES.HOME)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50">
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
              <h1 className="text-lg font-black text-[#17293E]">Form 7 — Legal Officer</h1>
            </div>
            <div className="space-y-3">
              {submissions.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                  <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No Form 7 submissions assigned to you</p>
                </div>
              )}
              {submissions.map((s) => (
                <button key={s.id} onClick={() => initSelected(s)}
                  className="w-full text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:border-[#1A438A]/30 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#17293E]">{s.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{s.submissionNo} · Ref: {s.f7AgreementRefNo || 'N/A'}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Owner: {s.f7OwnerNames || '—'} · Stage: {s.loStage || '—'}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.loStage === 'POST_GM_APPROVAL' || s.loStage === 'FINALIZATION' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {s.loStage === 'POST_GM_APPROVAL' || s.loStage === 'FINALIZATION' ? 'Finalization' : 'Initial Review'}
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

  // ── Detail view ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');`}</style>

      {/* Sidebar */}
      <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen" style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
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
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <SidebarIcon icon={<Settings className="w-[18px] h-[18px]" />} />
          <SidebarIcon icon={<User className="w-[18px] h-[18px]" />} />
        </div>
      </aside>

      <div className="flex-1 flex gap-4 p-4 overflow-auto">
        {/* Left: Form */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Header */}
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
                <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border backdrop-blur-sm ${isPostGM ? 'bg-purple-500/20 text-purple-200 border-purple-400/30' : 'bg-blue-500/20 text-blue-200 border-blue-400/30'}`}>
                  {isPostGM ? 'Finalization' : 'Initial Review'}
                </span>
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 7</div>
              </div>
            </div>
          </div>

          {/* Submission Details (read-only) */}
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

          {/* Official Use Only — shown when LO is in finalization stage */}
          {isPostGM && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #17293E, #1A438A)' }}>
                <span className="text-white font-bold text-sm">Official Use Only (Legal Officer should enter)</span>
                {selected?.status === 'COMPLETED' && <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500 px-2 py-0.5 rounded-full text-white">Completed</span>}
              </div>
              <div className="p-5 space-y-4">
                {selected?.status === 'COMPLETED' && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-xs font-semibold text-emerald-700">This request has been completed — data cannot be modified.</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Termination Letter Reference No" required>
                    <input value={terminationLetterRefNo} onChange={(e) => { if (selected?.status !== 'COMPLETED') setTerminationLetterRefNo(e.target.value); }}
                      readOnly={selected?.status === 'COMPLETED'}
                      className={`w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none ${selected?.status === 'COMPLETED' ? 'bg-slate-100 cursor-default' : 'bg-slate-50 focus:border-[#1A438A]'}`} />
                  </FormField>
                  <FormField label="Termination Letter Sent Date" required>
                    <DatePicker value={terminationLetterSentDate} onChange={selected?.status !== 'COMPLETED' ? setTerminationLetterSentDate : () => {}} disabled={selected?.status === 'COMPLETED'} />
                  </FormField>
                </div>
                <FormField label="Termination Letter" required>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600">
                      {terminationLetterFile ? terminationLetterFile.name : <span className="text-slate-400">No file uploaded</span>}
                    </div>
                    {selected?.status !== 'COMPLETED' && (
                      <button onClick={() => letterFileRef.current?.click()} disabled={uploadingLetter}
                        className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-60"
                        style={{ background: '#1A438A' }}>
                        {uploadingLetter ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                        {uploadingLetter ? 'Uploading…' : 'Attach'}
                      </button>
                    )}
                    <input ref={letterFileRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadLetter(f); e.target.value = ''; }} />
                    {terminationLetterFile && (
                      <button onClick={() => window.open(terminationLetterFile.url, '_blank')}
                        className="w-8 h-8 rounded-lg bg-[#EEF3F8] flex items-center justify-center hover:bg-[#d9e4f0] transition-colors">
                        <Eye className="w-3.5 h-3.5 text-[#1A438A]" />
                      </button>
                    )}
                  </div>
                </FormField>
                <FormField label="Remarks">
                  <textarea value={officialRemarks} onChange={(e) => { if (selected?.status !== 'COMPLETED') setOfficialRemarks(e.target.value); }}
                    readOnly={selected?.status === 'COMPLETED'} rows={3}
                    className={`w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none resize-none ${selected?.status === 'COMPLETED' ? 'bg-slate-100 cursor-default' : 'bg-slate-50 focus:border-[#1A438A]'}`} />
                </FormField>

                {/* Finalization action buttons */}
                <div className="flex gap-3 pt-2 border-t border-slate-100">
                  <button onClick={() => setSelected(null)} className="px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors text-sm">
                    Back
                  </button>
                  {selected?.status === 'COMPLETED' ? (
                    <div className="flex-1 py-2.5 rounded-xl font-bold text-sm text-center bg-emerald-50 border-2 border-emerald-200 text-emerald-700">
                      ✓ This request has been completed
                    </div>
                  ) : (
                    <>
                      <button onClick={() => saveOfficialUse(false)} disabled={saving}
                        className="px-4 py-2.5 rounded-xl font-bold text-[#1A438A] border border-[#1A438A] hover:bg-[#EEF3F8] transition-colors text-sm disabled:opacity-60">
                        Save and Close
                      </button>
                      <button onClick={() => saveOfficialUse(true)}
                        disabled={saving || !terminationLetterRefNo || !terminationLetterSentDate || !terminationLetterFile}
                        className="px-4 py-2.5 rounded-xl font-bold text-white transition-all active:scale-95 disabled:opacity-60 text-sm flex items-center gap-1.5"
                        style={{ background: 'linear-gradient(135deg, #7CB518, #6aa315)' }}>
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Job Completion
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Initial review action buttons */}
          {!isPostGM && (
            <div className="flex gap-3">
              <button onClick={() => setSelected(null)} className="px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors text-sm">
                Back
              </button>
              <button onClick={handleRequestMoreDocs}
                className="px-4 py-2.5 rounded-xl font-bold text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors text-sm">
                Request More Documents
              </button>
              <button onClick={handleSubmitToLegalGM} disabled={actionLoading}
                className="ml-auto px-4 py-2.5 rounded-xl font-bold text-white transition-all active:scale-95 disabled:opacity-60 text-sm flex items-center gap-1.5"
                style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Submit to Legal GM
              </button>
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          {/* Submission No + Stepper */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
              <div className="flex items-center justify-between">
                <span className="text-white/70 text-[10px] font-bold">Submission No</span>
                <span className="text-white font-black text-base">{selected.submissionNo}</span>
              </div>
            </div>
            <div className="px-4 py-4">
              <WorkflowStepper steps={WORKFLOW_STEPS} activeStep={activeStep} />
            </div>
          </div>

          {/* Required Documents */}
          <PanelSection title="Required Documents" action={
            <button onClick={handleRequestMoreDocs}
              className="px-3 py-1 rounded-lg text-[10px] font-bold text-white" style={{ background: '#7CB518' }}>
              Request More Documents
            </button>
          }>
            <div className="p-3 space-y-2">
              {docs.map((doc) => (
                <div key={doc.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-[11px] text-slate-600 flex-1 truncate">{doc.label}</span>
                    {doc.status !== 'NONE' && <DocStatusIcon status={doc.status} />}
                    {doc.hasFile && (
                      <button onClick={() => doc.fileUrl && window.open(doc.fileUrl, '_blank')}
                        className="w-6 h-6 rounded-lg bg-[#EEF3F8] flex items-center justify-center hover:bg-[#d9e4f0]">
                        <Eye className="w-3 h-3 text-[#1A438A]" />
                      </button>
                    )}
                  </div>
                  {doc.hasFile && (
                    <div className="flex gap-1 px-3 pb-2">
                      {(['OK', 'ATTENTION', 'RESUBMIT'] as DocStatus[]).map((s) => (
                        <button key={s} onClick={() => updateDocStatus(doc.id, s)}
                          className={`flex-1 py-1 rounded-lg text-[9px] font-bold transition-colors ${doc.status === s
                            ? s === 'OK' ? 'bg-emerald-500 text-white' : s === 'ATTENTION' ? 'bg-yellow-400 text-white' : 'bg-red-500 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                          {s === 'OK' ? 'OK' : s === 'ATTENTION' ? 'Attention' : 'Resubmit'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {docs.length === 0 && <p className="text-[11px] text-slate-400 text-center py-2">No documents uploaded</p>}
            </div>
          </PanelSection>

          {/* Documents Prepared by Legal Dept */}
          <PanelSection title="Documents Prepared by Legal Department" action={
            <button onClick={() => legalDocRef.current?.click()} disabled={uploadingDoc}
              className="px-3 py-1 rounded-lg text-[10px] font-bold text-white flex items-center gap-1" style={{ background: '#7CB518' }}>
              {uploadingDoc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add
            </button>
          }>
            <div className="p-3 space-y-2">
              {preparedDocs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl">
                  <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-[11px] text-slate-600 flex-1 truncate">{doc.name}</span>
                  {doc.fileUrl && (
                    <button onClick={() => window.open(doc.fileUrl!, '_blank')}
                      className="w-6 h-6 rounded-lg bg-[#EEF3F8] flex items-center justify-center hover:bg-[#d9e4f0]">
                      <Eye className="w-3 h-3 text-[#1A438A]" />
                    </button>
                  )}
                </div>
              ))}
              {preparedDocs.length === 0 && <p className="text-[11px] text-slate-400 text-center py-2">No documents yet</p>}
            </div>
            <input ref={legalDocRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadDoc(f); e.target.value = ''; }} />
          </PanelSection>

          {/* Approvals */}
          <PanelSection title="Approvals">
            <div className="p-3 space-y-2">
              {selected.approvals.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-1">
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-slate-600">{a.role === 'GENERAL_MANAGER' ? 'General Manager' : a.role}</span>
                    <span className="text-[11px] text-slate-500 truncate">{a.approverName || '—'}</span>
                  </div>
                  {a.status === 'APPROVED' && <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center ml-2"><CheckCircle2 className="w-3 h-3 text-white" /></span>}
                  {a.status === 'PENDING' && <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center ml-2"><Clock className="w-3 h-3 text-white" /></span>}
                  {a.status === 'CANCELLED' && <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center ml-2"><XCircle className="w-3 h-3 text-white" /></span>}
                  {a.status === 'SENT_BACK' && <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center ml-2"><RotateCcw className="w-3 h-3 text-white" /></span>}
                </div>
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

      {/* Save and Close success */}
      {showSuccessModal === 'save' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-[#17293E] text-lg font-bold mb-2">Progress Saved!</h2>
            <p className="text-slate-500 text-sm mb-6">Your work has been saved. You can continue later.</p>
            <button onClick={() => { setShowSuccessModal(null); setSelected(null); }}
              className="w-full py-3 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>OK</button>
          </div>
        </div>
      )}

      {/* Job Completion success */}
      {showSuccessModal === 'complete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-[#17293E] text-lg font-bold mb-2">Job Completed!</h2>
            <p className="text-slate-500 text-sm mb-6">The termination of lease agreement process has been completed successfully.</p>
            <button onClick={() => { setShowSuccessModal(null); router.push(ROUTES.HOME); }}
              className="w-full py-3 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #7CB518, #6aa315)' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Form7LegalOfficerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"><Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" /></div>}>
      <Form7LegalOfficerContent />
    </Suspense>
  );
}