'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Home, Lightbulb, Search, Settings, User,
  FileText, Paperclip, CheckCircle2, X, Upload, File,
  Eye, Trash2, Send, AlertCircle, ArrowLeft, Loader2, Tag,
} from 'lucide-react';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';

type FormMode = 'new' | 'view' | 'resubmit' | 'draft';

interface AttachedFile {
  id: string; name: string; size: number; file: File; fileUrl?: string;
}

interface CommentEntry {
  id: number; author: string; text: string; time: string;
}

// ─── Form 6 specific constants ────────────────────────────────────────────────

const COMPANY_CODES = [
  'DM01 - DIMO PLC', 'DM02 - DIMO Subsidiaries', 'DM03 - DIMO Auto', 'DM04 - DIMO Power',
];

const SAP_COST_CENTERS = [
  '000003999 - IT Department', '000004001 - Finance Department', '000004002 - HR Department',
  '000004003 - Operations Department', '000004004 - Legal Department',
];

// NICE Classification 2020 — a representative sample
const TRADEMARK_CLASSES = [
  'Class 1 - Chemicals',
  'Class 2 - Paints',
  'Class 3 - Cosmetics and Cleaning Preparations',
  'Class 4 - Lubricants and Fuels',
  'Class 5 - Pharmaceuticals',
  'Class 6 - Metal Goods',
  'Class 7 - Machinery',
  'Class 8 - Hand Tools',
  'Class 9 - Electrical & Scientific Apparatus',
  'Class 10 - Medical Apparatus',
  'Class 11 - Environmental Control Apparatus',
  'Class 12 - Vehicles',
  'Class 13 - Firearms',
  'Class 14 - Jewelry',
  'Class 15 - Musical Instruments',
  'Class 16 - Paper Goods and Printed Matter',
  'Class 17 - Rubber Goods',
  'Class 18 - Leather Goods',
  'Class 19 - Non-metallic Building Materials',
  'Class 20 - Furniture and Articles Not Elsewhere Classified',
  'Class 21 - Housewares and Glass',
  'Class 22 - Cordage and Fibers',
  'Class 23 - Yarns and Threads',
  'Class 24 - Fabrics',
  'Class 25 - Clothing',
  'Class 26 - Fancy Goods',
  'Class 27 - Floor Coverings',
  'Class 28 - Toys and Sporting Goods',
  'Class 29 - Meats and Processed Foods',
  'Class 30 - Staple Foods',
  'Class 31 - Natural Agricultural Products',
  'Class 32 - Light Beverages',
  'Class 33 - Wine and Spirits',
  'Class 34 - Smokers Articles',
  'Class 35 - Advertising and Business',
  'Class 36 - Insurance and Financial',
  'Class 37 - Building Construction and Repair',
  'Class 38 - Telecommunications',
  'Class 39 - Transportation and Storage',
  'Class 40 - Treatment of Materials',
  'Class 41 - Education and Entertainment',
  'Class 42 - Computer, Scientific & Legal',
  'Class 43 - Hotels and Restaurants',
  'Class 44 - Medical, Beauty & Agricultural',
  'Class 45 - Personal and Legal Services',
  'Certification Mark, Class 1',
  'Certification Mark, Class 2',
  'Collective Mark',
];

// Required docs for Form 6 — always just Artwork
const BASE_DOCS = ['Artwork'];

const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' },
  { label: 'Approvals' },
  { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' },
  { label: 'Legal GM\nApproval' },
  { label: 'Ready to\nCollect' },
];

function generateSubmissionId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `LHD_${datePart}_${seq}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeText(val: string): string { return val.replace(/[<>]/g, ''); }

// ─── Shared UI components ────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1"><AlertCircle className="w-3 h-3 flex-shrink-0" />{message}</p>;
}

function TextField({ value, onChange, placeholder, disabled = false, hasError = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  disabled?: boolean; hasError?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(sanitizeText(e.target.value))}
      placeholder={placeholder} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150
        ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
          : hasError ? 'bg-white border-red-400 ring-2 ring-red-400/10 focus:outline-none'
          : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'
        }`}
    />
  );
}

function TextAreaField({ value, onChange, placeholder, rows = 3, disabled = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; disabled?: boolean;
}) {
  return (
    <textarea value={value} onChange={(e) => onChange(sanitizeText(e.target.value))}
      placeholder={placeholder} rows={rows} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm resize-none transition-all
        ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
          : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'
        }`}
    />
  );
}

function SelectField({ value, onChange, options, placeholder, disabled = false, hasError = false }: {
  value: string; onChange: (v: string) => void; options: string[];
  placeholder?: string; disabled?: boolean; hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-sm text-left transition-all
          ${disabled ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
            : hasError ? 'bg-white border-red-400 ring-2 ring-red-400/10'
            : open ? 'bg-white border-[#1A438A] shadow-sm ring-2 ring-[#1A438A]/10'
            : 'bg-white border-slate-200 text-slate-700 hover:border-[#4686B7] cursor-pointer'
          }`}>
        <span className={value ? 'text-slate-800 font-medium' : 'text-slate-400'}>{value || placeholder || 'Select...'}</span>
        <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180 text-[#1A438A]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
            {options.map((opt) => (
              <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors first:rounded-t-xl last:rounded-b-xl
                  ${value === opt ? 'bg-[#1A438A] text-white font-medium' : 'text-slate-700 hover:bg-[#EEF3F8] hover:text-[#1A438A]'}`}>
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ComboBox({ value, onChange, options, placeholder, disabled = false, dropUp = false, hasError = false }: {
  value: string; onChange: (v: string) => void; options: string[];
  placeholder?: string; disabled?: boolean; dropUp?: boolean; hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const filtered = query.trim() ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options;
  useEffect(() => {
    const h = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center border rounded-lg transition-all
        ${disabled ? 'bg-slate-50 border-slate-200 cursor-not-allowed'
          : open ? 'bg-white border-[#1A438A] shadow-sm ring-2 ring-[#1A438A]/10'
          : hasError ? 'bg-white border-red-400 ring-2 ring-red-400/10'
          : 'bg-white border-slate-200 hover:border-[#4686B7]'
        }`}>
        <input ref={inputRef} type="text" value={open ? query : value}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(''); }}
          onFocus={() => { setOpen(true); setQuery(''); }}
          placeholder={value || placeholder || 'Type to search...'}
          disabled={disabled}
          className="flex-1 px-3.5 py-2.5 text-sm bg-transparent focus:outline-none rounded-lg text-slate-800 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
        />
        {value && !disabled && (
          <button type="button" onMouseDown={(e) => { e.preventDefault(); onChange(''); setQuery(''); }}
            className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-slate-500 mr-1">
            <X className="w-3 h-3" />
          </button>
        )}
        <button type="button" disabled={disabled} onMouseDown={(e) => { e.preventDefault(); if (!disabled) setOpen(!open); }}
          className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-[#1A438A] mr-2 disabled:pointer-events-none">
          <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180 text-[#1A438A]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {open && !disabled && (
        <div className={`absolute z-30 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden ${dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3.5 py-4 text-center text-sm text-slate-400">No matches found</div>
            ) : filtered.map((opt) => (
              <button key={opt} type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(opt); setQuery(''); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors
                  ${value === opt ? 'bg-[#1A438A] text-white font-medium' : 'text-slate-700 hover:bg-[#EEF3F8] hover:text-[#1A438A]'}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PanelSection({ title, children, overflowVisible = false }: { title: string; children: React.ReactNode; overflowVisible?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm ${overflowVisible ? 'overflow-visible' : 'overflow-hidden'}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">{title}</span>
      </div>
      {children}
    </div>
  );
}

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
            <div>
              <p className="text-white font-bold text-sm">Attach Documents</p>
              <p className="text-white/60 text-[11px] mt-0.5 truncate max-w-[280px]">{docLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        {canRemove && (
          <div className="p-5">
            <div onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-[#1A438A] bg-[#EEF3F8] scale-[1.01]' : 'border-slate-200 hover:border-[#4686B7] hover:bg-slate-50'}`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-colors ${dragging ? 'bg-[#1A438A]' : 'bg-slate-100'}`}>
                <Upload className={`w-6 h-6 ${dragging ? 'text-white' : 'text-slate-400'}`} />
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-1">{dragging ? 'Drop files here' : 'Drag & drop files here'}</p>
              <p className="text-[11px] text-slate-400">or click to browse</p>
              <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
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
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{f.name}</p>
                    <p className="text-[11px] text-slate-400">{formatBytes(f.size)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { const url = f.fileUrl || URL.createObjectURL(f.file); window.open(url, '_blank'); }} className="w-7 h-7 rounded-lg hover:bg-[#EEF3F8] flex items-center justify-center text-slate-400 hover:text-[#1A438A]"><Eye className="w-3.5 h-3.5" /></button>
                    {canRemove && <button onClick={() => onRemove(f.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
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

function ValidationModal({ errors, onClose }: { errors: string[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 border-b border-red-100">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0"><AlertCircle className="w-5 h-5 text-red-500" /></div>
          <div>
            <h3 className="text-red-700 font-bold text-sm">Required Fields Missing</h3>
            <p className="text-red-500 text-[11px] mt-0.5">Please fill in all mandatory fields before submitting.</p>
          </div>
        </div>
        <div className="p-5 space-y-2">
          {errors.map((err, i) => (
            <div key={i} className="flex items-center gap-2.5 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
              <span className="text-sm text-red-700 font-medium">{err}</span>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            Got it, I'll fix these
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function Form6PageContent() {
  const [showSignOut, setShowSignOut] = useState(false);
  const searchParams = useSearchParams();
  const urlMode = (searchParams.get('mode') as FormMode) ?? 'new';
  const submissionId = searchParams.get('id');
  const mode = urlMode;
  const router = useRouter();
  const isReadOnly = mode === 'view';
  const { data: session } = useSession();

  const [submissionNo, setSubmissionNo] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState('');
  const [submissionData, setSubmissionData] = useState<any>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructionsText, setInstructionsText] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [showBackModal, setShowBackModal] = useState(false);
  const [uploadPopup, setUploadPopup] = useState<{ docKey: string; docLabel: string; docId: string } | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [docIdMap, setDocIdMap] = useState<Record<string, string>>({});
  const [docFiles, setDocFiles] = useState<Record<string, AttachedFile[]>>({});
  const docFilesRef = useRef<Record<string, AttachedFile[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<{ id: number; actor: string; role: string; action: string; timestamp: string }[]>([]);

  // ── Form 6 fields ──
  const [nameOfApplicant, setNameOfApplicant] = useState('');
  const [sapCostCenter, setSapCostCenter] = useState('');
  const [trademarkClass, setTrademarkClass] = useState('');
  const [artworkOrWord, setArtworkOrWord] = useState('');
  const [remarks, setRemarks] = useState('');

  // Approver state
  const [bum, setBum] = useState('');
  const [fbp, setFbp] = useState('');
  const [clusterHead, setClusterHead] = useState('');
  const [bumOptions, setBumOptions] = useState<string[]>([]);
  const [fbpOptions, setFbpOptions] = useState<string[]>([]);
  const [clusterOptions, setClusterOptions] = useState<string[]>([]);
  const [userIdMap, setUserIdMap] = useState<Record<string, string>>({});
  const [commentInput, setCommentInput] = useState('');
  const [comments, setComments] = useState<CommentEntry[]>([]);

  // Load users
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => {
      if (!data.success) return;
      const users = data.data;
      const idMap: Record<string, string> = {};
      users.forEach((u: any) => { if (u.name) idMap[u.name] = u.id; idMap[u.email] = u.id; });
      setUserIdMap(idMap);
      const toNames = (role: string) => users.filter((u: any) => u.role === role && u.isActive).map((u: any) => u.name || u.email);
      setBumOptions(toNames('BUM'));
      setFbpOptions(toNames('FBP'));
      setClusterOptions(toNames('CLUSTER_HEAD'));
      // Pre-fill applicant from company codes (use first company or user dept)
    }).catch(() => {});
  }, []);

  // Load form config
  useEffect(() => {
    fetch('/api/settings/forms').then(r => r.json()).then(data => {
      if (data.success) {
        const config = data.data.find((c: any) => c.formId === 6);
        if (config?.instructions) setInstructionsText(config.instructions);
      }
    }).catch(() => {});
  }, []);

  // Load submission for view/edit
  useEffect(() => {
    if (mode === 'new' || !submissionId) { setSubmissionNo(generateSubmissionId()); return; }
    fetch(`/api/submissions/${submissionId}`).then(r => r.json()).then(d => {
      if (!d.success) return;
      const s = d.data;
      setSubmissionNo(s.submissionNo);
      setSubmissionData(s);
      setSubmissionStatus(s.status ?? '');
      setSapCostCenter(s.sapCostCenter ?? '');
      // nameOfApplicant stored in companyCode field for this form
      setNameOfApplicant(s.companyCode ?? '');
      try {
        const scope = JSON.parse(s.scopeOfAgreement || '{}');
        setTrademarkClass(scope.trademarkClass ?? '');
        setArtworkOrWord(scope.artworkOrWord ?? '');
        setRemarks(scope.remarks ?? '');
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
        s.documents.forEach((doc: any) => {
          idMap[doc.label] = doc.id;
          if (doc.fileUrl) loaded[doc.label] = [{ id: doc.id, name: doc.label, size: 0, file: { name: doc.label, size: 0 } as File, fileUrl: doc.fileUrl }];
        });
        setDocFiles(loaded);
        setDocIdMap(idMap);
      }
      if (s.comments?.length) {
        setComments(s.comments.map((c: any, i: number) => ({
          id: i, author: c.authorName, text: c.text,
          time: new Date(c.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        })));
      }
    }).catch(() => {});
  }, [mode, submissionId]);

  // Required docs — always Artwork
  const requiredDocs = BASE_DOCS.map(d => ({ label: d, key: d }));

  // ── Validation ──
  const validate = (): string[] => {
    const errors: string[] = [];
    if (!nameOfApplicant.trim()) errors.push('Name of the Applicant is required');
    if (!sapCostCenter)          errors.push('SAP Cost Center is required');
    if (!trademarkClass)         errors.push('Trademark & Classes is required');
    if (!artworkOrWord.trim())   errors.push('Artwork or word is required');
    if (!bum)                    errors.push('BUM is required');
    if (!fbp)                    errors.push('FBP is required');
    if (!clusterHead)            errors.push('Cluster Head is required');
    return errors;
  };

  const errors = submitted ? validate() : [];
  const hasError = (field: string) => submitted && errors.some(e => e.toLowerCase().includes(field.toLowerCase()));

  const isTerminalStatus = ['COMPLETED', 'CANCELLED'].includes(submissionStatus);
  const canUploadDocs = !isTerminalStatus;
  const canRemoveDocs = !isReadOnly;
  const currentStep = (() => {
    if (mode !== 'view') return 0;
    const loStage = (submissionData as any)?.loStage || '';
    if (submissionStatus === 'DRAFT') return 0;
    if (submissionStatus === 'PENDING_APPROVAL' || submissionStatus === 'SENT_BACK') return 1;
    if (submissionStatus === 'PENDING_LEGAL_GM') return 2;
    if (submissionStatus === 'PENDING_LEGAL_OFFICER' && (loStage === 'ACTIVE' || loStage === 'INITIAL_REVIEW' || loStage === 'ASSIGN_COURT_OFFICER')) return 3;
    if (submissionStatus === 'PENDING_SPECIAL_APPROVER' && (loStage === 'FINALIZATION' || loStage === 'POST_GM_APPROVAL')) return 4;
    if (submissionStatus === 'PENDING_SPECIAL_APPROVER') return 3;
    if (submissionStatus === 'PENDING_LEGAL_GM_FINAL') return 4;
    if (submissionStatus === 'PENDING_LEGAL_OFFICER' && (loStage === 'POST_GM_APPROVAL' || loStage === 'FINALIZATION')) return 5;
    if (submissionStatus === 'COMPLETED' || submissionStatus === 'CANCELLED') return 5;
    return 1;
  })();

  const scopePayload = () => JSON.stringify({ trademarkClass, artworkOrWord, remarks });

  // ── Submit ──
  const handleSubmitClick = async (asDraft = false) => {
    if (!asDraft) {
      const errs = validate();
      if (errs.length > 0) { setValidationErrors(errs); setShowValidation(true); return; }
    }
    setIsSubmitting(true);
    try {
      const payload = {
        submissionNo, formId: 6, formName: 'Registration of a Trademark',
        status: asDraft ? 'DRAFT' : 'PENDING_APPROVAL',
        initiatorId: session?.user?.id || '',
        initiatorName: session?.user?.name || '',
        companyCode: nameOfApplicant,   // reusing companyCode field for applicant name
        sapCostCenter,
        title: 'Registration of a Trademark',
        scopeOfAgreement: scopePayload(),
        term: trademarkClass,
        lkrValue: '0',
        remarks,
        initiatorComments: artworkOrWord,
        legalOfficerId: '',
        bumId: userIdMap[bum] || bum,
        fbpId: userIdMap[fbp] || fbp,
        clusterHeadId: userIdMap[clusterHead] || clusterHead,
        parties: [],
        ...(mode === 'resubmit' && submissionId && { parentId: submissionId, isResubmission: true }),
      };
      const isDraftEdit = mode === 'draft' && submissionId;
      const res = await fetch(isDraftEdit ? `/api/submissions/${submissionId}` : '/api/submissions', {
        method: isDraftEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isDraftEdit ? {
          status: asDraft ? 'DRAFT' : 'PENDING_APPROVAL',
          companyCode: nameOfApplicant, sapCostCenter,
          scopeOfAgreement: scopePayload(), term: trademarkClass,
          remarks, initiatorComments: artworkOrWord,
        } : payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Server error: ${res.status}`); }
      const data = await res.json();
      if (data.submissionNo) setSubmissionNo(data.submissionNo);
      if (mode === 'resubmit' && submissionId) {
        await fetch(`/api/submissions/${submissionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'RESUBMITTED' }) });
      }
      // Upload files
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
      }
      if (asDraft) { router.push(ROUTES.HOME); }
      else if (mode === 'resubmit') { router.push(ROUTES.HOME); }
      else { setShowSuccess(true); }
    } catch (err: any) {
      setValidationErrors([err.message || 'Submission failed.']); setShowValidation(true);
    } finally { setIsSubmitting(false); }
  };

  const addFilesToDoc = (docKey: string, newFiles: AttachedFile[]) =>
    setDocFiles(prev => { const next = { ...prev, [docKey]: [...(prev[docKey] || []), ...newFiles] }; docFilesRef.current = next; return next; });

  const removeFileFromDoc = (docKey: string, fileId: string) =>
    setDocFiles(prev => ({ ...prev, [docKey]: (prev[docKey] || []).filter(f => f.id !== fileId) }));

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
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><Tag className="w-5 h-5 text-white" /></div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">Registration of a Trademark</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono tracking-wide">16/FM/1641/07/06</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {mode !== 'new' && (
                  <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border backdrop-blur-sm
                    ${mode === 'view' ? 'bg-blue-500/20 text-blue-200 border-blue-400/30' : 'bg-orange-500/20 text-orange-200 border-orange-400/30'}`}>
                    {mode === 'view' ? 'View Only' : 'Resubmission'}
                  </span>
                )}
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 6</div>
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

              {/* Request by — auto-filled */}
              <div>
                <FieldLabel required>Request by (name)</FieldLabel>
                <div className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 font-medium">
                  {session?.user?.name || '—'}
                </div>
              </div>

              {/* Name of the Applicant (Company Code) */}
              <div>
                <FieldLabel required>Name of the Applicant</FieldLabel>
                <SelectField
                  value={nameOfApplicant}
                  onChange={setNameOfApplicant}
                  options={COMPANY_CODES}
                  placeholder="Select company..."
                  disabled={isReadOnly}
                  hasError={hasError('applicant')}
                />
                <FieldError message={hasError('applicant') ? 'Name of the Applicant is required' : undefined} />
              </div>

              {/* SAP Cost Center */}
              <div>
                <FieldLabel required>SAP Cost Center</FieldLabel>
                <ComboBox
                  value={sapCostCenter}
                  onChange={setSapCostCenter}
                  options={SAP_COST_CENTERS}
                  placeholder="Select cost center..."
                  disabled={isReadOnly}
                  hasError={hasError('sap')}
                />
                <FieldError message={hasError('sap') ? 'SAP Cost Center is required' : undefined} />
              </div>

              {/* Trademark & Classes */}
              <div>
                <FieldLabel required>Trademark &amp; Classes</FieldLabel>
                <ComboBox
                  value={trademarkClass}
                  onChange={setTrademarkClass}
                  options={TRADEMARK_CLASSES}
                  placeholder="Search NICE Classification..."
                  disabled={isReadOnly}
                  hasError={hasError('trademark')}
                />
                <FieldError message={hasError('trademark') ? 'Trademark & Classes is required' : undefined} />
              </div>

              {/* Artwork or word */}
              <div>
                <FieldLabel required>Artwork or word</FieldLabel>
                <TextField
                  value={artworkOrWord}
                  onChange={setArtworkOrWord}
                  placeholder="Enter artwork name or word to register..."
                  disabled={isReadOnly}
                  hasError={hasError('artwork')}
                />
                <FieldError message={hasError('artwork') ? 'Artwork or word is required' : undefined} />
              </div>

              {/* Remarks */}
              <div>
                <FieldLabel>Remarks</FieldLabel>
                <TextAreaField
                  value={remarks}
                  onChange={setRemarks}
                  placeholder="Any additional remarks..."
                  rows={3}
                  disabled={isReadOnly}
                />
              </div>

            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-[296px] flex-shrink-0 flex flex-col gap-4">

          {/* Workflow Tracker */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-5">
              {mode !== 'new' ? (
                <button onClick={() => setShowLog(true)} className="text-[11px] font-semibold text-[#1A438A] hover:underline">View Log</button>
              ) : <div />}
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
                    ${i < currentStep ? 'bg-[#1A438A] border-[#1A438A]'
                    : i === currentStep ? 'bg-[#1A438A] border-[#1A438A] ring-4 ring-[#1A438A]/15'
                    : 'bg-white border-slate-300'}`}>
                    {i < currentStep && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                    {i === currentStep && <div className="w-2 h-2 rounded-full bg-white" />}
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
              <button onClick={() => setShowInstructions(true)} className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                Instructions
              </button>
            </div>
            <div className="p-3 space-y-1.5 min-h-[72px]">
              {requiredDocs.map((doc, i) => {
                const files = docFiles[doc.key] || [];
                const hasFiles = files.length > 0;
                return (
                  <div key={doc.key} className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all
                    ${hasFiles ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                    <div className="flex-1 mr-2 min-w-0">
                      <span className="text-[11px] text-slate-600 leading-tight block">
                        <span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{doc.label}
                      </span>
                      {hasFiles && <span className="text-[10px] text-emerald-600 font-semibold">{files.length} file{files.length > 1 ? 's' : ''} attached</span>}
                    </div>
                    {uploadingDoc === doc.key ? (
                      <Loader2 className="w-4 h-4 text-[#1A438A] animate-spin flex-shrink-0" />
                    ) : canUploadDocs ? (
                      <button onClick={() => setUploadPopup({ docKey: doc.key, docLabel: doc.label, docId: docIdMap[doc.label] || '' })} className="flex-shrink-0 transition-colors">
                        {hasFiles ? <CheckCircle2 className="w-4 h-4 text-emerald-500 hover:text-emerald-600" /> : <Paperclip className="w-4 h-4 text-[#1183B7] hover:text-[#1A438A]" />}
                      </button>
                    ) : hasFiles && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
            {/* Documents Prepared by Legal Department */}
            <div className="border-t border-slate-100">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/80">
                <div className="w-0.5 h-3.5 rounded-full bg-[#1A438A]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#17293E]">Documents by Legal Dept.</span>
              </div>
              <div className="px-3 py-2 space-y-1.5">
                {(() => {
                  const loDocsFromDB = (submissionData as any)?.documents?.filter((d: any) => d.type?.startsWith('LO_PREPARED')) || [];
                  if (loDocsFromDB.length === 0) return <p className="text-[11px] text-slate-400 italic px-1">No documents added yet</p>;
                  return loDocsFromDB.map((d: any) => (
                    <div key={d.id} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-[#EEF3F8] border border-[#1A438A]/20">
                      <FileText className="w-3.5 h-3.5 text-[#1A438A]" />
                      <span className="text-[11px] font-semibold text-[#1A438A] flex-1 truncate">{d.label}</span>
                      {d.fileUrl && <button onClick={() => window.open(d.fileUrl, '_blank')} className="w-6 h-6 rounded flex items-center justify-center text-[#1A438A] hover:bg-[#1A438A]/10 transition-colors"><Eye className="w-3.5 h-3.5" /></button>}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Approvals */}
          <PanelSection title="Approvals" overflowVisible>
            <div className="p-4 space-y-3.5">
              <div>
                <FieldLabel required>BUM</FieldLabel>
                <ComboBox value={bum} onChange={setBum} options={bumOptions} placeholder="Type or select BUM..." disabled={isReadOnly} hasError={hasError('bum')} />
                <FieldError message={hasError('bum') ? 'BUM is required' : undefined} />
              </div>
              <div>
                <FieldLabel required>FBP</FieldLabel>
                <ComboBox value={fbp} onChange={setFbp} options={fbpOptions} placeholder="Type or select FBP..." disabled={isReadOnly} hasError={hasError('fbp')} />
                <FieldError message={hasError('fbp') ? 'FBP is required' : undefined} />
              </div>
              <div>
                <FieldLabel required>Cluster Head</FieldLabel>
                <ComboBox value={clusterHead} onChange={setClusterHead} options={clusterOptions} placeholder="Type or select Cluster Head..." disabled={isReadOnly} hasError={hasError('cluster head')} dropUp />
                <FieldError message={hasError('cluster head') ? 'Cluster Head is required' : undefined} />
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
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all
                ${commentInput ? 'border-[#1A438A] bg-white ring-2 ring-[#1A438A]/10' : 'border-slate-200 bg-slate-50/80'}`}>
                <input type="text" value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && commentInput.trim()) { setComments(prev => [...prev, { id: Date.now(), author: session?.user?.name || 'You', text: commentInput.trim(), time: 'Just now' }]); setCommentInput(''); } }}
                  placeholder="Post your comment here" disabled={isReadOnly}
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
                />
                <button
                  onClick={() => { if (commentInput.trim()) { setComments(prev => [...prev, { id: Date.now(), author: session?.user?.name || 'You', text: commentInput.trim(), time: 'Just now' }]); setCommentInput(''); } }}
                  disabled={isReadOnly || !commentInput.trim()}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </PanelSection>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button onClick={() => setShowBackModal(true)} disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all duration-200 disabled:opacity-50">
              <ArrowLeft className="w-4 h-4" />Back
            </button>
            {!isReadOnly && mode !== 'resubmit' && (
              <button onClick={() => handleSubmitClick(true)} disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all duration-200 active:scale-95 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                {isSubmitting ? 'Saving...' : 'Save Draft'}
              </button>
            )}
            {!isReadOnly && (
              <button onClick={() => { setSubmitted(true); handleSubmitClick(false); }} disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all duration-200 active:scale-95 shadow-lg shadow-[#AC9C2F]/25 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)' }}>
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Submitting...
                  </span>
                ) : mode === 'resubmit' ? 'Resubmit' : 'Submit'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {uploadPopup && (
        <UploadPopup docLabel={uploadPopup.docLabel} files={docFiles[uploadPopup.docKey] || []}
          onAdd={(files) => addFilesToDoc(uploadPopup.docKey, files)}
          onRemove={(id) => removeFileFromDoc(uploadPopup.docKey, id)}
          canRemove={canRemoveDocs} onClose={() => setUploadPopup(null)}
          onConfirm={async () => {
            const files = docFiles[uploadPopup.docKey] || [];
            const newFiles = files.filter(f => !f.fileUrl && f.file);
            if (!newFiles.length || !submissionId) { setUploadPopup(null); return; }
            setUploadingDoc(uploadPopup.docKey);
            for (const f of newFiles) {
              try {
                const fd = new FormData(); fd.append('file', f.file); fd.append('submissionId', submissionId);
                const ur = await fetch('/api/upload', { method: 'POST', body: fd });
                const ud = await ur.json();
                if (ud.success && ud.url) {
                  setDocFiles(prev => ({ ...prev, [uploadPopup.docKey]: (prev[uploadPopup.docKey] || []).map(df => df.id === f.id ? { ...df, fileUrl: ud.url } : df) }));
                  if (uploadPopup.docId) await fetch(`/api/submissions/${submissionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: uploadPopup.docId, fileUrl: ud.url, documentStatus: 'UPLOADED' }) });
                }
              } catch {}
            }
            setUploadingDoc(null); setUploadPopup(null);
          }}
        />
      )}

      {showBackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBackModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4"><AlertCircle className="w-6 h-6 text-amber-500" /></div>
            <h3 className="text-[#17293E] font-bold text-base mb-1">Leave this form?</h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">Your progress will be lost if you go back without saving.</p>
            <div className="flex flex-col gap-2 w-full">
              <button onClick={() => handleSubmitClick(true)} disabled={isSubmitting} className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Save as Draft & Go Back</button>
              <button onClick={() => router.push(ROUTES.HOME)} disabled={isSubmitting} className="w-full py-2.5 rounded-xl font-bold text-sm border-2 border-red-200 text-red-500 hover:bg-red-50 transition-all">Discard & Go Back</button>
              <button onClick={() => setShowBackModal(false)} disabled={isSubmitting} className="w-full py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-all">Cancel, Stay Here</button>
            </div>
          </div>
        </div>
      )}

      {showValidation && <ValidationModal errors={validationErrors} onClose={() => setShowValidation(false)} />}

      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowInstructions(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[82vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white font-bold text-base">Instructions</span>
              <button onClick={() => setShowInstructions(false)} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {instructionsText ? (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{instructionsText}</p>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm text-amber-800 font-medium leading-relaxed">No instructions configured yet. Please contact the Legal GM.</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => setShowInstructions(false)} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)' }}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-green-500/30" style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-[#17293E] text-xl font-bold mb-2">Successfully Submitted!</h2>
            <p className="text-slate-500 text-sm mb-4 leading-relaxed">Your Trademark Registration request has been submitted and sent for parallel approval to BUM, FBP and Cluster Head.</p>
            <div className="w-full bg-[#f0f4f9] rounded-xl px-6 py-3 mb-6">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Submission No.</p>
              <p className="text-[#1A438A] font-bold text-lg font-mono">{submissionNo || '—'}</p>
            </div>
            <button onClick={() => { setShowSuccess(false); router.push(ROUTES.HOME); }} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95 shadow-lg shadow-[#1A438A]/20" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              Return to Home
            </button>
          </div>
        </div>
      )}

      {showLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowLog(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white font-bold text-base">Workflow Log</span>
              <button onClick={() => setShowLog(false)} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
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
              <button onClick={() => setShowLog(false)} className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Close</button>
            </div>
          </div>
        </div>
      )}

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

export default function Form6Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <Form6PageContent />
    </Suspense>
    
  );
}