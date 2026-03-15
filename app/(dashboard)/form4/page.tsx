'use client';

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Home, Lightbulb, Search, Settings, User,
  Paperclip, CheckCircle2, X, Upload, File,
  Eye, Trash2, Send, AlertCircle, ArrowLeft, Loader2, Car,
} from 'lucide-react';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import { DatePicker } from '@/components/ui/date-picker';

type FormMode = 'new' | 'view' | 'resubmit' | 'draft';

interface AttachedFile {
  id: string; name: string; size: number; file: File; fileUrl?: string;
}
interface CommentEntry {
  id: number; author: string; text: string; time: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANY_CODES = [
  'DM01 - DIMO PLC', 'DM02 - DIMO Subsidiaries', 'DM03 - DIMO Auto', 'DM04 - DIMO Power',
];

const OWNER_TYPES = ['Company', 'Individual', 'Partnership', 'Sole proprietorship'];

const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' },
  { label: 'Approvals' },
  { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' },
  { label: 'Legal GM\nApproval' },
  { label: 'Ready to\nCollect' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSubmissionId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `LHD_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${String(now.getMilliseconds()).padStart(3,'0')}`;
}

function fmtSize(b: number) {
  if (b === 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{message}</p>;
}

function ReadField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className={`w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 ${multiline ? 'min-h-[80px] whitespace-pre-wrap' : ''}`}>
        {value || <span className="text-slate-400 italic">—</span>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'OK')        return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 ml-1">OK</span>;
  if (status === 'ATTENTION') return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 ml-1">Attention</span>;
  if (status === 'RESUBMIT')  return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 ml-1">Resubmit</span>;
  return null;
}

function TextField({ value, onChange, placeholder, disabled, hasError }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; hasError?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150 focus:outline-none
        ${disabled ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
        : hasError ? 'bg-white border-red-400 ring-2 ring-red-400/10'
        : 'bg-white border-slate-200 text-slate-700 hover:border-[#4686B7] focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`}
    />
  );
}

function ComboBox({ value, onChange, options, placeholder, disabled = false, hasError = false }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean; hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const filtered = query.trim() ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options;
  useEffect(() => {
    const h = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }};
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center border rounded-lg transition-all duration-150
        ${disabled ? 'bg-slate-50 border-slate-200' : open ? 'bg-white border-[#1A438A] shadow-sm ring-2 ring-[#1A438A]/10' : hasError ? 'bg-white border-red-400 ring-2 ring-red-400/10' : 'bg-white border-slate-200 hover:border-[#4686B7]'}`}>
        <input ref={inputRef} type="text" value={open ? query : value} onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(''); }}
          onFocus={() => { setOpen(true); setQuery(''); }} placeholder={value || placeholder || 'Type to search...'}
          disabled={disabled}
          className={`flex-1 px-3.5 py-2.5 text-sm bg-transparent focus:outline-none rounded-lg ${disabled ? 'cursor-not-allowed text-slate-400' : 'text-slate-800'} ${!open && value ? 'font-medium' : ''} placeholder:text-slate-400`} />
        <div className="flex items-center pr-2 gap-0.5">
          {value && !disabled && <button type="button" onMouseDown={e => { e.preventDefault(); onChange(''); setQuery(''); }} className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-slate-500"><X className="w-3 h-3" /></button>}
          <button type="button" disabled={disabled} onMouseDown={e => { e.preventDefault(); if (!disabled) { setOpen(!open); if (!open) inputRef.current?.focus(); }}}
            className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-[#1A438A] disabled:pointer-events-none">
            <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180 text-[#1A438A]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>
        </div>
      </div>
      {open && !disabled && (
        <div className="absolute z-30 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden top-full mt-1.5 max-h-52 overflow-y-auto">
          {filtered.length === 0 ? <div className="px-3.5 py-4 text-center text-sm text-slate-400">No matches found</div>
          : filtered.map(opt => <button key={opt} type="button" onMouseDown={e => { e.preventDefault(); onChange(opt); setQuery(''); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors ${value === opt ? 'bg-[#1A438A] text-white font-medium' : 'text-slate-700 hover:bg-[#EEF3F8] hover:text-[#1A438A]'}`}>{opt}</button>)}
        </div>
      )}
    </div>
  );
}

// ─── Upload Popup ─────────────────────────────────────────────────────────────

function UploadPopup({ docLabel, files, onAdd, onRemove, onClose, onConfirm, canRemove = true }: {
  docLabel: string; files: AttachedFile[];
  onAdd: (f: AttachedFile[]) => void; onRemove: (id: string) => void; onClose: () => void; onConfirm?: () => void; canRemove?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    onAdd(Array.from(incoming).map((f) => ({ id: `${Date.now()}-${Math.random()}`, name: f.name, size: f.size, file: f })));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Paperclip className="w-4 h-4 text-white" /></div>
            <div>
              <p className="text-white font-bold text-sm">Attach Documents</p>
              <p className="text-white/60 text-[11px] mt-0.5 truncate max-w-[280px]">{docLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">
          <div onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${dragging ? 'border-[#1A438A] bg-[#EEF3F8] scale-[1.01]' : 'border-slate-200 hover:border-[#4686B7] hover:bg-slate-50'}`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-colors ${dragging ? 'bg-[#1A438A]' : 'bg-slate-100'}`}>
              <Upload className={`w-6 h-6 ${dragging ? 'text-white' : 'text-slate-400'}`} />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">{dragging ? 'Drop files here' : 'Drag & drop files here'}</p>
            <p className="text-[11px] text-slate-400">or click to browse from your computer</p>
            <p className="text-[11px] text-slate-300 mt-2">PDF, Word, Excel, Images — any file type accepted</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </div>
        </div>
        {files.length > 0 && (
          <div className="px-5 pb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Attached ({files.length})</p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#EEF3F8] flex items-center justify-center flex-shrink-0"><File className="w-4 h-4 text-[#1A438A]" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{f.name}</p>
                    <p className="text-[11px] text-slate-400">{fmtSize(f.size)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { const url = f.fileUrl || URL.createObjectURL(f.file); window.open(url, '_blank'); }}
                      className="w-7 h-7 rounded-lg hover:bg-[#EEF3F8] flex items-center justify-center text-slate-400 hover:text-[#1A438A] transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                    {canRemove && (
                      <button onClick={() => onRemove(f.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="p-5 pt-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:border-slate-300 hover:bg-slate-50 transition-all">Cancel</button>
          <button onClick={() => { if (onConfirm) onConfirm(); else onClose(); }} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            Done {files.length > 0 && `(${files.length} file${files.length > 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── View Log Modal ────────────────────────────────────────────────────────────

function ViewLogModal({ log, onClose }: { log: { id: number; actor: string; role: string; action: string; timestamp: string }[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <span className="text-white font-bold text-base">Workflow Log</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {log.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">No log entries yet.</p> : (
            <div className="relative pl-6">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
              {log.map((entry, i) => (
                <div key={entry.id} className="relative mb-4">
                  <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${i === 0 ? 'bg-slate-400 border-slate-400' : 'bg-[#1A438A] border-[#1A438A]'}`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                  <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                    <div className="flex justify-between items-start gap-2 mb-0.5">
                      <span className="text-[11px] font-bold text-[#1A438A]">{entry.actor}</span>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{entry.timestamp}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold mb-1">{entry.role}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{entry.action}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-100">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Content ────────────────────────────────────────────────────────

function Form4Content() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlMode = (searchParams.get('mode') as FormMode) ?? 'new';
  const submissionId = searchParams.get('id');
  const mode = urlMode;
  const isReadOnly = mode === 'view';

  // ── Auth ──
  useEffect(() => {
    if (status === 'authenticated' && !['INITIATOR', 'BUM', 'FBP', 'CLUSTER_HEAD', 'SPECIAL_APPROVER'].includes(session?.user?.role as string)) {
      router.replace('/');
    }
    if (status === 'authenticated' && session?.user?.role === 'SPECIAL_APPROVER' && submissionId) {
      router.replace(`/form4/special-approver?id=${submissionId}`);
    }
  }, [status, session, router, submissionId]);

  // ── UI state ──
  const [showSignOut, setShowSignOut] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<{ id: number; actor: string; role: string; action: string; timestamp: string }[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionNo, setSubmissionNo] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [comments, setComments] = useState<CommentEntry[]>([]);

  // ── Document state ──
  const [docFiles, setDocFiles] = useState<Record<string, AttachedFile[]>>({});
  const [docStatuses, setDocStatuses] = useState<Record<string, string>>({});
  const [docIdMap, setDocIdMap] = useState<Record<string, string>>({});
  const [docKeys, setDocKeys] = useState<string[]>([]);
  const docFilesRef = useRef<Record<string, AttachedFile[]>>({});
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<AttachedFile | null>(null);
  const [uploadPopup, setUploadPopup] = useState<{ docKey: string; docLabel: string; docId: string } | null>(null);

  // ── Form fields ──
  const [companyCode, setCompanyCode] = useState('');
  const [sapCostCenter, setSapCostCenter] = useState('');
  const [ownerType, setOwnerType] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [nicNo, setNicNo] = useState('');
  const [address, setAddress] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [chassisNo, setChassisNo] = useState('');
  const [termOfRent, setTermOfRent] = useState('');
  const [commencing, setCommencing] = useState('');
  const [monthlyRentalExcl, setMonthlyRentalExcl] = useState('');
  const [monthlyRentalIncl, setMonthlyRentalIncl] = useState('');
  const [refundableDeposit, setRefundableDeposit] = useState('');
  const [maxUsage, setMaxUsage] = useState('');
  const [excessKmRate, setExcessKmRate] = useState('');
  const [workingHours, setWorkingHours] = useState('');
  const [renewalAgreementNo, setRenewalAgreementNo] = useState('');
  const [agreementDate, setAgreementDate] = useState('');
  const [reasonForHiring, setReasonForHiring] = useState('');
  const [specialConditions, setSpecialConditions] = useState('');

  // ── Approver state ──
  const [bum, setBum] = useState('');
  const [fbp, setFbp] = useState('');
  const [clusterHead, setClusterHead] = useState('');
  const [bumOptions, setBumOptions] = useState<string[]>([]);
  const [fbpOptions, setFbpOptions] = useState<string[]>([]);
  const [clusterOptions, setClusterOptions] = useState<string[]>([]);
  const [userIdMap, setUserIdMap] = useState<Record<string, string>>({});
  const [sapCostCenterOptions, setSapCostCenterOptions] = useState<string[]>([]);

  // ── Load users ──
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => {
      if (!d.success) return;
      const users: any[] = d.data;
      const idMap: Record<string, string> = {};
      users.forEach((u: any) => { if (u.name) idMap[u.name] = u.id; idMap[u.email] = u.id; });
      setUserIdMap(idMap);
      setBumOptions(users.filter((u: any) => u.role === 'BUM' && u.isActive).map((u: any) => u.name || u.email));
      setFbpOptions(users.filter((u: any) => u.role === 'FBP' && u.isActive).map((u: any) => u.name || u.email));
      setClusterOptions(users.filter((u: any) => u.role === 'CLUSTER_HEAD' && u.isActive).map((u: any) => u.name || u.email));
    }).catch(() => {});
  }, []);

  // ── Load SAP cost centers ──
  useEffect(() => {
    fetch('/api/sap-cost-centers').then(r => r.json()).then(d => {
      if (d.success) setSapCostCenterOptions(d.data.map((c: any) => `${c.code} - ${c.name}`));
    }).catch(() => {});
  }, []);

  // ── Load submission ──
  useEffect(() => {
    if (mode === 'new' || !submissionId) { setSubmissionNo(generateSubmissionId()); return; }
    fetch(`/api/submissions/${submissionId}`).then(r => r.json()).then(d => {
      if (!d.success) return;
      const s = d.data;
      setSubmissionNo(s.submissionNo);
      setSubmissionStatus(s.status ?? '');
      setCompanyCode(s.companyCode ?? '');
      setSapCostCenter(s.sapCostCenter ?? '');
      try {
        const scope = JSON.parse(s.scopeOfAgreement || '{}');
        setOwnerType(scope.ownerType ?? '');
        setOwnerName(scope.ownerName ?? '');
        setNicNo(scope.nicNo ?? '');
        setAddress(scope.address ?? '');
        setContactNo(scope.contactNo ?? '');
        setVehicleNo(scope.vehicleNo ?? '');
        setMake(scope.make ?? '');
        setModel(scope.model ?? '');
        setChassisNo(scope.chassisNo ?? '');
        setTermOfRent(scope.termOfRent ?? '');
        setCommencing(scope.commencing ?? '');
        setMonthlyRentalExcl(scope.monthlyRentalExcl ?? '');
        setMonthlyRentalIncl(scope.monthlyRentalIncl ?? '');
        setRefundableDeposit(scope.refundableDeposit ?? '');
        setMaxUsage(scope.maxUsage ?? '');
        setExcessKmRate(scope.excessKmRate ?? '');
        setWorkingHours(scope.workingHours ?? '');
        setRenewalAgreementNo(scope.renewalAgreementNo ?? '');
        setAgreementDate(scope.agreementDate ?? '');
        setReasonForHiring(scope.reasonForHiring ?? '');
        setSpecialConditions(scope.specialConditions ?? '');
      } catch {}
      if (s.approvals?.length) {
        s.approvals.forEach((a: any) => {
          if (a.role === 'BUM') setBum(a.approverName || '');
          if (a.role === 'FBP') setFbp(a.approverName || '');
          if (a.role === 'CLUSTER_HEAD') setClusterHead(a.approverName || '');
        });
      }
      if (s.documents?.length) {
        const loaded: Record<string, AttachedFile[]> = {};
        const idMap: Record<string, string> = {};
        const statuses: Record<string, string> = {};
        const keys: string[] = [];
        s.documents.forEach((doc: any) => {
          keys.push(doc.label);
          idMap[doc.label] = doc.id;
          statuses[doc.label] = doc.status || 'NONE';
          if (doc.fileUrl) loaded[doc.label] = [{ id: doc.id, name: doc.label, size: 0, file: { name: doc.label, size: 0 } as File, fileUrl: doc.fileUrl }];
        });
        setDocFiles(loaded);
        setDocIdMap(idMap);
        setDocStatuses(statuses);
        setDocKeys(keys);
        docFilesRef.current = loaded;
      }
      if (s.comments?.length) {
        setComments(s.comments.map((c: any, i: number) => ({
          id: i, author: c.authorName, text: c.text,
          time: new Date(c.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        })));
      }
      const fmt = (dt: string) => dt ? new Date(dt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const statusLabel: Record<string, string> = { APPROVED: 'Approved', OK_TO_PROCEED: 'OK to Proceed', SENT_BACK: 'Sent Back', CANCELLED: 'Cancelled', SUBMIT_TO_LEGAL_GM: 'Submitted to Legal GM', SUBMIT_TO_LEGAL_OFFICER: 'Submitted to Legal Officer', RETURNED_TO_INITIATOR: 'Returned to Initiator', COMPLETED: 'Completed' };
      const roleLabel: Record<string, string> = { BUM: 'BUM', FBP: 'FBP', CLUSTER_HEAD: 'Cluster Head', CEO: 'CEO', LEGAL_GM: 'Legal GM', LEGAL_OFFICER: 'Legal Officer' };
      setLog([
        { id: 0, actor: 'System', role: 'System', action: 'Submission created', timestamp: fmt(s.createdAt) },
        ...(s.approvals || []).filter((a: any) => a.actionDate).map((a: any, i: number) => ({
          id: i + 1, actor: a.approverName || a.role, role: roleLabel[a.role] ?? a.role,
          action: statusLabel[a.status] ?? a.status, timestamp: fmt(a.actionDate),
        })),
      ]);
    }).catch(() => {});
  }, [mode, submissionId]);

  // ── Derive doc keys for new submission ──
  useEffect(() => {
    if (mode !== 'new') return;
    const common = ['Certificate of Registration', 'Revenue License', 'Vehicle Insurance Cover'];
    const byType: Record<string, string[]> = {
      Company: ['National Identity Card of Owner', 'Article of Association', 'Company Registration Certificate', 'Form 20'],
      Individual: ['NIC (Individual owner)'],
      Partnership: ['National Identity Card of Owner', 'Partnership Registration Certificate', 'NIC/passport copies of every partner'],
      'Sole proprietorship': ['National Identity Card of Owner', 'Business Registration/Sole Proprietorship Certificate'],
    };
    const specific = ownerType ? (byType[ownerType] || []) : [];
    const seen = new Set<string>();
    const keys: string[] = [];
    [...common, ...specific].forEach(k => { if (!seen.has(k)) { seen.add(k); keys.push(k); } });
    setDocKeys(keys);
  }, [ownerType, mode]);

  // ── Validation ──
  const validate = (): string[] => {
    const errs: string[] = [];
    if (!companyCode)     errs.push('Company Code is required');
    if (!ownerType)       errs.push('Owner Type is required');
    if (!ownerName.trim()) errs.push('Owner Name is required');
    if (!vehicleNo.trim()) errs.push('Vehicle No. is required');
    if (!make.trim())      errs.push('Make is required');
    if (!model.trim())     errs.push('Model is required');
    if (!termOfRent.trim()) errs.push('Term of Rent is required');
    if (!monthlyRentalExcl.trim()) errs.push('Monthly Rental (Excl. VAT) is required');
    if (!bum)              errs.push('BUM is required');
    if (!fbp)              errs.push('FBP is required');
    if (!clusterHead)      errs.push('Cluster Head is required');
    return errs;
  };

  const hasError = (field: string) => {
    const map: Record<string, string> = {
      companyCode: 'Company Code', ownerType: 'Owner Type', ownerName: 'Owner Name',
      vehicleNo: 'Vehicle No.', make: 'Make', model: 'Model',
      termOfRent: 'Term of Rent', monthlyRentalExcl: 'Monthly Rental (Excl. VAT)',
      bum: 'BUM', fbp: 'FBP', clusterHead: 'Cluster Head',
    };
    return validationErrors.some(e => e.includes(map[field] || ''));
  };

  const scopePayload = () => JSON.stringify({ ownerType, ownerName, nicNo, address, contactNo, vehicleNo, make, model, chassisNo, termOfRent, commencing, monthlyRentalExcl, monthlyRentalIncl, refundableDeposit, maxUsage, excessKmRate, workingHours, renewalAgreementNo, agreementDate, reasonForHiring, specialConditions });

  // ── Submit ──
  const handleSubmitClick = async (asDraft = false) => {
    if (!asDraft) {
      const errs = validate();
      if (errs.length > 0) { setValidationErrors(errs); setShowValidation(true); return; }
    }
    setIsSubmitting(true);
    try {
      const payload = {
        submissionNo, formId: 4, formName: 'Vehicle Rent Agreement',
        status: asDraft ? 'DRAFT' : 'PENDING_APPROVAL',
        initiatorId: session?.user?.id || '',
        companyCode,
        sapCostCenter,
        title: 'Vehicle Rent Agreement',
        scopeOfAgreement: scopePayload(),
        term: termOfRent,
        lkrValue: monthlyRentalExcl || '0',
        remarks: specialConditions,
        initiatorComments: reasonForHiring,
        bumId: userIdMap[bum] || bum,
        fbpId: userIdMap[fbp] || fbp,
        clusterHeadId: userIdMap[clusterHead] || clusterHead,
        parties: ownerType && ownerName ? [{ type: ownerType, name: ownerName }] : [],
        ...(mode === 'resubmit' && submissionId && { parentId: submissionId, isResubmission: true }),
      };
      const isDraftEdit = mode === 'draft' && submissionId;
      const res = await fetch(isDraftEdit ? `/api/submissions/${submissionId}` : '/api/submissions', {
        method: isDraftEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isDraftEdit ? {
          status: asDraft ? 'DRAFT' : 'PENDING_APPROVAL',
          companyCode, sapCostCenter, scopeOfAgreement: scopePayload(),
          term: termOfRent, remarks: specialConditions, initiatorComments: reasonForHiring,
          bumId: userIdMap[bum] || bum || undefined,
          fbpId: userIdMap[fbp] || fbp || undefined,
          clusterHeadId: userIdMap[clusterHead] || clusterHead || undefined,
        } : payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Server error: ${res.status}`); }
      const data = await res.json();
      if (data.submissionNo) setSubmissionNo(data.submissionNo);
      if (mode === 'resubmit' && submissionId) {
        await fetch(`/api/submissions/${submissionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'RESUBMITTED' }) });
      }
      if (!asDraft && data.data?.id && data.data?.documents?.length) {
        const docLabelToId: Record<string, string> = {};
        data.data.documents.forEach((d: any) => { docLabelToId[d.label] = d.id; });
        const ups: Promise<void>[] = [];
        for (const [docKey, files] of Object.entries(docFilesRef.current)) {
          for (const f of files as AttachedFile[]) {
            if (f.file && !f.fileUrl) {
              const docId = docLabelToId[docKey] || '';
              ups.push((async () => {
                const fd = new FormData(); fd.append('file', f.file); fd.append('submissionId', data.data.id);
                const ur = await fetch('/api/upload', { method: 'POST', body: fd });
                const ud = await ur.json();
                if (ud.success && ud.url && docId) {
                  await fetch(`/api/submissions/${data.data.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: docId, fileUrl: ud.url, documentStatus: 'UPLOADED' }) });
                }
              })());
            }
          }
        }
        await Promise.all(ups);
        for (const [docKey, files] of Object.entries(docFilesRef.current)) {
          for (const f of files as AttachedFile[]) {
            if (f.fileUrl) {
              const docId = docLabelToId[docKey] || '';
              if (docId) await fetch(`/api/submissions/${data.data.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: docId, fileUrl: f.fileUrl, documentStatus: 'UPLOADED' }) });
            }
          }
        }
      }
      if (asDraft || mode === 'resubmit') { router.push(ROUTES.HOME); }
      else { setShowSuccess(true); }
    } catch (err: any) {
      setValidationErrors([err.message || 'Submission failed.']); setShowValidation(true);
    } finally { setIsSubmitting(false); }
  };

  const addFilesToDoc = (docKey: string, newFiles: AttachedFile[]) =>
    setDocFiles(prev => { const next = { ...prev, [docKey]: [...(prev[docKey] || []), ...newFiles] }; docFilesRef.current = next; return next; });
  const removeFileFromDoc = (docKey: string, fileId: string) =>
    setDocFiles(prev => { const next = { ...prev, [docKey]: (prev[docKey] || []).filter(f => f.id !== fileId) }; docFilesRef.current = next; return next; });

  const handleFileSelect = (docKey: string, files: FileList | null) => {
    if (!files) return;
    const newFiles: AttachedFile[] = Array.from(files).map(f => ({ id: `${Date.now()}-${f.name}`, name: f.name, size: f.size, file: f }));
    addFilesToDoc(docKey, newFiles);
  };

  const handlePostComment = () => {
    if (!commentInput.trim() || !submissionId) return;
    const newComment: CommentEntry = { id: Date.now(), author: session?.user?.name || 'Me', text: commentInput.trim(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) };
    setComments(prev => [...prev, newComment]);
    fetch(`/api/submissions/${submissionId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorName: session?.user?.name, authorRole: 'INITIATOR', text: commentInput.trim() }) });
    setCommentInput('');
  };

  // ── Step calculation ──
  const currentStep = (() => {
    if (!submissionStatus || mode === 'new') return 0;
    if (['DRAFT', 'SENT_BACK', 'CANCELLED'].includes(submissionStatus)) return 0;
    if (['PENDING_APPROVAL', 'PENDING_CEO'].includes(submissionStatus)) return 1;
    if (['PENDING_LEGAL_GM', 'PENDING_SPECIAL_APPROVER'].includes(submissionStatus)) return 2;
    if (submissionStatus === 'PENDING_LEGAL_OFFICER') return 3;
    if (submissionStatus === 'PENDING_LEGAL_GM_FINAL') return 4;
    if (submissionStatus === 'COMPLETED') return 5;
    return 2;
  })();

  if (status === 'loading') return null;
  if (status === 'authenticated' && session?.user?.role === 'SPECIAL_APPROVER') return null;
  if (status === 'authenticated' && !['INITIATOR', 'BUM', 'FBP', 'CLUSTER_HEAD'].includes(session?.user?.role as string)) return null;

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');`}</style>

      {/* ── Sidebar ── */}
      <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen"
        style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
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
          <button onClick={() => router.push('/home')} className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all" title="Home"><Home className="w-[18px] h-[18px]" /></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Lightbulb className="w-[18px] h-[18px]" /></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Search className="w-[18px] h-[18px]" /></button>
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <button onClick={() => router.push('/settings')} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><Settings className="w-[18px] h-[18px]" /></button>
          <button onClick={() => setShowSignOut(true)} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><User className="w-[18px] h-[18px]" /></button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex gap-5 p-5 overflow-auto min-w-0">

        {/* ── Left: Form ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Header */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><Car className="w-5 h-5 text-white" /></div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">Vehicle Rent Agreement</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono tracking-wide">16/FM/1641/07/04</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {mode !== 'new' && (
                  <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border backdrop-blur-sm
                    ${mode === 'view' ? 'bg-blue-500/20 text-blue-200 border-blue-400/30' : 'bg-orange-500/20 text-orange-200 border-orange-400/30'}`}>
                    {mode === 'view' ? 'View Only' : mode === 'draft' ? 'Draft' : 'Resubmission'}
                  </span>
                )}
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 4</div>
              </div>
            </div>
          </div>

          {/* Form Body */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Submission Details</span>
            </div>
            <div className="px-6 py-6 space-y-5">

              {/* Request by */}
              <div>
                <FieldLabel>Request by (name)</FieldLabel>
                <div className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 font-medium">
                  {session?.user?.name || '—'}
                </div>
              </div>

              {/* Company & SAP */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Company Code</FieldLabel>
                  <ComboBox value={companyCode} onChange={setCompanyCode} options={COMPANY_CODES} placeholder="Select company..." disabled={isReadOnly} hasError={hasError('companyCode')} />
                  <FieldError message={hasError('companyCode') ? 'Company Code is required' : undefined} />
                </div>
                <div>
                  <FieldLabel>SAP Cost Center</FieldLabel>
                  {isReadOnly ? <ReadField label="" value={sapCostCenter} /> : <ComboBox value={sapCostCenter} onChange={setSapCostCenter} options={sapCostCenterOptions} placeholder="Select cost center..." />}
                </div>
              </div>

              {/* Vehicle Owner */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#1A438A] mb-4">Vehicle Owner Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Owner Type</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={ownerType} /> : (
                      <select value={ownerType} onChange={e => setOwnerType(e.target.value)}
                        className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none appearance-none ${hasError('ownerType') ? 'border-red-400 bg-white' : 'border-slate-200 bg-white hover:border-[#4686B7] focus:border-[#1A438A]'}`}>
                        <option value="">Select type...</option>
                        {OWNER_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    )}
                    <FieldError message={hasError('ownerType') ? 'Owner Type is required' : undefined} />
                  </div>
                  <div>
                    <FieldLabel required>Owner Name</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={ownerName} /> : <TextField value={ownerName} onChange={setOwnerName} placeholder="Full name of vehicle owner" hasError={hasError('ownerName')} />}
                    <FieldError message={hasError('ownerName') ? 'Owner Name is required' : undefined} />
                  </div>
                  <div>
                    <FieldLabel>NIC / Registration No</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={nicNo} /> : <TextField value={nicNo} onChange={setNicNo} placeholder="NIC or business reg. no." />}
                  </div>
                  <div>
                    <FieldLabel>Contact No</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={contactNo} /> : <TextField value={contactNo} onChange={setContactNo} placeholder="Contact number" />}
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Address</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={address} multiline /> : (
                      <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} placeholder="Owner address..."
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none hover:border-[#4686B7] focus:border-[#1A438A] resize-none" />
                    )}
                  </div>
                </div>
              </div>

              {/* Vehicle Details */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#1A438A] mb-4">Vehicle Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Vehicle No.</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={vehicleNo} /> : <TextField value={vehicleNo} onChange={setVehicleNo} placeholder="e.g. WP CAA 1234" hasError={hasError('vehicleNo')} />}
                    <FieldError message={hasError('vehicleNo') ? 'Vehicle No. is required' : undefined} />
                  </div>
                  <div>
                    <FieldLabel required>Make</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={make} /> : <TextField value={make} onChange={setMake} placeholder="e.g. Toyota" hasError={hasError('make')} />}
                    <FieldError message={hasError('make') ? 'Make is required' : undefined} />
                  </div>
                  <div>
                    <FieldLabel required>Model</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={model} /> : <TextField value={model} onChange={setModel} placeholder="e.g. Hilux" hasError={hasError('model')} />}
                    <FieldError message={hasError('model') ? 'Model is required' : undefined} />
                  </div>
                  <div>
                    <FieldLabel>Chassis No.</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={chassisNo} /> : <TextField value={chassisNo} onChange={setChassisNo} placeholder="Chassis number" />}
                  </div>
                </div>
              </div>

              {/* Rental Terms */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#1A438A] mb-4">Rental Terms</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Term of Rent</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={termOfRent} /> : <TextField value={termOfRent} onChange={setTermOfRent} placeholder="e.g. 12 months" hasError={hasError('termOfRent')} />}
                    <FieldError message={hasError('termOfRent') ? 'Term of Rent is required' : undefined} />
                  </div>
                  <div>
                    <FieldLabel>Commencing Date</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={commencing} /> : <DatePicker value={commencing} onChange={setCommencing} />}
                  </div>
                  <div>
                    <FieldLabel required>Monthly Rental (Excl. VAT)</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={monthlyRentalExcl} /> : <TextField value={monthlyRentalExcl} onChange={setMonthlyRentalExcl} placeholder="Amount in LKR" hasError={hasError('monthlyRentalExcl')} />}
                    <FieldError message={hasError('monthlyRentalExcl') ? 'Monthly Rental (Excl. VAT) is required' : undefined} />
                  </div>
                  <div>
                    <FieldLabel>Monthly Rental (Incl. VAT)</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={monthlyRentalIncl} /> : <TextField value={monthlyRentalIncl} onChange={setMonthlyRentalIncl} placeholder="Amount in LKR" />}
                  </div>
                  <div>
                    <FieldLabel>Refundable Deposit</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={refundableDeposit} /> : <TextField value={refundableDeposit} onChange={setRefundableDeposit} placeholder="Amount in LKR" />}
                  </div>
                  <div>
                    <FieldLabel>Max Usage (km/month)</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={maxUsage} /> : <TextField value={maxUsage} onChange={setMaxUsage} placeholder="e.g. 3000" />}
                  </div>
                  <div>
                    <FieldLabel>Excess KM Rate</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={excessKmRate} /> : <TextField value={excessKmRate} onChange={setExcessKmRate} placeholder="Rate per excess km" />}
                  </div>
                  <div>
                    <FieldLabel>Working Hours</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={workingHours} /> : <TextField value={workingHours} onChange={setWorkingHours} placeholder="e.g. 8am – 5pm" />}
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#1A438A] mb-4">Additional Information</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>Renewal Agreement No.</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={renewalAgreementNo} /> : <TextField value={renewalAgreementNo} onChange={setRenewalAgreementNo} placeholder="If renewal, enter ref no." />}
                  </div>
                  <div>
                    <FieldLabel>Agreement Date</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={agreementDate} /> : <DatePicker value={agreementDate} onChange={setAgreementDate} />}
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Reason for Hiring</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={reasonForHiring} multiline /> : (
                      <textarea value={reasonForHiring} onChange={e => setReasonForHiring(e.target.value)} rows={3} placeholder="Describe the business purpose..."
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none hover:border-[#4686B7] focus:border-[#1A438A] resize-none" />
                    )}
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Special Conditions / Remarks</FieldLabel>
                    {isReadOnly ? <ReadField label="" value={specialConditions} multiline /> : (
                      <textarea value={specialConditions} onChange={e => setSpecialConditions(e.target.value)} rows={3} placeholder="Any special conditions..."
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none hover:border-[#4686B7] focus:border-[#1A438A] resize-none" />
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* ── Right Panel ── */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">

          {/* Workflow Tracker */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Workflow</span>
              </div>
              {mode !== 'new' && <button onClick={() => setShowLog(true)} className="text-[11px] font-semibold text-[#1A438A] hover:underline">View Log</button>}
            </div>
            <div className="px-4 py-4">
              <div className="flex items-center justify-between mb-5">
                <div />
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
          </div>

          {/* Required Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
            </div>
            <div className="p-3 space-y-1.5 min-h-[96px]">
              {docKeys.length === 0 ? (
                <div className="py-5 text-center">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2"><Paperclip className="w-5 h-5 text-slate-300" /></div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{isReadOnly ? 'No documents' : 'Select Owner Type to see\nrequired documents'}</p>
                </div>
              ) : docKeys.map((key, i) => {
                const files = docFiles[key] || [];
                const hasFiles = files.length > 0;
                const docStatus = docStatuses[key] || 'NONE';
                return (
                  <div key={key}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all
                      ${docStatus === 'ATTENTION' ? 'bg-yellow-50 border-yellow-200' :
                        docStatus === 'RESUBMIT'  ? 'bg-red-50 border-red-200' :
                        hasFiles ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                    <div className="flex-1 mr-2 min-w-0">
                      <span className="text-[11px] text-slate-600 leading-tight flex items-center gap-1 flex-wrap">
                        <span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{key}
                      </span>
                      {hasFiles && <span className="text-[10px] text-emerald-600 font-semibold">{files.length} file{files.length > 1 ? 's' : ''} attached</span>}
                      {docStatus !== 'NONE' && <StatusBadge status={docStatus} />}
                    </div>
                    {uploadingDoc === key ? (
                      <Loader2 className="w-4 h-4 text-[#1A438A] animate-spin flex-shrink-0" />
                    ) : !isReadOnly ? (
                      <button onClick={() => setUploadPopup({ docKey: key, docLabel: key, docId: docIdMap[key] || '' })} className="flex-shrink-0 transition-colors">
                        {hasFiles ? <CheckCircle2 className="w-4 h-4 text-emerald-500 hover:text-emerald-600" /> : <Paperclip className="w-4 h-4 text-[#1183B7] hover:text-[#1A438A]" />}
                      </button>
                    ) : (
                      hasFiles && <button onClick={() => setUploadPopup({ docKey: key, docLabel: key, docId: docIdMap[key] || '' })} className="flex-shrink-0 transition-colors"><CheckCircle2 className="w-4 h-4 text-emerald-500 hover:text-emerald-600" /></button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Approvals */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Approvals</span>
            </div>
            <div className="px-4 py-4 space-y-3">
              {[['BUM', bum, setBum, bumOptions, 'bum'], ['FBP', fbp, setFbp, fbpOptions, 'fbp'], ['Cluster Head', clusterHead, setClusterHead, clusterOptions, 'clusterHead']].map(([label, val, setter, opts, field]) => (
                <div key={label as string}>
                  <FieldLabel required={!isReadOnly}>{label as string}</FieldLabel>
                  {isReadOnly ? (
                    <div className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">{(val as string) || <span className="text-slate-400 italic">—</span>}</div>
                  ) : (
                    <ComboBox value={val as string} onChange={setter as (v: string) => void} options={opts as string[]} placeholder={`Type or select ${label}...`} hasError={hasError(field as string)} />
                  )}
                  <FieldError message={hasError(field as string) ? `${label} is required` : undefined} />
                </div>
              ))}
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
                      <div className="flex justify-between mb-1"><span className="text-[11px] font-bold text-[#1A438A]">{c.author}</span><span className="text-[10px] text-slate-400">{c.time}</span></div>
                      <p className="text-xs text-slate-600 leading-relaxed">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${commentInput ? 'border-[#1A438A] bg-white ring-2 ring-[#1A438A]/10' : 'border-slate-200 bg-slate-50/80'}`}>
                <input type="text" value={commentInput} onChange={e => setCommentInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                  placeholder="Post a comment..." className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />
                <button onClick={handlePostComment} disabled={!commentInput.trim()}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {!isReadOnly && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button onClick={() => router.push(ROUTES.HOME)}
                  className="flex items-center gap-1.5 py-3 px-4 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all">
                  <ArrowLeft className="w-4 h-4" />Back
                </button>
                <button onClick={() => handleSubmitClick(true)} disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl font-bold text-sm border-2 border-slate-300 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-60">
                  Save Draft
                </button>
              </div>
              <button onClick={() => handleSubmitClick(false)} disabled={isSubmitting}
                className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</> : <><Send className="w-4 h-4" />{mode === 'resubmit' ? 'Resubmit Request' : 'Submit Request'}</>}
              </button>
            </div>
          )}

          {isReadOnly && (
            <button onClick={() => router.push(ROUTES.HOME)}
              className="flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all w-full">
              <ArrowLeft className="w-4 h-4" />Back to Home
            </button>
          )}

        </div>
      </div>

      {/* ── Modals ── */}
      {showLog && <ViewLogModal log={log} onClose={() => setShowLog(false)} />}

      {uploadPopup && (
        <UploadPopup
          docLabel={uploadPopup.docLabel}
          files={docFiles[uploadPopup.docKey] || []}
          onAdd={(newFiles) => addFilesToDoc(uploadPopup.docKey, newFiles)}
          onRemove={(id) => removeFileFromDoc(uploadPopup.docKey, id)}
          onClose={() => setUploadPopup(null)}
          onConfirm={() => setUploadPopup(null)}
          canRemove={!isReadOnly}
        />
      )}

      {showValidation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowValidation(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0"><AlertCircle className="w-5 h-5 text-red-500" /></div>
              <h3 className="text-[#17293E] font-bold text-base">Please fix the following</h3>
            </div>
            <ul className="space-y-1.5 mb-5">{validationErrors.map((e, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />{e}</li>)}</ul>
            <button onClick={() => setShowValidation(false)} className="w-full py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>OK, I'll fix them</button>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-[#1A438A]/20" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-[#17293E] text-xl font-bold mb-2">Submitted!</h2>
            <p className="text-slate-500 text-sm mb-2 leading-relaxed">Your Vehicle Rent Agreement request has been submitted.</p>
            <p className="text-[#1A438A] font-bold text-sm font-mono mb-6">Submission ID : #{submissionNo.split('_').pop()}</p>
            <button onClick={() => router.push(ROUTES.HOME)} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95 shadow-lg shadow-[#1A438A]/20" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              Return to Home
            </button>
          </div>
        </div>
      )}

      {showSignOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSignOut(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <h3 className="text-[#17293E] font-bold text-base mb-2">Sign Out?</h3>
            <p className="text-slate-500 text-sm mb-5">You will be returned to the login page.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowSignOut(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => router.push('/login')} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>Sign Out</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Page Export ──────────────────────────────────────────────────────────────

export default function Form4Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]"><div className="w-8 h-8 border-4 border-[#1A438A] border-t-transparent rounded-full animate-spin" /></div>}>
      <Form4Content />
    </Suspense>
  );
}