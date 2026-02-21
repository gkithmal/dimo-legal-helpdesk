'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Home, Lightbulb, Search, Settings, User,
  FileText, Paperclip, CheckCircle2, X, Upload, File,
  Eye, Trash2, Send, AlertCircle, ArrowLeft, Loader2,
  ThumbsUp, ThumbsDown,
} from 'lucide-react';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';

// ─── Types ────────────────────────────────────────────────────────────────────

type FormMode = 'view';

interface Party       { type: string; name: string; }
interface AttachedFile { id: string; name: string; size: number; file: File; fileUrl?: string; }
interface CommentEntry { id: number; author: string; text: string; time: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANY_CODES = [
  'DIMO - Dialog Axiata PLC', 'DMSL - Dialog Mobile Solutions Ltd',
  'DTSL - Dialog Television (Pvt) Ltd', 'DPSL - Dialog Platforms (Pvt) Ltd',
  'DBSL - Dialog Business Solutions Ltd',
];
const CONTRACT_TITLES = [
  'Service Agreement', 'Maintenance Agreement', 'Non-Disclosure Agreement (NDA)',
  'Memorandum of Understanding (MOU)', 'Supply Agreement', 'Distribution Agreement',
  'Software License Agreement', 'Consultancy Agreement', 'Employment Agreement', 'Lease Agreement',
];
const SAP_COST_CENTERS = [
  '000003999 - IT Department', '000004001 - Finance Department',
  '000004002 - HR Department', '000004003 - Operations Department',
  '000004004 - Legal Department', '000004005 - Marketing Department',
  '000004006 - Technology Division',
];
const REQUIRED_DOCS: Record<string, string[]> = {
  Company:             ['Certificate of Incorporation', 'Form 1 / Form 40 (Directors)', 'VAT Registration Certificate', 'Board Resolution'],
  Partnership:         ['Partnership Agreement', 'Business Registration Certificate', 'NIC copies of Partners'],
  'Sole proprietorship': ['Business Registration Certificate', 'NIC copy of Owner'],
  Individual:          ['NIC copy', 'Proof of Address'],
};
const WORKFLOW_STEPS = [
  { label: 'Submitted' }, { label: 'BUM/FBP/\nCluster' },
  { label: 'Legal GM' }, { label: 'Legal\nOfficer' }, { label: 'Completed' },
];
const INSTRUCTIONS_TEXT = [
  'Please ensure all required documents are attached before submitting the form.',
  'All parties must be clearly identified with their correct legal names.',
  'The scope of agreement must be detailed and unambiguous.',
  'Ensure the term and renewal conditions are explicitly stated.',
  'Attach all supporting documents as per the required documents list.',
  'The SAP cost center must correspond to the correct department.',
];

function sanitizeText(v: string) { return v.replace(/[<>]/g, ''); }
function formatBytes(b: number) {
  if (b === 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
function generateSubmissionId() {
  const now = new Date();
  return `LH-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
}

// ─── Field Components ─────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
      {children}{required && <span className="text-red-400 ml-1">*</span>}
    </label>
  );
}
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{message}</p>;
}

function ComboBox({ value, onChange, options, placeholder, disabled, hasError, dropUp }: {
  value: string; onChange: (v: string) => void; options: string[];
  placeholder?: string; disabled?: boolean; hasError?: boolean; dropUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <input type="text" value={open ? query : value} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => { setQuery(''); setOpen(true); }} placeholder={placeholder} disabled={disabled}
        className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150 ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' : hasError ? 'bg-white border-red-400 ring-2 ring-red-400/10 focus:outline-none' : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`} />
      {open && filtered.length > 0 && (
        <div className={`absolute z-30 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <div className="max-h-44 overflow-y-auto">
            {filtered.map(o => (
              <button key={o} onMouseDown={() => { onChange(o); setQuery(''); setOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#EEF3F8] transition-colors text-slate-700">{o}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SelectField({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150 appearance-none ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function PartyNameField({ value, onChange, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={e => onChange(sanitizeText(e.target.value))} placeholder={placeholder} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150 ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`} />
  );
}

function TextAreaField({ value, onChange, placeholder, rows = 3, disabled, hasError, hint }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  rows?: number; disabled?: boolean; hasError?: boolean; hint?: string;
}) {
  return (
    <div>
      <textarea value={value} onChange={e => onChange(sanitizeText(e.target.value))} placeholder={placeholder} rows={rows} disabled={disabled}
        className={`w-full px-3.5 py-2.5 rounded-lg border text-sm resize-none transition-all duration-150 ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' : hasError ? 'bg-white border-red-400 ring-2 ring-red-400/10 focus:outline-none' : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`} />
      {hint && <p className="text-[11px] text-slate-400 mt-1 italic">{hint}</p>}
    </div>
  );
}

function LKRField({ value, onChange, disabled, hasError }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; hasError?: boolean;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    onChange(raw);
  };
  const handleBlur = () => {
    const stripped = value.replace(/,/g, '');
    const num = parseFloat(stripped);
    if (!isNaN(num)) {
      const intPart = Math.floor(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const cents = stripped.includes('.') ? stripped.split('.')[1].padEnd(2,'0').slice(0,2) : '00';
      onChange(`${intPart}.${cents}`);
    }
  };
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 select-none pointer-events-none">LKR</span>
      <input type="text" value={value} onChange={handleChange} onBlur={handleBlur} placeholder="0.00" disabled={disabled}
        className={`w-full pl-12 pr-3.5 py-2.5 rounded-lg border text-sm font-mono transition-all duration-150 ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' : hasError ? 'bg-white border-red-400 ring-2 ring-red-400/10 focus:outline-none' : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`} />
    </div>
  );
}

function TextField({ value, onChange, placeholder, disabled = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={e => onChange(sanitizeText(e.target.value))} placeholder={placeholder} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150 ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`} />
  );
}

function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="h-px flex-1 bg-slate-100" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{children}</span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Upload Popup ─────────────────────────────────────────────────────────────

function UploadPopup({ docLabel, files, onAdd, onRemove, onClose, onConfirm, canRemove = true }: {
  docLabel: string; files: AttachedFile[];
  onAdd: (f: AttachedFile[]) => void; onRemove: (id: string) => void;
  onClose: () => void; onConfirm?: () => void; canRemove?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    onAdd(Array.from(incoming).map(f => ({ id: `${Date.now()}-${Math.random()}`, name: f.name, size: f.size, file: f })));
  };
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Paperclip className="w-4 h-4 text-white" /></div>
            <div><p className="text-white font-bold text-sm">Attach Documents</p><p className="text-white/60 text-[11px] mt-0.5 truncate max-w-[280px]">{docLabel}</p></div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        {canRemove && (
          <div className="p-5">
            <div onDrop={onDrop} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${dragging ? 'border-[#1A438A] bg-[#EEF3F8] scale-[1.01]' : 'border-slate-200 hover:border-[#4686B7] hover:bg-slate-50'}`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 ${dragging ? 'bg-[#1A438A]' : 'bg-slate-100'}`}>
                <Upload className={`w-6 h-6 ${dragging ? 'text-white' : 'text-slate-400'}`} />
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-1">{dragging ? 'Drop files here' : 'Drag & drop files here'}</p>
              <p className="text-[11px] text-slate-400">or click to browse from your computer</p>
              <input ref={inputRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
            </div>
          </div>
        )}
        {files.length > 0 && (
          <div className="px-5 pb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Attached ({files.length})</p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#EEF3F8] flex items-center justify-center flex-shrink-0"><File className="w-4 h-4 text-[#1A438A]" /></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-700 truncate">{f.name}</p><p className="text-[11px] text-slate-400">{formatBytes(f.size)}</p></div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { const url = f.fileUrl || URL.createObjectURL(f.file); window.open(url,'_blank'); }} className="w-7 h-7 rounded-lg hover:bg-[#EEF3F8] flex items-center justify-center text-slate-400 hover:text-[#1A438A]"><Eye className="w-3.5 h-3.5" /></button>
                    {canRemove && <button onClick={() => onRemove(f.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="p-5 pt-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all">Cancel</button>
          <button onClick={() => { if (onConfirm) onConfirm(); else onClose(); }} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            Done {files.length > 0 && `(${files.length} file${files.length > 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Content ────────────────────────────────────────────────────────

function SpecialApproverForm1Content() {
  const searchParams  = useSearchParams();
  const submissionId  = searchParams.get('id');
  const router        = useRouter();
  const { data: session } = useSession();

  const currentUserName = session?.user?.name ?? 'User';
  const firstName       = currentUserName.split(' ')[0];
  const avatarLetter    = firstName.charAt(0).toUpperCase();

  // ── Form state (all read-only for special approver) ──
  const [submissionNo,      setSubmissionNo]      = useState('');
  const [submissionStatus,  setSubmissionStatus]  = useState('');
  const [companyCode,       setCompanyCode]       = useState('');
  const [title,             setTitle]             = useState('');
  const [parties,           setParties]           = useState<Party[]>([
    { type: '', name: '' }, { type: '', name: '' }, { type: '', name: '' },
    { type: '', name: '' }, { type: '', name: '' },
  ]);
  const [sapCostCenter,     setSapCostCenter]     = useState('');
  const [scopeOfAgreement,  setScopeOfAgreement]  = useState('');
  const [term,              setTerm]              = useState('');
  const [lkrValue,          setLkrValue]          = useState('');
  const [remarks,           setRemarks]           = useState('');
  const [initiatorComments, setInitiatorComments] = useState('');
  const [legalOfficer,      setLegalOfficer]      = useState('');
  const [bum,               setBum]               = useState('');
  const [fbp,               setFbp]               = useState('');
  const [clusterHead,       setClusterHead]       = useState('');
  const [docFiles,          setDocFiles]          = useState<Record<string, AttachedFile[]>>({});
  const [comments,          setComments]          = useState<CommentEntry[]>([]);
  const [commentInput,      setCommentInput]       = useState('');

  // ── Action state ──
  const [isActioning,      setIsActioning]      = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal,  setShowRejectModal]  = useState(false);
  const [rejectReason,     setRejectReason]     = useState('');
  const [showSuccess,      setShowSuccess]      = useState(false);
  const [successMessage,   setSuccessMessage]   = useState('');

  // ── Load submission ──
  useEffect(() => {
    if (!submissionId) return;
    fetch(`/api/submissions/${submissionId}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) return;
        const s = d.data;
        setSubmissionNo(s.submissionNo);
        setSubmissionStatus(s.status ?? '');
        setCompanyCode(s.companyCode ?? '');
        setTitle(s.title ?? '');
        setScopeOfAgreement(s.scopeOfAgreement ?? '');
        setSapCostCenter(s.sapCostCenter ?? '');
        setTerm(s.term ?? '');
        setLkrValue(s.value ?? '');
        setRemarks(s.remarks ?? '');
        setInitiatorComments(s.initiatorComments ?? '');
        if (s.parties?.length) setParties(s.parties.map((p: any) => ({ type: p.type, name: p.name })));
        if (s.approvals?.length) {
          s.approvals.forEach((a: any) => {
            if (a.role === 'BUM')          setBum(a.approverName || '');
            if (a.role === 'FBP')          setFbp(a.approverName || '');
            if (a.role === 'CLUSTER_HEAD') setClusterHead(a.approverName || '');
            if (a.role === 'LEGAL_OFFICER' || a.role === 'LEGAL_GM') setLegalOfficer(a.approverName || '');
          });
        }
        if (s.documents?.length) {
          const loaded: Record<string, AttachedFile[]> = {};
          s.documents.forEach((doc: any) => {
            if (doc.fileUrl) {
              loaded[doc.label] = [{ id: doc.id, name: doc.label, size: 0, file: { name: doc.label, size: 0 } as File, fileUrl: doc.fileUrl }];
            }
          });
          setDocFiles(loaded);
        }
      })
      .catch(err => console.error('Failed to load submission:', err));
  }, [submissionId]);

  // ── Approve ──
  const handleApprove = async () => {
    if (!submissionId) return;
    setIsActioning(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE', role: 'SPECIAL_APPROVER', approverId: session?.user?.id }),
      });
      if (!res.ok) throw new Error('Approval failed');
      setSuccessMessage('You have approved this request.');
      setShowApproveModal(false);
      setShowSuccess(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsActioning(false);
    }
  };

  // ── Reject ──
  const handleReject = async () => {
    if (!submissionId || !rejectReason.trim()) return;
    setIsActioning(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REJECT', role: 'SPECIAL_APPROVER', approverId: session?.user?.id, comments: rejectReason }),
      });
      if (!res.ok) throw new Error('Rejection failed');
      setSuccessMessage('You have rejected this request.');
      setShowRejectModal(false);
      setShowSuccess(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsActioning(false);
    }
  };

  const handlePostComment = () => {
    if (!commentInput.trim()) return;
    setComments(prev => [...prev, { id: Date.now(), author: currentUserName, text: commentInput.trim(), time: 'Just now' }]);
    setCommentInput('');
  };

  // ── Derived ──
  const selectedTypes = Array.from(new Set(parties.map(p => p.type).filter(Boolean)));
  const requiredDocs: { label: string; key: string }[] = [];
  selectedTypes.forEach(type => {
    (REQUIRED_DOCS[type] || []).forEach(doc => {
      if (!requiredDocs.find(d => d.key === doc)) requiredDocs.push({ label: doc, key: doc });
    });
  });

  const statusToStep: Record<string, number> = {
    DRAFT: 0, PENDING_APPROVAL: 1, PENDING_LEGAL_GM: 2,
    PENDING_LEGAL_OFFICER: 3, PENDING_LEGAL_GM_FINAL: 3,
    PENDING_SPECIAL_APPROVER: 3, COMPLETED: 4, CANCELLED: 4, SENT_BACK: 1,
  };
  const currentStep = statusToStep[submissionStatus] ?? 1;
  const isPendingAction = submissionStatus === 'PENDING_SPECIAL_APPROVER';

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* ── Sidebar ── */}
      <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen"
        style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
        <div className="relative mb-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">
            {avatarLetter}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]" />
        </div>
        <div className="text-center">
          <p className="text-white text-[10px] font-semibold truncate w-12 text-center">{firstName}</p>
        </div>
        <div className="w-8 h-px bg-white/10" />
        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          <NotificationBell />
          {[Home, Lightbulb, Search].map((Icon, i) => (
            <button key={i} className="relative w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all">
              <Icon className="w-[18px] h-[18px]" />
            </button>
          ))}
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          {[Settings, User].map((Icon, i) => (
            <button key={i} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all">
              <Icon className="w-[18px] h-[18px]" />
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex gap-5 p-5 overflow-auto min-w-0">

        {/* ── Left: Form (all read-only) ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Header */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><FileText className="w-5 h-5 text-white" /></div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">Contract Review Form</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono tracking-wide">16/FM/1641/07/01</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold px-3 py-1 rounded-full border backdrop-blur-sm bg-purple-500/20 text-purple-200 border-purple-400/30">
                  Special Approver View
                </span>
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 1</div>
              </div>
            </div>
          </div>

          {/* Form Body — read-only */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Submission Details</span>
            </div>
            <div className="px-6 py-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div><FieldLabel>Company Code</FieldLabel><ComboBox value={companyCode} onChange={setCompanyCode} options={COMPANY_CODES} disabled /></div>
                <div><FieldLabel>Title</FieldLabel><ComboBox value={title} onChange={setTitle} options={CONTRACT_TITLES} disabled /></div>
              </div>

              <SectionDivider>Parties to the Agreement</SectionDivider>
              <div className="grid grid-cols-2 gap-4 -mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">Type</p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">Name of the Party</p>
              </div>
              {parties.map((party, i) => (
                <div key={i} className="grid grid-cols-2 gap-4">
                  <SelectField value={party.type} onChange={() => {}} options={['Company','Partnership','Sole proprietorship','Individual']} disabled />
                  <PartyNameField value={party.name} onChange={() => {}} disabled />
                </div>
              ))}

              <SectionDivider>Agreement Details</SectionDivider>
              <div><FieldLabel>SAP Cost Center</FieldLabel><ComboBox value={sapCostCenter} onChange={setSapCostCenter} options={SAP_COST_CENTERS} disabled /></div>
              <div><FieldLabel>Scope of Agreement</FieldLabel><TextAreaField value={scopeOfAgreement} onChange={setScopeOfAgreement} rows={4} disabled /></div>
              <div><FieldLabel>Term</FieldLabel><TextAreaField value={term} onChange={setTerm} rows={3} disabled /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><FieldLabel>Value (LKR)</FieldLabel><LKRField value={lkrValue} onChange={setLkrValue} disabled /></div>
                <div><FieldLabel>Remarks</FieldLabel><TextField value={remarks} onChange={setRemarks} disabled /></div>
              </div>
              <div><FieldLabel>Initiator Comments</FieldLabel><TextField value={initiatorComments} onChange={setInitiatorComments} disabled /></div>
              <div><FieldLabel>Legal Officer</FieldLabel><ComboBox value={legalOfficer} onChange={setLegalOfficer} options={[]} disabled dropUp /></div>
            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-[296px] flex-shrink-0 flex flex-col gap-4">

          {/* Workflow Tracker */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-5">
              <button className="text-[11px] font-semibold text-[#1A438A] hover:underline">View Log</button>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Submission No.</p>
                <p className="text-[#1A438A] font-bold text-sm font-mono">{submissionNo || '—'}</p>
              </div>
            </div>
            <div className="relative flex justify-between items-start">
              <div className="absolute top-[9px] left-[9px] right-[9px] h-px bg-slate-200" />
              <div className="absolute top-[9px] left-[9px] h-px bg-[#1A438A] transition-all"
                style={{ width: `${currentStep === 0 ? 0 : (currentStep / (WORKFLOW_STEPS.length - 1)) * 100}%` }} />
              {WORKFLOW_STEPS.map((step, i) => (
                <div key={i} className="relative flex flex-col items-center z-10" style={{ width: `${100 / WORKFLOW_STEPS.length}%` }}>
                  <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all shadow-sm
                    ${i < currentStep ? 'bg-[#1A438A] border-[#1A438A]' : i === currentStep ? 'bg-[#1A438A] border-[#1A438A] ring-4 ring-[#1A438A]/15' : 'bg-white border-slate-300'}`}>
                    {i < currentStep && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                    {i === currentStep && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <p className="text-[9px] text-center leading-tight whitespace-pre-line mt-1.5 text-slate-500 font-medium px-0.5">{step.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Required Documents (view-only) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
            </div>
            <div className="p-3 space-y-1.5 min-h-[96px]">
              {requiredDocs.length === 0 ? (
                <div className="py-5 text-center"><div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2"><Paperclip className="w-5 h-5 text-slate-300" /></div><p className="text-[11px] text-slate-400">No party types selected</p></div>
              ) : requiredDocs.map((doc, i) => {
                const files = docFiles[doc.key] || [];
                const hasFiles = files.length > 0;
                return (
                  <div key={doc.key} className={`flex items-center justify-between rounded-lg px-3 py-2 border ${hasFiles ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex-1 mr-2 min-w-0">
                      <span className="text-[11px] text-slate-600 leading-tight block"><span className="font-bold text-slate-300 mr-1">{i+1}.</span>{doc.label}</span>
                      {hasFiles && <span className="text-[10px] text-emerald-600 font-semibold">{files.length} file{files.length > 1 ? 's' : ''} attached</span>}
                    </div>
                    {hasFiles && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Approvals panel — show BUM/FBP/Cluster as display */}
          <PanelSection title="Approvals">
            <div className="p-4 space-y-3.5">
              <div><FieldLabel>BUM</FieldLabel><ComboBox value={bum} onChange={() => {}} options={[]} disabled /></div>
              <div><FieldLabel>FBP</FieldLabel><ComboBox value={fbp} onChange={() => {}} options={[]} disabled dropUp /></div>
              <div><FieldLabel>Cluster Head</FieldLabel><ComboBox value={clusterHead} onChange={() => {}} options={[]} disabled dropUp /></div>
            </div>
          </PanelSection>

          {/* Comments */}
          <PanelSection title="Comments">
            <div className="p-3">
              {comments.length > 0 && (
                <div className="mb-3 space-y-2 max-h-36 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex justify-between mb-1"><span className="text-[11px] font-bold text-[#1A438A]">{c.author}</span><span className="text-[10px] text-slate-400">{c.time}</span></div>
                      <p className="text-xs text-slate-600 leading-relaxed">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${commentInput ? 'border-[#1A438A] bg-white ring-2 ring-[#1A438A]/10' : 'border-slate-200 bg-slate-50/80'}`}>
                <input type="text" value={commentInput} onChange={e => setCommentInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                  placeholder="Post your comment here" className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />
                <button onClick={handlePostComment} disabled={!commentInput.trim()} className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </PanelSection>

          {/* ── Action Buttons ── */}
          <div className="flex gap-3">
            <button onClick={() => router.push('/special-approver-home')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all duration-200">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            {isPendingAction && (
              <>
                <button onClick={() => setShowRejectModal(true)} className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' }}>
                  <ThumbsDown className="w-4 h-4" /> Reject
                </button>
                <button onClick={() => setShowApproveModal(true)} className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)' }}>
                  <ThumbsUp className="w-4 h-4" /> Approve
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Approve Confirm Modal ── */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowApproveModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4"><ThumbsUp className="w-6 h-6 text-green-600" /></div>
            <h3 className="text-[#17293E] font-bold text-base mb-1">Approve this request?</h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">This will mark your special approval as granted and advance the workflow.</p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setShowApproveModal(false)} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={handleApprove} disabled={isActioning} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)' }}>
                {isActioning ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowRejectModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0"><ThumbsDown className="w-5 h-5 text-red-600" /></div>
              <div><h3 className="text-[#17293E] font-bold text-base">Reject this request?</h3><p className="text-slate-500 text-xs mt-0.5">Please provide a reason for rejection.</p></div>
            </div>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Enter reason for rejection..." rows={3}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10 mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setShowRejectModal(false)} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={handleReject} disabled={isActioning || !rejectReason.trim()} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' }}>
                {isActioning ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Modal ── */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-green-500/30" style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-[#17293E] text-xl font-bold mb-2">Done!</h2>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">{successMessage}</p>
            <button onClick={() => router.push('/special-approver-home')} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95 shadow-lg shadow-[#1A438A]/20" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              Return to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SpecialApproverForm1Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <SpecialApproverForm1Content />
    </Suspense>
  );
}