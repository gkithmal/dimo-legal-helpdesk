'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Home, Lightbulb, Search, Settings, User,
  FileText, Paperclip, CheckCircle2, X, Upload,
  Eye, Trash2, Send, AlertCircle, ArrowLeft, Loader2,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';

type FormMode = 'new' | 'view' | 'resubmit' | 'draft';
interface AttachedFile { id: string; name: string; size: number; file?: File; fileUrl?: string; }
interface CommentEntry { id: number; author: string; text: string; time: string; }

const COMPANY_CODES = ['DM01 - DIMO PLC', 'DM02 - DIMO Subsidiaries', 'DM03 - DIMO Holdings'];
const SAP_COST_CENTERS = ['000003999', '000004001', '000004002', '000004003', '000004004'];
const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' }, { label: 'Approvals' }, { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' }, { label: 'Legal GM\nApproval' }, { label: 'Ready\nto Collect' },
];

function sanitizeText(val: string): string { return val.replace(/[<>]/g, ''); }

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function TextField({ value, onChange, placeholder, disabled = false }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(sanitizeText(e.target.value))} placeholder={placeholder} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150 ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`} />
  );
}

function NumberField({ value, onChange, placeholder, disabled = false }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <input type="text" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150 ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`} />
  );
}

function DateField({ value, onChange, disabled = false }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <DatePicker value={value} onChange={onChange} disabled={disabled} />
  );
}

function TextAreaField({ value, onChange, placeholder, rows = 3, disabled = false }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; disabled?: boolean }) {
  return (
    <textarea value={value} onChange={(e) => onChange(sanitizeText(e.target.value))} placeholder={placeholder} rows={rows} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm resize-none transition-all ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`} />
  );
}

function SelectField({ value, onChange, options, placeholder, disabled = false }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-sm text-left transition-all ${disabled ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed' : open ? 'bg-white border-[#1A438A] shadow-sm ring-2 ring-[#1A438A]/10' : 'bg-white border-slate-200 text-slate-700 hover:border-[#4686B7] cursor-pointer'}`}>
        <span className={value ? 'text-slate-800 font-medium' : 'text-slate-400'}>{value || placeholder || 'Select...'}</span>
        <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180 text-[#1A438A]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
            {options.map((opt) => (
              <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors first:rounded-t-xl last:rounded-b-xl ${value === opt ? 'bg-[#1A438A] text-white font-medium' : 'text-slate-700 hover:bg-[#EEF3F8] hover:text-[#1A438A]'}`}>
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PanelSection({ title, action, children, overflowVisible = false }: { title: string; action?: React.ReactNode; children: React.ReactNode; overflowVisible?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm ${overflowVisible ? 'overflow-visible' : 'overflow-hidden'}`}>
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

function Form7Content() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('id');
  const mode: FormMode = (searchParams.get('mode') as FormMode) || 'new';

  const [showSignOut, setShowSignOut] = useState(false);
  const [agreementRefNo, setAgreementRefNo] = useState('');
  const [agreementDate, setAgreementDate] = useState('');
  const [initiatorContact, setInitiatorContact] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [sapCostCenter, setSapCostCenter] = useState('');
  const [assessmentAddress, setAssessmentAddress] = useState('');
  const [ownerNames, setOwnerNames] = useState('');
  const [effectiveTerminationDate, setEffectiveTerminationDate] = useState('');
  const [earlyTerminationCharges, setEarlyTerminationCharges] = useState('');
  const [refundableDeposit, setRefundableDeposit] = useState('');
  const [paymentDate1, setPaymentDate1] = useState('');
  const [advanceRentals, setAdvanceRentals] = useState('');
  const [paymentDate2, setPaymentDate2] = useState('');
  const [deductions, setDeductions] = useState('');
  const [facilityPayments, setFacilityPayments] = useState('');
  const [penalty, setPenalty] = useState('');
  const [amountDueByDimo, setAmountDueByDimo] = useState('');
  const [balanceToRecover, setBalanceToRecover] = useState('');
  const [dateInformedToLessee, setDateInformedToLessee] = useState('');
  const [remarks, setRemarks] = useState('');
  const [bumApprover, setBumApprover] = useState('');
  const [gmApprover, setGmApprover] = useState('');
  const [bumUsers, setBumUsers] = useState<{ name: string; email: string }[]>([]);
  const [gmUsers, setGmUsers] = useState<{ name: string; email: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [requiredDocs, setRequiredDocs] = useState<{ id: string; label: string; isRequired: boolean; file: AttachedFile | null }[]>([]);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructionsText, setInstructionsText] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successId, setSuccessId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [isViewMode, setIsViewMode] = useState(false);
  const [loadingSubmission, setLoadingSubmission] = useState(false);
  const [submissionNo, setSubmissionNo] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState('');
  const [showBackModal, setShowBackModal] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const isReadOnly = isViewMode;
  const isTerminalStatus = ['COMPLETED', 'CANCELLED'].includes(submissionStatus);

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => {
      const users = data.data || [];
      setBumUsers(users.filter((u: any) => u.role === 'BUM').map((u: any) => ({ name: u.name, email: u.email })));
      setGmUsers(users.filter((u: any) => u.role === 'GENERAL_MANAGER').map((u: any) => ({ name: u.name, email: u.email })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/forms?formId=7').then(r => r.json()).then(data => {
      if (data.success) {
        if (data.data?.instructions) setInstructionsText(data.data.instructions);
        if (data.data?.docs?.length > 0) {
          setRequiredDocs(data.data.docs.map((d: any) => ({ id: d.id, label: d.label, isRequired: d.isRequired ?? true, file: null })));
          return;
        }
      }
      if (!data.success || !data.data?.docs?.length) {
        setRequiredDocs([
          { id: 'doc1', label: 'Artwork', isRequired: true, file: null },
          { id: 'doc2', label: 'Other', isRequired: false, file: null },
        ]);
      }
    }).catch(() => {
      setRequiredDocs([
        { id: 'doc1', label: 'Artwork', isRequired: true, file: null },
        { id: 'doc2', label: 'Other', isRequired: false, file: null },
      ]);
    });
  }, []);

  useEffect(() => {
    if (submissionId && (mode === 'view' || mode === 'resubmit' || mode === 'draft')) {
      setLoadingSubmission(true);
      setIsViewMode(mode === 'view');
      fetch(`/api/submissions/${submissionId}`).then(r => r.json()).then(data => {
        if (data.success) {
          const s = data.data;
          setSubmissionNo(s.submissionNo || '');
          setAgreementRefNo(s.f7AgreementRefNo || '');
          setAgreementDate(s.f7AgreementDate || '');
          setInitiatorContact(s.f7InitiatorContact || '');
          setCompanyCode(s.companyCode || '');
          setSapCostCenter(s.sapCostCenter || '');
          setAssessmentAddress(s.f7AssessmentAddress || '');
          setOwnerNames(s.f7OwnerNames || '');
          setEffectiveTerminationDate(s.f7EffectiveTerminationDate || '');
          setEarlyTerminationCharges(s.f7EarlyTerminationCharges || '');
          setRefundableDeposit(s.f7RefundableDeposit || '');
          setPaymentDate1(s.f7PaymentDate1 || '');
          setAdvanceRentals(s.f7AdvanceRentals || '');
          setPaymentDate2(s.f7PaymentDate2 || '');
          setDeductions(s.f7Deductions || '');
          setFacilityPayments(s.f7FacilityPayments || '');
          setPenalty(s.f7Penalty || '');
          setAmountDueByDimo(s.f7AmountDueByDimo || '');
          setBalanceToRecover(s.f7BalanceToRecover || '');
          setDateInformedToLessee(s.f7DateInformedToLessee || '');
          setRemarks(s.remarks || '');
          setSubmissionStatus(s.status || '');
          if (s.comments?.length) {
            setComments(s.comments.map((c: any, i: number) => ({ id: i, author: c.authorName, text: c.text, time: new Date(c.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })));
          }
          if (s.documents?.length && mode === 'view') {
            setRequiredDocs(prev => prev.map(doc => {
              const existing = s.documents.find((d: any) => d.label === doc.label && d.fileUrl);
              if (existing) return { ...doc, file: { id: existing.id, name: existing.label, size: 0, file: null as any, fileUrl: existing.fileUrl } };
              return doc;
            }));
          }
        }
      }).finally(() => setLoadingSubmission(false));
    }
  }, [submissionId, mode]);

  useEffect(() => {
    if (searchQuery.length < 3) { setSearchResults([]); setShowDropdown(false); return; }
    setSearchResults([
      { refNo: `${searchQuery}785`, name: 'Techno Support Solutions (Pvt) Ltd', date: '01/08/2025' },
      { refNo: `${searchQuery}787`, name: 'Olivia Perera', date: '01/08/2025' },
      { refNo: `${searchQuery}788`, name: 'A.B.C.Silva', date: '01/08/2025' },
    ]);
    setShowDropdown(true);
  }, [searchQuery]);

  const selectAgreement = (r: any) => { setAgreementRefNo(r.refNo); setAgreementDate(r.date); setOwnerNames(r.name); setSearchQuery(r.refNo); setShowDropdown(false); };

  const handleFileUpload = async (docId: string, file: File) => {
    setUploading(p => ({ ...p, [docId]: true }));
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('folder', `form7-${session?.user?.email || 'unknown'}`);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setRequiredDocs(prev => prev.map(d => d.id === docId ? { ...d, file: { id: docId, name: file.name, size: file.size, file, fileUrl: data.url } } : d));
        if (isViewMode && submissionId) {
          const docLabel = requiredDocs.find(d => d.id === docId)?.label || docId;
          await fetch(`/api/submissions/${submissionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addDocument: { label: docLabel, type: 'required', fileUrl: data.url } }) });
        }
      }
    } catch { /* silent */ }
    setUploading(p => ({ ...p, [docId]: false }));
  };

  const postComment = () => {
    if (!comment.trim()) return;
    setComments(p => [...p, { id: Date.now(), author: session?.user?.name || 'You', text: comment.trim(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }]);
    setComment('');
  };

  const validate = () => {
    const e: string[] = [];
    if (!agreementRefNo.trim()) e.push('agreement reference');
    if (!dateInformedToLessee) e.push('date informed');
    if (!bumApprover) e.push('bum');
    if (!gmApprover) e.push('general manager');
    return e;
  };
  const errors = submitted ? validate() : [];
  const hasError = (f: string) => errors.some(e => e.includes(f.toLowerCase()));

  const handleSubmit = async (asDraft = false) => {
    if (!asDraft && validate().length > 0) { setSubmitted(true); return; }
    setSubmitting(true);
    try {
      const bumUser = bumUsers.find(u => u.name === bumApprover || u.email === bumApprover);
      const gmUser = gmUsers.find(u => u.name === gmApprover || u.email === gmApprover);
      const docPayload = requiredDocs.filter(d => d.file).map(d => ({ label: d.label, type: 'required', fileUrl: d.file?.fileUrl || null }));
      const payload = {
        formId: 7, formName: 'Termination of Lease Agreement', companyCode, title: 'Termination of Lease Agreement',
        sapCostCenter, scopeOfAgreement: `Termination of lease agreement ref: ${agreementRefNo}`,
        term: effectiveTerminationDate || 'N/A', value: amountDueByDimo || '0', remarks,
        initiatorId: session?.user?.id, status: asDraft ? 'DRAFT' : 'PENDING_APPROVAL',
        parties: [{ type: 'Individual', name: ownerNames || 'N/A' }], documents: docPayload,
        bumId: bumUser?.email || bumApprover, gmId: gmUser?.email || gmApprover,
        f7AgreementRefNo: agreementRefNo, f7AgreementDate: agreementDate, f7InitiatorContact: initiatorContact,
        f7AssessmentAddress: assessmentAddress, f7OwnerNames: ownerNames, f7EffectiveTerminationDate: effectiveTerminationDate,
        f7EarlyTerminationCharges: earlyTerminationCharges, f7RefundableDeposit: refundableDeposit,
        f7PaymentDate1: paymentDate1, f7AdvanceRentals: advanceRentals, f7PaymentDate2: paymentDate2,
        f7Deductions: deductions, f7FacilityPayments: facilityPayments, f7Penalty: penalty,
        f7AmountDueByDimo: amountDueByDimo, f7BalanceToRecover: balanceToRecover, f7DateInformedToLessee: dateInformedToLessee,
        ...(mode === 'resubmit' && submissionId && { parentId: submissionId, isResubmission: true }),
      };
      const isDraftEdit = mode === 'draft' && submissionId;
      const res = await fetch(isDraftEdit ? `/api/submissions/${submissionId}` : '/api/submissions', {
        method: isDraftEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success || data.data) {
        const sub = data.data;
        if (!asDraft && sub?.id) {
          if (bumUser) await fetch(`/api/submissions/${sub.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'BUM', action: 'PENDING', approverName: bumUser.name, approverEmail: bumUser.email }) });
          if (gmUser) await fetch(`/api/submissions/${sub.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'GENERAL_MANAGER', action: 'PENDING', approverName: gmUser.name, approverEmail: gmUser.email }) });
          if (comment.trim()) await fetch(`/api/submissions/${sub.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: comment.trim(), authorName: session?.user?.name, authorRole: 'INITIATOR' }) });
        }
        if (asDraft) { router.push(ROUTES.HOME); }
        else if (mode === 'resubmit') { if (submissionId) await fetch(`/api/submissions/${submissionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'RESUBMITTED' }) }); router.push(ROUTES.HOME); }
        else { setSuccessId(sub?.submissionNo || ''); setShowSuccess(true); }
      }
    } catch { /* silent */ }
    setSubmitting(false);
  };

  if (status === 'loading' || loadingSubmission) return <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"><Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" /></div>;

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
          <button onClick={() => router.push('/home')} className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Home className="w-[18px] h-[18px]" /></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Lightbulb className="w-[18px] h-[18px]" /></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Search className="w-[18px] h-[18px]" /></button>
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <button onClick={() => router.push('/settings')} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><Settings className="w-[18px] h-[18px]" /></button>
          <button onClick={() => setShowSignOut(true)} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><User className="w-[18px] h-[18px]" /></button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex gap-5 p-5 overflow-auto min-w-0">

        {/* Left: Form */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Header banner */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><FileText className="w-5 h-5 text-white" /></div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">Termination of Lease Agreement</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono tracking-wide">16/FM/1641/07/07</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {mode !== 'new' && (
                  <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border backdrop-blur-sm ${mode === 'view' ? 'bg-blue-500/20 text-blue-200 border-blue-400/30' : 'bg-orange-500/20 text-orange-200 border-orange-400/30'}`}>
                    {mode === 'view' ? 'View Only' : 'Resubmission'}
                  </span>
                )}
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 7</div>
              </div>
            </div>
          </div>

          {/* Form Body */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 rounded-full bg-[#1A438A]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Submission Details</span>
              </div>
              {/* Agreement Search */}
              <div className="relative w-60">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} disabled={isReadOnly} placeholder="Search By Reference No"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#1A438A] focus:ring-1 focus:ring-[#1A438A]/20 disabled:opacity-60" />
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                    {searchResults.map((r, i) => (
                      <button key={i} onClick={() => selectAgreement(r)} className="w-full text-left px-3 py-2.5 hover:bg-[#EEF3F8] transition-colors border-b border-slate-100 last:border-0">
                        <div className="text-xs font-bold text-[#1A438A]">{r.name}</div>
                        <div className="text-[10px] text-slate-500">REF No <span className="text-[#1A438A] font-bold">{r.refNo}</span></div>
                        <div className="text-[10px] text-slate-400">{r.date}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-6 space-y-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <div>
                  <FieldLabel required>Agreement Reference No</FieldLabel>
                  <TextField value={agreementRefNo} onChange={setAgreementRefNo} placeholder="Enter agreement ref. no..." disabled={isReadOnly} />
                  {hasError('agreement reference') && <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1"><AlertCircle className="w-3 h-3" />Required</p>}
                </div>
                <div>
                  <FieldLabel required>Agreement Date</FieldLabel>
                  <DateField value={agreementDate} onChange={setAgreementDate} disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel required>Initiated by</FieldLabel>
                  <div className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 font-medium">{session?.user?.name || '—'}</div>
                </div>
                <div>
                  <FieldLabel>Initiator's Contact No</FieldLabel>
                  <TextField value={initiatorContact} onChange={setInitiatorContact} placeholder="Contact number" disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel required>Company Code</FieldLabel>
                  <SelectField value={companyCode} onChange={setCompanyCode} options={COMPANY_CODES} placeholder="Select company..." disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel required>SAP Cost Centre</FieldLabel>
                  <SelectField value={sapCostCenter} onChange={setSapCostCenter} options={SAP_COST_CENTERS} placeholder="Select cost centre..." disabled={isReadOnly} />
                </div>
              </div>

              <div>
                <FieldLabel>Assessment No./Address</FieldLabel>
                <TextAreaField value={assessmentAddress} onChange={setAssessmentAddress} placeholder="Enter assessment number or address..." rows={2} disabled={isReadOnly} />
              </div>

              <div>
                <FieldLabel>Names of the Owner/s</FieldLabel>
                <TextAreaField value={ownerNames} onChange={setOwnerNames} placeholder="Enter owner names..." rows={2} disabled={isReadOnly} />
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <div>
                  <FieldLabel>Effective Termination Date</FieldLabel>
                  <DateField value={effectiveTerminationDate} onChange={setEffectiveTerminationDate} disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel>Early Termination Charges (LKR)</FieldLabel>
                  <NumberField value={earlyTerminationCharges} onChange={setEarlyTerminationCharges} placeholder="0.00" disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel>Refundable Deposit (LKR)</FieldLabel>
                  <NumberField value={refundableDeposit} onChange={setRefundableDeposit} placeholder="0.00" disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel>Payment Date</FieldLabel>
                  <DateField value={paymentDate1} onChange={setPaymentDate1} disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel>Advance Rentals (LKR)</FieldLabel>
                  <NumberField value={advanceRentals} onChange={setAdvanceRentals} placeholder="0.00" disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel>Payment Date</FieldLabel>
                  <DateField value={paymentDate2} onChange={setPaymentDate2} disabled={isReadOnly} />
                </div>
              </div>

              <div>
                <FieldLabel>Deductions</FieldLabel>
                <TextAreaField value={deductions} onChange={setDeductions} placeholder="List any deductions..." rows={2} disabled={isReadOnly} />
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <div>
                  <FieldLabel>Facility Payments Due (LKR)</FieldLabel>
                  <NumberField value={facilityPayments} onChange={setFacilityPayments} placeholder="0.00" disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel>Penalty if Applicable (LKR)</FieldLabel>
                  <NumberField value={penalty} onChange={setPenalty} placeholder="0.00" disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel>Amount Due by DIMO (LKR)</FieldLabel>
                  <NumberField value={amountDueByDimo} onChange={setAmountDueByDimo} placeholder="0.00" disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel>Balance to be Recovered from Owner/s (LKR)</FieldLabel>
                  <NumberField value={balanceToRecover} onChange={setBalanceToRecover} placeholder="0.00" disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel required>Date Informed to Lessee</FieldLabel>
                  <DateField value={dateInformedToLessee} onChange={setDateInformedToLessee} disabled={isReadOnly} />
                  {hasError('date informed') && <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1"><AlertCircle className="w-3 h-3" />Required</p>}
                </div>
              </div>

              <div>
                <FieldLabel>Remarks</FieldLabel>
                <TextAreaField value={remarks} onChange={setRemarks} placeholder="Any additional remarks..." rows={3} disabled={isReadOnly} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-[296px] flex-shrink-0 flex flex-col gap-4">

          {/* Workflow Tracker */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-5">
              <div />
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Submission No.</p>
                <p className="text-[#1A438A] font-bold text-sm font-mono">{submissionNo || '—'}</p>
              </div>
            </div>
            <div className="relative flex justify-between items-start">
              <div className="absolute top-[9px] left-[9px] right-[9px] h-px bg-slate-200" />
              <div className="absolute top-[9px] left-[9px] h-px bg-[#1A438A] transition-all" style={{ width: '0%' }} />
              {WORKFLOW_STEPS.map((step, i) => (
                <div key={i} className="relative flex flex-col items-center z-10" style={{ width: `${100 / WORKFLOW_STEPS.length}%` }}>
                  <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all shadow-sm ${i === 0 ? 'bg-[#1A438A] border-[#1A438A] ring-4 ring-[#1A438A]/15' : 'bg-white border-slate-300'}`}>
                    {i === 0 && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <p className="text-[9px] text-center leading-tight whitespace-pre-line mt-1.5 text-slate-500 font-medium px-0.5">{step.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Required Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
              <button onClick={() => setShowInstructions(true)} className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>Instructions</button>
            </div>
            <div className="p-3 space-y-1.5 min-h-[72px]">
              {requiredDocs.map((doc, i) => {
                const hasFile = !!doc.file;
                return (
                  <div key={doc.id} className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all ${hasFile ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                    <div className="flex-1 mr-2 min-w-0">
                      <span className="text-[11px] text-slate-600 leading-tight flex items-center gap-1 flex-wrap"><span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{doc.label}{!doc.isRequired&&<span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">Optional</span>}</span>
                      {hasFile && <span className="text-[10px] text-emerald-600 font-semibold">{doc.file!.name}</span>}
                    </div>
                    {uploading[doc.id] ? <Loader2 className="w-4 h-4 text-[#1A438A] animate-spin flex-shrink-0" />
                      : !isReadOnly ? (
                        hasFile ? (
                          <div className="flex gap-1">
                            <button onClick={() => doc.file?.fileUrl && window.open(doc.file.fileUrl, '_blank')} className="w-6 h-6 rounded-lg bg-[#EEF3F8] flex items-center justify-center hover:bg-[#d9e4f0] flex-shrink-0"><Eye className="w-3 h-3 text-[#1A438A]" /></button>
                            <button onClick={() => setRequiredDocs(p => p.map(d => d.id === doc.id ? { ...d, file: null } : d))} className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100 flex-shrink-0"><Trash2 className="w-3 h-3 text-red-500" /></button>
                          </div>
                        ) : <button onClick={() => fileInputRefs.current[doc.id]?.click()} className="flex-shrink-0"><Paperclip className="w-4 h-4 text-[#1183B7] hover:text-[#1A438A]" /></button>
                      ) : hasFile ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      : !isTerminalStatus ? <button onClick={() => fileInputRefs.current[doc.id]?.click()} className="flex-shrink-0"><Paperclip className="w-4 h-4 text-[#1183B7] hover:text-[#1A438A]" /></button>
                      : null}
                    <input ref={el => { fileInputRefs.current[doc.id] = el; }} type="file" accept=".pdf,.doc,.docx,.jpg,.png" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(doc.id, f); e.target.value = ''; }} />
                  </div>
                );
              })}
            </div>
            <div className="border-t border-slate-100">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/80">
                <div className="w-0.5 h-3.5 rounded-full bg-[#1A438A]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#17293E]">Documents by Legal Dept.</span>
              </div>
              <div className="px-3 py-2"><p className="text-[11px] text-slate-400 italic px-1">No documents added yet</p></div>
            </div>
          </div>

          {/* Approvals */}
          <PanelSection title="Approvals" overflowVisible>
            <div className="p-4 space-y-3.5">
              <div>
                <FieldLabel required>BUM</FieldLabel>
                <SelectField value={bumApprover} onChange={setBumApprover} options={bumUsers.map(u => u.name)} placeholder="Select BUM..." disabled={isReadOnly} />
                {hasError('bum') && <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1"><AlertCircle className="w-3 h-3" />BUM is required</p>}
              </div>
              <div>
                <FieldLabel required>General Manager</FieldLabel>
                <SelectField value={gmApprover} onChange={setGmApprover} options={gmUsers.map(u => u.name)} placeholder="Select General Manager..." disabled={isReadOnly} />
                {hasError('general manager') && <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1"><AlertCircle className="w-3 h-3" />General Manager is required</p>}
              </div>
            </div>
          </PanelSection>

          {/* Comments */}
          <PanelSection title="Comments">
            <div className="p-3">
              {comments.length > 0 && (
                <div className="mb-3 space-y-2 max-h-36 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px] font-bold text-[#1A438A]">{c.author}</span>
                        <span className="text-[10px] text-slate-400">{c.time}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${comment ? 'border-[#1A438A] bg-white ring-2 ring-[#1A438A]/10' : 'border-slate-200 bg-slate-50/80'}`}>
                <input type="text" value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && comment.trim()) postComment(); }}
                  placeholder="Post your comment here" disabled={isReadOnly}
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed" />
                <button onClick={postComment} disabled={isReadOnly || !comment.trim()}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </PanelSection>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button onClick={() => setShowBackModal(true)} disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all duration-200 disabled:opacity-50">
              <ArrowLeft className="w-4 h-4" />Back
            </button>
            {!isReadOnly && mode !== 'resubmit' && (
              <button onClick={() => handleSubmit(true)} disabled={submitting}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all duration-200 active:scale-95 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                {submitting ? 'Saving...' : 'Save Draft'}
              </button>
            )}
            {!isReadOnly && (
              <button onClick={() => { setSubmitted(true); handleSubmit(false); }} disabled={submitting}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all duration-200 active:scale-95 shadow-lg shadow-[#AC9C2F]/25 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)' }}>
                {submitting ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Submitting...</span> : mode === 'resubmit' ? 'Resubmit' : 'Submit'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Back Modal */}
      {showBackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBackModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4"><AlertCircle className="w-6 h-6 text-amber-500" /></div>
            <h3 className="text-[#17293E] font-bold text-base mb-1">Leave this form?</h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">Your progress will be lost if you go back without saving.</p>
            <div className="flex flex-col gap-2 w-full">
              <button onClick={() => handleSubmit(true)} disabled={submitting} className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Save as Draft & Go Back</button>
              <button onClick={() => router.push(ROUTES.HOME)} disabled={submitting} className="w-full py-2.5 rounded-xl font-bold text-sm border-2 border-red-200 text-red-500 hover:bg-red-50 transition-all">Discard & Go Back</button>
              <button onClick={() => setShowBackModal(false)} disabled={submitting} className="w-full py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-all">Cancel, Stay Here</button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions Modal */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowInstructions(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[82vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white font-bold text-base">Instructions</span>
              <button onClick={() => setShowInstructions(false)} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {instructionsText
                ? <p className="text-sm text-slate-600 whitespace-pre-wrap">{instructionsText}</p>
                : <p className="text-sm text-slate-400 italic">No instructions configured yet.</p>
              }
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => setShowInstructions(false)} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)' }}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-green-500/30" style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-[#17293E] text-xl font-bold mb-2">Successfully Submitted!</h2>
            <p className="text-slate-500 text-sm mb-4 leading-relaxed">Your Termination of Lease Agreement request has been submitted and sent for parallel approval to BUM and General Manager.</p>
            <div className="w-full bg-[#f0f4f9] rounded-xl px-6 py-3 mb-6">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Submission No.</p>
              <p className="text-[#1A438A] font-bold text-lg font-mono">{successId || '—'}</p>
            </div>
            <button onClick={() => { setShowSuccess(false); router.push(ROUTES.HOME); }} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95 shadow-lg shadow-[#1A438A]/20" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Return to Home</button>
          </div>
        </div>
      )}

      {/* Sign Out Modal */}
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

export default function Form7Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"><Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" /></div>}>
      <Form7Content />
    </Suspense>
  );
}