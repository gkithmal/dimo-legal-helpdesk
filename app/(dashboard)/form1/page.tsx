'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Home, Lightbulb, Search, Settings, User,
  FileText, Paperclip, CheckCircle2, X, Upload, File,
  Eye, Trash2, Send, AlertCircle, ArrowLeft, Loader2,
} from 'lucide-react';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';

// ─── Types ────────────────────────────────────────────────────────────────────

type FormMode = 'new' | 'view' | 'resubmit' | 'draft';

interface Party {
  type: string;
  name: string;
}

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  file: File;
  fileUrl?: string;
}

interface CommentEntry {
  id: number;
  author: string;
  text: string;
  time: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANY_CODES = [
  'DIMO - Dialog Axiata PLC',
  'DMSL - Dialog Mobile Solutions Ltd',
  'DTSL - Dialog Television (Pvt) Ltd',
  'DPSL - Dialog Platforms (Pvt) Ltd',
  'DBSL - Dialog Business Solutions Ltd',
];

const CONTRACT_TITLES = [
  'Service Agreement',
  'Maintenance Agreement',
  'Non-Disclosure Agreement (NDA)',
  'Memorandum of Understanding (MOU)',
  'Supply Agreement',
  'Distribution Agreement',
  'Software License Agreement',
  'Consultancy Agreement',
  'Employment Agreement',
  'Lease Agreement',
];

const SAP_COST_CENTERS = [
  '000003999 - IT Department',
  '000004001 - Finance Department',
  '000004002 - HR Department',
  '000004003 - Operations Department',
  '000004004 - Legal Department',
  '000004005 - Marketing Department',
  '000004006 - Technology Division',
];

const LEGAL_OFFICERS = [
  'Ashan Fernando',
  'Priya Jayasuriya',
  'Dimuthu Bandara',
  'Sachini Perera',
  'Nuwan Silva',
];

const BUMS = [
  'Rajith Dissanayake',
  'Malika Wickremasinghe',
  'Chamara Gunasekera',
  'Tharushi Madushanka',
  'Asanka Jayawardena',
];

const FBPS = [
  'Dilshan Ranasinghe',
  'Samanthi Liyanage',
  'Buddhika Amarasinghe',
  'Nadeeka Weerasinghe',
  'Prasad Kumara',
];

const CLUSTER_HEADS = [
  'Nalin Perera',
  'Anusha Rathnayake',
  'Gayan Wijesinghe',
  'Thilini Senanayake',
  'Shehan Mendis',
];

const REQUIRED_DOCS: Record<string, string[]> = {
  Company: [
    'Certificate of Incorporation',
    'Form 1 (Company Registration)',
    'Articles of Association',
    'Board Resolution',
    'VAT Registration Certificate',
  ],
  Partnership: [
    'Partnership Agreement',
    'Business Registration Certificate',
    'NIC copies of all Partners',
  ],
  'Sole proprietorship': [
    'Business Registration Certificate',
    'NIC copy of Proprietor',
  ],
  Individual: [
    'NIC copy',
    'Proof of Address',
  ],
};

// Common documents always required regardless of party type
const COMMON_DOCS = [
  'Form 15 (latest form)',
  'Form 13 (latest form if applicable)',
  'Form 20 (latest form if applicable)',
];

const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' },
  { label: 'First Level\nApprovals' },
  { label: 'Legal GM\nReview' },
  { label: 'Legal Officer\nReview' },
  { label: 'GM Final\nApproval' },
  { label: 'Ready to\nCollect' },
];

const INSTRUCTIONS_TEXT = [
  'Please read the following instructions carefully before filling out this form.',
  'Select the correct Company Code that corresponds to the Dialog entity entering into this agreement.',
  'Choose the Agreement Title that best describes the nature of the contract.',
  'Enter all parties to the agreement, including their legal type and full registered name.',
  'Select the SAP Cost Center that will bear the cost of this agreement.',
  'Describe the full scope of the agreement — what services or goods are being exchanged.',
  'Specify the commencement date, end/expiry date, and any renewal terms clearly.',
  'Enter the total monetary value of the agreement in Sri Lankan Rupees (LKR).',
  'Attach all required documents based on the party types selected. Documents must be certified copies.',
  'Select the appropriate Legal Officer, BUM, FBP, and Cluster Head for routing and approval.',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSubmissionId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
  return `LHD_${datePart}_${seq}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeText(val: string): string {
  return val.replace(/[<>]/g, '');
}

function sanitizePartyName(val: string): string {
  return val.replace(/[<>{}[\]]/g, '');
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-inherit rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── ComboBox ─────────────────────────────────────────────────────────────────

function ComboBox({
  value, onChange, options, placeholder, disabled = false, dropUp = false, hasError = false,
}: {
  value: string; onChange: (v: string) => void; options: string[];
  placeholder?: string; disabled?: boolean; dropUp?: boolean; hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (opt: string) => { onChange(opt); setQuery(''); setOpen(false); };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    if (e.target.value === '') onChange('');
  };
  const handleFocus = () => { setOpen(true); setQuery(''); };
  const handleClear = () => { onChange(''); setQuery(''); inputRef.current?.focus(); };

  const displayValue = open ? query : value;

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center border rounded-lg transition-all duration-150
        ${disabled
          ? 'bg-slate-50 border-slate-200 cursor-not-allowed'
          : open
            ? 'bg-white border-[#1A438A] shadow-sm ring-2 ring-[#1A438A]/10'
            : hasError
              ? 'bg-white border-red-400 ring-2 ring-red-400/10'
              : 'bg-white border-slate-200 hover:border-[#4686B7] hover:shadow-sm'
        }`}>
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={value ? value : (placeholder || 'Type to search...')}
          disabled={disabled}
          className={`flex-1 px-3.5 py-2.5 text-sm bg-transparent focus:outline-none rounded-lg
            ${disabled ? 'cursor-not-allowed text-slate-400' : 'text-slate-800'}
            ${!open && value ? 'font-medium' : 'font-normal'}
            placeholder:text-slate-400 placeholder:font-normal`}
        />
        <div className="flex items-center pr-2 gap-0.5">
          {value && !disabled && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); handleClear(); }}
              className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-slate-500 transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
          <button type="button" disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); if (!disabled) { setOpen(!open); if (!open) inputRef.current?.focus(); }}}
            className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-[#1A438A] transition-colors disabled:pointer-events-none">
            <svg className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180 text-[#1A438A]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {open && !disabled && (
        <div className={`absolute z-30 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden
          ${dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
          {query && (
            <div className="flex items-center gap-2 px-3.5 py-2 border-b border-slate-100 bg-slate-50">
              <Search className="w-3 h-3 text-slate-400" />
              <span className="text-[11px] text-slate-400">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &quot;{query}&quot;
              </span>
            </div>
          )}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3.5 py-4 text-center text-sm text-slate-400">No matches found</div>
            ) : (
              filtered.map((opt) => (
                <button key={opt} type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                  className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors
                    ${value === opt ? 'bg-[#1A438A] text-white font-medium' : 'text-slate-700 hover:bg-[#EEF3F8] hover:text-[#1A438A]'}`}>
                  {value === opt ? opt : <HighlightMatch text={opt} query={query} />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Plain SelectField ────────────────────────────────────────────────────────

function SelectField({
  value, onChange, options, placeholder, disabled = false,
}: {
  value: string; onChange: (v: string) => void; options: string[];
  placeholder?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-sm text-left transition-all duration-150
          ${disabled
            ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
            : open
              ? 'bg-white border-[#1A438A] shadow-sm ring-2 ring-[#1A438A]/10'
              : 'bg-white border-slate-200 text-slate-700 hover:border-[#4686B7] hover:shadow-sm cursor-pointer'
          }`}>
        <span className={value ? 'text-slate-800 font-medium' : 'text-slate-400'}>{value || placeholder || 'Select...'}</span>
        <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180 text-[#1A438A]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

// ─── Field Components ─────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />{message}
    </p>
  );
}

function TextAreaField({ value, onChange, placeholder, hint, rows = 4, disabled = false, hasError = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  hint?: string; rows?: number; disabled?: boolean; hasError?: boolean;
}) {
  return (
    <div>
      <textarea value={value} onChange={(e) => onChange(sanitizeText(e.target.value))}
        placeholder={placeholder} rows={rows} disabled={disabled}
        className={`w-full px-3.5 py-2.5 rounded-lg border text-sm resize-none transition-all duration-150
          ${disabled
            ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
            : hasError
              ? 'bg-white border-red-400 ring-2 ring-red-400/10 focus:outline-none'
              : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'
          }`}
      />
      {hint && <p className="text-[11px] text-[#4686B7] mt-1.5 italic leading-snug">{hint}</p>}
    </div>
  );
}

function PartyNameField({ value, onChange, placeholder, disabled = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(sanitizePartyName(e.target.value))}
      placeholder={placeholder} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150
        ${disabled
          ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
          : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'
        }`}
    />
  );
}

function LKRField({ value, onChange, disabled = false, hasError = false }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; hasError?: boolean;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const stripped = e.target.value.replace(/,/g, '');
    if (!/^\d*\.?\d{0,2}$/.test(stripped)) return;
    const parts = stripped.split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    onChange(parts.length > 1 ? `${intPart}.${parts[1].slice(0, 2)}` : intPart);
  };
  const handleBlur = () => {
    if (!value) return;
    const stripped = value.replace(/,/g, '');
    const num = parseFloat(stripped);
    if (!isNaN(num)) {
      const intPart = Math.floor(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const cents = stripped.includes('.') ? stripped.split('.')[1].padEnd(2, '0').slice(0, 2) : '00';
      onChange(`${intPart}.${cents}`);
    }
  };
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 select-none pointer-events-none">LKR</span>
      <input type="text" value={value} onChange={handleChange} onBlur={handleBlur}
        placeholder="0.00" disabled={disabled}
        className={`w-full pl-12 pr-3.5 py-2.5 rounded-lg border text-sm font-mono transition-all duration-150
          ${disabled
            ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
            : hasError
              ? 'bg-white border-red-400 ring-2 ring-red-400/10 focus:outline-none'
              : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'
          }`}
      />
    </div>
  );
}

function TextField({ value, onChange, placeholder, disabled = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(sanitizeText(e.target.value))}
      placeholder={placeholder} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150
        ${disabled
          ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
          : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'
        }`}
    />
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
  onAdd: (f: AttachedFile[]) => void; onRemove: (id: string) => void; onClose: () => void; onConfirm?: () => void; canRemove?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    onAdd(Array.from(incoming).map((f) => ({
      id: `${Date.now()}-${Math.random()}`, name: f.name, size: f.size, file: f,
    })));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4"
          style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
              <Paperclip className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Attach Documents</p>
              <p className="text-white/60 text-[11px] mt-0.5 truncate max-w-[280px]">{docLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {canRemove && (<div className="p-5">
          <div onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)} onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200
              ${dragging ? 'border-[#1A438A] bg-[#EEF3F8] scale-[1.01]' : 'border-slate-200 hover:border-[#4686B7] hover:bg-slate-50'}`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-colors ${dragging ? 'bg-[#1A438A]' : 'bg-slate-100'}`}>
              <Upload className={`w-6 h-6 ${dragging ? 'text-white' : 'text-slate-400'}`} />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">{dragging ? 'Drop files here' : 'Drag & drop files here'}</p>
            <p className="text-[11px] text-slate-400">or click to browse from your computer</p>
            <p className="text-[11px] text-slate-300 mt-2">PDF, Word, Excel, Images — any file type accepted</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </div>
        </div>)}

        {files.length > 0 && (
          <div className="px-5 pb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Attached ({files.length})</p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#EEF3F8] flex items-center justify-center flex-shrink-0">
                    <File className="w-4 h-4 text-[#1A438A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{f.name}</p>
                    <p className="text-[11px] text-slate-400">{formatBytes(f.size)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { const url = f.fileUrl || URL.createObjectURL(f.file); window.open(url, '_blank'); }}
                      className="w-7 h-7 rounded-lg hover:bg-[#EEF3F8] flex items-center justify-center text-slate-400 hover:text-[#1A438A] transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {canRemove && (
                      <button onClick={() => onRemove(f.id)}
                        className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}




                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-5 pt-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:border-slate-300 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={() => { if (onConfirm) onConfirm(); else onClose(); }} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            Done {files.length > 0 && `(${files.length} file${files.length > 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Validation Error Modal ───────────────────────────────────────────────────

function ValidationModal({ errors, onClose }: { errors: string[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 border-b border-red-100">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
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
          <button onClick={onClose} className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            Got it, I&apos;ll fix these
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function Form1PageContent() {
  const [showSignOut, setShowSignOut] = useState(false);
  const searchParams = useSearchParams();
  const urlMode = (searchParams.get('mode') as FormMode) ?? 'new';
  const submissionId = searchParams.get('id');
  const mode = urlMode;
  const router = useRouter();
  const isReadOnly = mode === 'view';
  const isDraft = mode === 'draft';

  const [submissionNo, setSubmissionNo] = useState('');
  const [submissionData, setSubmissionData] = useState<any>(null);
  useEffect(() => {
    if (mode === 'new' || !submissionId) {
      setSubmissionNo(generateSubmissionId());
      return;
    }
    fetch(`/api/submissions/${submissionId}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) return;
        const s = d.data;
        setSubmissionNo(s.submissionNo);
        setSubmissionData(s);
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
            if (a.role === 'BUM') setBum(a.approverName || '');
            if (a.role === 'FBP') setFbp(a.approverName || '');
            if (a.role === 'CLUSTER_HEAD') setClusterHead(a.approverName || '');
          });
        }
        // Always read LO from submission directly — LEGAL_OFFICER never appears in approvals[]
        setLegalOfficer(s.legalOfficerName || s.assignedLegalOfficer || '');
        // Build audit log
        const ROLE_LABEL: Record<string,string> = {
          BUM: 'BUM', FBP: 'FBP', CLUSTER_HEAD: 'Cluster Head',
          LEGAL_GM: 'Legal GM', LEGAL_OFFICER: 'Legal Officer', SPECIAL_APPROVER: 'Special Approver',
        };
        const STATUS_MAP: Record<string,string> = {
          PENDING_APPROVAL: 'Pending First Level Approvals',
          PENDING_LEGAL_GM: 'Pending Legal GM Review',
          PENDING_LEGAL_OFFICER: 'Pending Legal Officer Review',
          PENDING_SPECIAL_APPROVER: 'Pending Special Approver',
          PENDING_LEGAL_GM_FINAL: 'Pending Legal GM Final Approval',
          COMPLETED: 'Completed',
          SENT_BACK: 'Sent Back to Initiator',
          CANCELLED: 'Cancelled',
        };
        const fmt = (d: string) => d ? new Date(d).toLocaleString('en-GB', { day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
        const logEntries: {id:number;actor:string;role:string;action:string;timestamp:string}[] = [
          { id: 0, actor: 'System', role: 'System', action: 'Submission created — ' + (STATUS_MAP[s.status] || s.status), timestamp: fmt(s.createdAt) },
          ...(s.approvals || [])
            .filter((a: any) => a.actionDate)
            .map((a: any, i: number) => ({
              id: i + 1,
              actor: a.approverName || a.role,
              role: ROLE_LABEL[a.role] || a.role,
              action: a.status === 'APPROVED' ? 'Approved' : a.status === 'SENT_BACK' ? 'Sent Back' : 'Cancelled',
              timestamp: fmt(a.actionDate),
            })),
          ...(s.comments || []).map((c: any, i: number) => ({
            id: 1000 + i,
            actor: c.authorName,
            role: ROLE_LABEL[c.authorRole] || c.authorRole,
            action: 'Comment: "' + c.text + '"',
            timestamp: fmt(c.createdAt),
          })),
          ...(s.specialApprovers || [])
            .filter((sa: any) => sa.actionDate)
            .map((sa: any, i: number) => ({
              id: 2000 + i,
              actor: sa.approverName,
              role: 'Special Approver',
              action: sa.status === 'APPROVED' ? 'Approved' : 'Sent Back',
              timestamp: fmt(sa.actionDate),
            })),
        ].sort((a, b) => a.id - b.id);
        setLog(logEntries);
        if (s.documents?.length) {
          const loaded: Record<string, AttachedFile[]> = {};
          const idMap: Record<string, string> = {};
          s.documents.forEach((doc: any) => {
            idMap[doc.label] = doc.id;
            if (doc.fileUrl) {
              loaded[doc.label] = [{ id: doc.id, name: doc.label, size: 0, file: { name: doc.label, size: 0 } as File, fileUrl: doc.fileUrl }];
            }
          });
          setDocFiles(loaded);
          setDocIdMap(idMap);
        }
      })
      .catch((err) => console.error("Failed to load data:", err));
  }, [mode, submissionId]);

  // ── UI state ──
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructionsText, setInstructionsText] = useState<string>('');
  const [formConfigDocs, setFormConfigDocs] = useState<{ label: string; type: string }[]>([]);
  useEffect(() => {
    fetch('/api/settings/forms')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const config = data.data.find((c: any) => c.formId === 1);
          if (config?.instructions) setInstructionsText(config.instructions);
          if (config?.docs?.length) setFormConfigDocs(config.docs);
        }
      })
      .catch(() => {});
  }, []);
  const [showSuccess, setShowSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [showBackModal, setShowBackModal] = useState(false);
  const [uploadPopup, setUploadPopup] = useState<{ docKey: string; docLabel: string; docId: string } | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [docIdMap, setDocIdMap] = useState<Record<string, string>>({});
  const [docFiles, setDocFiles] = useState<Record<string, AttachedFile[]>>({});
  const docFilesRef = useRef<Record<string, AttachedFile[]>>({});

  // ── NEW: loading & submission tracking ──
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Form fields ──
  const [companyCode, setCompanyCode] = useState('');
  const [title, setTitle] = useState('');
  const [parties, setParties] = useState<Party[]>([
    { type: '', name: '' }, { type: '', name: '' }, { type: '', name: '' },
    { type: '', name: '' }, { type: '', name: '' },
  ]);
  const [sapCostCenter, setSapCostCenter] = useState('000003999 - IT Department');
  const [scopeOfAgreement, setScopeOfAgreement] = useState('');
  const [term, setTerm] = useState('');
  const [lkrValue, setLkrValue] = useState('');
  const [remarks, setRemarks] = useState('');
  const [initiatorComments, setInitiatorComments] = useState('');
  const { data: session } = useSession();
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        if (!data.success) return;
        const users: {id:string,name:string,email:string,role:string,isActive:boolean}[] = data.data;
        const idMap: Record<string,string> = {};
        users.forEach(u => { if (u.name) idMap[u.name] = u.id; idMap[u.email] = u.id; });
        setUserIdMap(idMap);
        const toNames = (role: string) => users.filter(u => u.role === role && u.isActive).map(u => u.name || u.email);
        setBumOptions(toNames('BUM'));
        setFbpOptions(toNames('FBP'));
        setClusterOptions(toNames('CLUSTER_HEAD'));
        setLegalOfficerOptions(toNames('LEGAL_OFFICER'));
      }).catch((err) => console.error("Failed to load data:", err));
  }, []);
  const [bumOptions, setBumOptions] = useState<string[]>([]);
  const [fbpOptions, setFbpOptions] = useState<string[]>([]);
  const [clusterOptions, setClusterOptions] = useState<string[]>([]);
  const [legalOfficerOptions, setLegalOfficerOptions] = useState<string[]>([]);
  const [userIdMap, setUserIdMap] = useState<Record<string,string>>({});
  const [legalOfficer, setLegalOfficer] = useState('');
  const [bum, setBum] = useState('');
  const [fbp, setFbp] = useState('');
  const [clusterHead, setClusterHead] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<{id:number;actor:string;role:string;action:string;timestamp:string}[]>([]);

  // ── Derived ──
  const selectedTypes = Array.from(new Set(parties.map((p) => p.type).filter(Boolean)));
  const requiredDocs: { label: string; key: string }[] = [];
  if (formConfigDocs.length > 0) {
    // Use admin-configured docs from settings — filter by selected party types + Common
    formConfigDocs.forEach((doc) => {
      const normalizedType = doc.type.replace('-', ' '); // handle Sole-proprietorship vs Sole proprietorship
      if (doc.type === 'Common' || selectedTypes.includes(doc.type) || selectedTypes.includes(normalizedType)) {
        if (!requiredDocs.find((d) => d.key === doc.label)) {
          requiredDocs.push({ label: doc.label, key: doc.label });
        }
      }
    });
  } else {
    // Fallback to hardcoded if settings not yet configured
    selectedTypes.forEach((type) => {
      (REQUIRED_DOCS[type] || []).forEach((doc) => {
        const key = doc;
        if (!requiredDocs.find((d) => d.key === key)) requiredDocs.push({ label: doc, key });
      });
    });
    if (requiredDocs.length > 0) {
      COMMON_DOCS.forEach((doc) => {
        if (!requiredDocs.find((d) => d.key === doc)) requiredDocs.push({ label: doc, key: doc });
      });
    }
  }

  const hasAtLeastOneParty = parties.some((p) => p.type && p.name.trim());

  // ── Validation ──
  const validate = (): string[] => {
    const errors: string[] = [];
    if (!companyCode)             errors.push('Company Code is required');
    if (!title)                   errors.push('Title is required');
    if (!hasAtLeastOneParty)      errors.push('At least one Party (Type + Name) is required');
    if (!sapCostCenter)           errors.push('SAP Cost Center is required');
    if (!scopeOfAgreement.trim()) errors.push('Scope of Agreement is required');
    if (!term.trim())             errors.push('Term is required');
    if (!lkrValue)                errors.push('Value (LKR) is required');
    if (!legalOfficer)            errors.push('Legal Officer is required');
    if (!bum)                     errors.push('BUM is required');
    if (!fbp)                     errors.push('FBP is required');
    if (!clusterHead)             errors.push('Cluster Head is required');
    return errors;
  };

  const errors = submitted ? validate() : [];
  const hasError = (field: string) => submitted && errors.some((e) => e.toLowerCase().includes(field.toLowerCase()));

  // ── API Submit ──────────────────────────────────────────────────────────────
  const handleSubmitClick = async (asDraft = false) => {
    if (!asDraft) {
      const errs = validate();
      if (errs.length > 0) {
        setValidationErrors(errs);
        setShowValidation(true);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // For resubmit: generate new submission number with _R1 suffix
      const finalSubmissionNo = mode === 'resubmit' && submissionId
        ? submissionNo.replace(/_R\d+$/, '') + '_R' + (parseInt(submissionNo.match(/_R(\d+)$/)?.[1] || '0') + 1)
        : submissionNo;

      const payload = {
        submissionNo: finalSubmissionNo,
        status: asDraft ? 'DRAFT' : 'PENDING_APPROVAL',
        initiatorId: session?.user?.id || '',
        initiatorName: session?.user?.name || '',
        companyCode,
        title,
        sapCostCenter,
        scopeOfAgreement,
        term,
        lkrValue: lkrValue.replace(/,/g, ''),
        remarks,
        initiatorComments,
        legalOfficerId: userIdMap[legalOfficer] || legalOfficer,
        bumId: userIdMap[bum] || bum,
        fbpId: userIdMap[fbp] || fbp,
        clusterHeadId: userIdMap[clusterHead] || clusterHead,
        parties: parties.filter((p) => p.type && p.name.trim()),
        ...(mode === 'resubmit' && submissionId && {
          parentId: submissionId,
          isResubmission: true,
        }),
      };

      // If editing a draft, PATCH the existing record instead of creating a new one
      const isDraftEdit = mode === 'draft' && submissionId; // resubmit always POSTs new record with parentId
      const res = await fetch(isDraftEdit ? `/api/submissions/${submissionId}` : '/api/submissions', {
        method: isDraftEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isDraftEdit ? {
          status: asDraft ? 'DRAFT' : 'PENDING_APPROVAL',
          companyCode, title, sapCostCenter, scopeOfAgreement, term,
          lkrValue: lkrValue.replace(/,/g, ''), remarks, initiatorComments,
        } : payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      if (data.submissionNo) setSubmissionNo(data.submissionNo);

      // Mark original as RESUBMITTED so it leaves the initiator's active list
      if (mode === 'resubmit' && submissionId) {
        await fetch(`/api/submissions/${submissionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'RESUBMITTED' }),
        });
      }

      // Upload pending files now that we have real submission ID + doc IDs
      if (!asDraft && data.data?.id && data.data?.documents?.length) {
        const newSubmissionId = data.data.id;
        const docLabelToId: Record<string, string> = {};
        data.data.documents.forEach((d: { id: string; label: string }) => {
          docLabelToId[d.label] = d.id;
        });
        const uploadPromises: Promise<void>[] = [];
        for (const [docKey, files] of Object.entries(docFilesRef.current)) {
          for (const f of files as AttachedFile[]) {
            if (f.file && !f.fileUrl) {
              const docId = docLabelToId[docKey] || docLabelToId[f.name] || "";
              const promise = (async () => {
                const fd = new FormData();
                fd.append("file", f.file);
                fd.append("submissionId", newSubmissionId);
                const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
                const uploadData = await uploadRes.json();
                if (uploadData.success && uploadData.url && docId) {
                  await fetch(`/api/submissions/${newSubmissionId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ documentId: docId, fileUrl: uploadData.url, documentStatus: "UPLOADED" }),
                  });
                }
              })();
              uploadPromises.push(promise);
            }
          }
        }
        await Promise.all(uploadPromises);
      }

      if (asDraft) {
        setShowBackModal(false);
        router.push(ROUTES.HOME);
      } else if (mode === 'resubmit') {
        router.push(ROUTES.HOME);
      } else {
        setShowSuccess(true);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      setValidationErrors([message]);
      setShowValidation(true);
    } finally {
      setIsSubmitting(false);
    }
  };
  // ───────────────────────────────────────────────────────────────────────────

  const updateParty = (i: number, field: keyof Party, val: string) => {
    const updated = [...parties];
    updated[i] = { ...updated[i], [field]: val };
    setParties(updated);
  };

  const handlePostComment = () => {
    if (!commentInput.trim()) return;
    setComments((prev) => [...prev, { id: Date.now(), author: session?.user?.name || 'You', text: commentInput.trim(), time: 'Just now' }]);
    setCommentInput('');
  };

  const addFilesToDoc = (docKey: string, newFiles: AttachedFile[]) =>
    setDocFiles((prev) => { const next = { ...prev, [docKey]: [...(prev[docKey] || []), ...newFiles] }; docFilesRef.current = next; return next; });

  const removeFileFromDoc = (docKey: string, fileId: string) =>
    setDocFiles((prev) => ({ ...prev, [docKey]: (prev[docKey] || []).filter((f) => f.id !== fileId) }));

  const statusToStep: Record<string, number> = {
    'DRAFT': 0,
    'PENDING_APPROVAL': 1,
    'PENDING_LEGAL_GM': 2,
    'PENDING_LEGAL_OFFICER': 3,
    'PENDING_SPECIAL_APPROVER': 3,
    'PENDING_LEGAL_GM_FINAL': 4,
    'COMPLETED': 5,
    'CANCELLED': 5,
    'SENT_BACK': 1,
  };
  const [submissionStatus, setSubmissionStatus] = useState('');
  const canUploadDocs = !isReadOnly || ['PENDING_APPROVAL', 'SENT_BACK', 'DRAFT'].includes(submissionStatus);
  const currentStep = mode === 'view' ? (statusToStep[submissionStatus] ?? 1) : 0;

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* ── Sidebar ── */}
      <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen"
        style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
        <div className="relative mb-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">O</div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]" />
        </div>
        <div className="text-center">
          <p className="text-white text-[10px] font-semibold">{session?.user?.name?.split(' ')[0] || 'Me'}</p>
          <p className="text-white/40 text-[9px]">{session?.user?.name?.split(' ').slice(1).join(' ') || ''}</p>
        </div>
        <div className="w-8 h-px bg-white/10" />
        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          <NotificationBell />
          <button onClick={() => router.push('/home')} className="relative w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all" title="Home">
              <Home className="w-[18px] h-[18px]" />
            </button>
            <button className="relative w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all" title="Tips">
              <Lightbulb className="w-[18px] h-[18px]" />
            </button>
            <button className="relative w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all" title="Search">
              <Search className="w-[18px] h-[18px]" />
            </button>
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <button onClick={() => router.push('/settings')} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all" title="Settings">
              <Settings className="w-[18px] h-[18px]" />
            </button>
            <button onClick={() => setShowSignOut(true)} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all" title="Sign Out">
              <User className="w-[18px] h-[18px]" />
            </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex gap-5 p-5 overflow-auto min-w-0">

        {/* ── Left: Form ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Header */}
          <div className="rounded-2xl overflow-hidden shadow-sm"
            style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">Contract Review Form</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono tracking-wide">16/FM/1641/07/01</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {mode !== 'new' && (
                  <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border backdrop-blur-sm
                    ${mode === 'view' ? 'bg-blue-500/20 text-blue-200 border-blue-400/30' : 'bg-orange-500/20 text-orange-200 border-orange-400/30'}`}>
                    {mode === 'view' ? 'View Only' : 'Resubmission'}
                  </span>
                )}
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 1</div>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Company Code</FieldLabel>
                  <ComboBox value={companyCode} onChange={setCompanyCode} options={COMPANY_CODES}
                    placeholder="Type or select company code..." disabled={isReadOnly} hasError={hasError('company code')} />
                  <FieldError message={hasError('company code') ? 'Company Code is required' : undefined} />
                </div>
                <div>
                  <FieldLabel required>Title</FieldLabel>
                  <ComboBox value={title} onChange={setTitle} options={CONTRACT_TITLES}
                    placeholder="Type or select agreement title..." disabled={isReadOnly} hasError={hasError('title')} />
                  <FieldError message={hasError('title') ? 'Title is required' : undefined} />
                </div>
              </div>

              <SectionDivider>Parties to the Agreement</SectionDivider>

              <div className="grid grid-cols-2 gap-4 -mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">Type <span className="text-red-400">*</span></p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">Name of the Party <span className="text-red-400">*</span></p>
              </div>

              {parties.map((party, i) => (
                <div key={i} className="grid grid-cols-2 gap-4">
                  <SelectField value={party.type} onChange={(v) => updateParty(i, 'type', v)}
                    options={['Company', 'Partnership', 'Sole proprietorship', 'Individual']}
                    placeholder="Select type..." disabled={isReadOnly} />
                  <PartyNameField value={party.name} onChange={(v) => updateParty(i, 'name', v)}
                    placeholder="Enter party name..." disabled={isReadOnly} />
                </div>
              ))}
              <FieldError message={hasError('party') ? 'At least one Party (Type + Name) is required' : undefined} />

              <SectionDivider>Agreement Details</SectionDivider>

              <div>
                <FieldLabel required>SAP Cost Center</FieldLabel>
                <ComboBox value={sapCostCenter} onChange={setSapCostCenter} options={SAP_COST_CENTERS}
                  placeholder="Type or select cost center..." disabled={isReadOnly} hasError={hasError('sap cost center')} />
                <FieldError message={hasError('sap cost center') ? 'SAP Cost Center is required' : undefined} />
              </div>

              <div>
                <FieldLabel required>Scope of Agreement</FieldLabel>
                <TextAreaField value={scopeOfAgreement} onChange={setScopeOfAgreement}
                  placeholder="Describe the full scope and purpose of this agreement..."
                  rows={4} disabled={isReadOnly} hasError={hasError('scope')} />
                <FieldError message={hasError('scope') ? 'Scope of Agreement is required' : undefined} />
              </div>

              <div>
                <FieldLabel required>Term</FieldLabel>
                <TextAreaField value={term} onChange={setTerm}
                  placeholder="Enter commencement date, end/expiry date and renewal terms..."
                  hint="Please include the date of commencement and the end/expiry date."
                  rows={3} disabled={isReadOnly} hasError={hasError('term')} />
                <FieldError message={hasError('term') ? 'Term is required' : undefined} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Value (LKR)</FieldLabel>
                  <LKRField value={lkrValue} onChange={setLkrValue} disabled={isReadOnly} hasError={hasError('value')} />
                  <FieldError message={hasError('value') ? 'Value (LKR) is required' : undefined} />
                </div>
                <div>
                  <FieldLabel>Remarks</FieldLabel>
                  <TextField value={remarks} onChange={setRemarks} placeholder="Optional remarks..." disabled={isReadOnly} />
                </div>
              </div>

              <div>
                <FieldLabel>Initiator Comments</FieldLabel>
                <TextField value={initiatorComments} onChange={setInitiatorComments}
                  placeholder="Any additional comments for the Legal team..." disabled={isReadOnly} />
              </div>

              <div>
                <FieldLabel required>Legal Officer</FieldLabel>
                <ComboBox value={legalOfficer} onChange={setLegalOfficer} options={legalOfficerOptions}
                  placeholder="Type or select legal officer..." disabled={isReadOnly}
                  hasError={hasError('legal officer')} dropUp />
                <FieldError message={hasError('legal officer') ? 'Legal Officer is required' : undefined} />
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
            <div className="flex items-center justify-between px-4 py-3"
              style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
              <button onClick={() => setShowInstructions(true)}
                className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                Instructions
              </button>
            </div>
            <div className="p-3 space-y-1.5 min-h-[96px]">
              {requiredDocs.length === 0 ? (
                <div className="py-5 text-center">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
                    <Paperclip className="w-5 h-5 text-slate-300" />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">Select party types to see<br />required documents</p>
                </div>
              ) : (
                requiredDocs.map((doc, i) => {
                  const files = docFiles[doc.key] || [];
                  const hasFiles = files.length > 0;
                  return (
                    <div key={doc.key}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all
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
                      ) : (
                        hasFiles && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t border-slate-100">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/80">
                <div className="w-0.5 h-3.5 rounded-full bg-[#1A438A]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#17293E]">Documents by Legal Dept.</span>
              </div>
              <div className="px-3 py-2 space-y-1.5">
                {(() => {
                  const loDocs = Object.entries(docFiles).filter(([key]) => key.startsWith('LO_PREPARED'));
                  const loDocsFromDB = (submissionData as any)?.documents?.filter((d: any) => d.type?.startsWith('LO_PREPARED')) || [];
                  if (loDocsFromDB.length === 0) return <p className="text-[11px] text-slate-400 italic px-1">No documents added yet</p>;
                  return loDocsFromDB.map((d: any) => (
                    <div key={d.id} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-[#EEF3F8] border border-[#1A438A]/20">
                      <FileText className="w-3.5 h-3.5 text-[#1A438A]" />
                      <span className="text-[11px] font-semibold text-[#1A438A] flex-1 truncate">{d.label}</span>
                      <span className="text-[9px] uppercase font-bold text-[#4686B7] bg-[#1A438A]/10 px-1.5 py-0.5 rounded">
                        {d.type === 'LO_PREPARED_FINAL' ? 'Final' : 'Initial'}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            {/* LO-Requested Additional Documents */}
            {(() => {
              const requested = (submissionData as any)?.documents?.filter((d: any) => d.type === 'LO_REQUESTED') || [];
              if (requested.length === 0) return null;
              return (
                <div className="border-t border-amber-100">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50/80">
                    <div className="w-0.5 h-3.5 rounded-full bg-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Requested by Legal</span>
                  </div>
                  <div className="px-3 py-2 space-y-1.5">
                    {requested.map((d: any) => {
                      const files = docFiles[d.label] || [];
                      const hasFiles = files.length > 0;
                      return (
                        <div key={d.id}
                          className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all ${hasFiles ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                          <div className="flex-1 mr-2 min-w-0">
                            <span className="text-[11px] text-slate-600 leading-tight block">{d.label}</span>
                            {hasFiles && <span className="text-[10px] text-emerald-600 font-semibold">{files.length} file{files.length > 1 ? 's' : ''} attached</span>}
                          </div>
                          {uploadingDoc === d.label ? (
                            <Loader2 className="w-4 h-4 text-amber-500 animate-spin flex-shrink-0" />
                          ) : canUploadDocs ? (
                            <button onClick={() => setUploadPopup({ docKey: d.label, docLabel: d.label, docId: d.id })} className="flex-shrink-0 transition-colors">
                              {hasFiles ? <CheckCircle2 className="w-4 h-4 text-emerald-500 hover:text-emerald-600" /> : <Paperclip className="w-4 h-4 text-amber-500 hover:text-amber-600" />}
                            </button>
                          ) : (
                            hasFiles && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            </div>
          </div>

          {/* Approvals */}
          <PanelSection title="Approvals">
            <div className="p-4 space-y-3.5">
              <div>
                <FieldLabel required>BUM</FieldLabel>
                <ComboBox value={bum} onChange={setBum} options={bumOptions}
                  placeholder="Type or select BUM..." disabled={isReadOnly} hasError={hasError('bum')} />
                <FieldError message={hasError('bum') ? 'BUM is required' : undefined} />
              </div>
              <div>
                <FieldLabel required>FBP</FieldLabel>
                <ComboBox value={fbp} onChange={setFbp} options={fbpOptions} disabled={isReadOnly}
                  placeholder="Type or select FBP..." hasError={hasError('fbp')} dropUp />
                <FieldError message={hasError('fbp') ? 'FBP is required' : undefined} />
              </div>
              <div>
                <FieldLabel required>Cluster Head</FieldLabel>
                <ComboBox value={clusterHead} onChange={setClusterHead} options={clusterOptions} disabled={isReadOnly}
                  placeholder="Type or select Cluster Head..." hasError={hasError('cluster head')} dropUp />
                <FieldError message={hasError('cluster head') ? 'Cluster Head is required' : undefined} />
              </div>
            </div>
          </PanelSection>

          {/* Comments */}
          <PanelSection title="Comments">
            <div className="p-3">
              {comments.length > 0 && (
                <div className="mb-3 space-y-2 max-h-36 overflow-y-auto">
                  {comments.map((c) => (
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
                  onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                  placeholder="Post your comment here" disabled={isReadOnly}
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
                />
                <button onClick={handlePostComment} disabled={isReadOnly || !commentInput.trim()}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </PanelSection>

          {/* ── Action Buttons ── */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowBackModal(true)}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            {!isReadOnly && mode !== 'resubmit' && (
              <button
                onClick={() => handleSubmitClick(true)}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                {isSubmitting ? 'Saving...' : 'Save Draft'}
              </button>
            )}
            {!isReadOnly && (
              <button
                onClick={() => { setSubmitted(true); handleSubmitClick(false); }}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all duration-200 active:scale-95 shadow-lg shadow-[#AC9C2F]/25 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
                style={{ background: 'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)' }}>
                {isSubmitting
                  ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Submitting...
                    </span>
                  )
                  : mode === 'resubmit' ? 'Resubmit' : 'Submit'
                }
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Upload Popup ── */}
      {uploadPopup && (
        <UploadPopup
          docLabel={uploadPopup.docLabel}
          files={docFiles[uploadPopup.docKey] || []}
          onAdd={(files) => addFilesToDoc(uploadPopup.docKey, files)}
          onRemove={(id) => removeFileFromDoc(uploadPopup.docKey, id)}
          canRemove={canUploadDocs}
          onClose={() => setUploadPopup(null)}
          onConfirm={async () => {
            const files = docFiles[uploadPopup.docKey] || [];
            const newFiles = files.filter(f => !f.fileUrl && f.file);
            if (newFiles.length === 0) { setUploadPopup(null); return; }
            // If no submissionId yet (new form), just store files locally
            // Post-submit loop will upload them with the real submission ID
            if (!submissionId) { setUploadPopup(null); return; }
            setUploadingDoc(uploadPopup.docKey);
            for (const f of newFiles) {
              try {
                const fd = new FormData();
                fd.append("file", f.file);
                fd.append("submissionId", submissionId);
                const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
                const uploadData = await uploadRes.json();
                if (uploadData.success && uploadData.url) {
                  setDocFiles(prev => ({
                    ...prev,
                    [uploadPopup.docKey]: (prev[uploadPopup.docKey] || []).map(df =>
                      df.id === f.id ? { ...df, fileUrl: uploadData.url } : df
                    )
                  }));
                  if (uploadPopup.docId) {
                    await fetch(`/api/submissions/${submissionId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ documentId: uploadPopup.docId, fileUrl: uploadData.url, documentStatus: "UPLOADED" }),
                    });
                  }
                }
              } catch (e) { console.error("Upload failed", e); }
            }
            setUploadingDoc(null);
            setUploadPopup(null);
          }}
        />
      )}

      {/* ── Back / Leave Modal ── */}
      {showBackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBackModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-amber-500" />
            </div>
            <h3 className="text-[#17293E] font-bold text-base mb-1">Leave this form?</h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              Your progress will be lost if you go back without saving.
            </p>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => handleSubmitClick(true)}
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
                style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </span>
                ) : 'Save as Draft & Go Back'}
              </button>
              <button
                onClick={() => router.push(ROUTES.HOME)}
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl font-bold text-sm border-2 border-red-200 text-red-500 hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                Discard & Go Back
              </button>
              <button
                onClick={() => setShowBackModal(false)}
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-all">
                Cancel, Stay Here
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Validation Modal ── */}
      {showValidation && (
        <ValidationModal errors={validationErrors} onClose={() => setShowValidation(false)} />
      )}

      {/* ── Instructions Modal ── */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowInstructions(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[82vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white font-bold text-base">Instructions</span>
              <button onClick={() => setShowInstructions(false)}
                className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {instructionsText ? (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{instructionsText}</p>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm text-amber-800 font-medium leading-relaxed">No instructions have been configured yet. Please contact the Legal GM.</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => setShowInstructions(false)}
                className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)' }}>
                Got it
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
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-green-500/30"
              style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-[#17293E] text-xl font-bold mb-2">Successfully Submitted!</h2>
            <p className="text-slate-500 text-sm mb-4 leading-relaxed">
              Your request has been submitted and sent for parallel approval to BUM, FBP and Cluster Head.
            </p>
            <div className="w-full bg-[#f0f4f9] rounded-xl px-6 py-3 mb-6">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Submission No.</p>
              <p className="text-[#1A438A] font-bold text-lg font-mono">{submissionNo || '—'}</p>
            </div>
            <button
              onClick={() => { setShowSuccess(false); router.push(ROUTES.HOME); }}
              className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95 shadow-lg shadow-[#1A438A]/20"
              style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              Return to Home
            </button>
          </div>
        </div>
      )}
      {showLog && <ViewLogModal log={log} onClose={() => setShowLog(false)} />}
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
function ViewLogModal({ log, onClose }: { log: {id:number;actor:string;role:string;action:string;timestamp:string}[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <span className="text-white font-bold text-base">Workflow Log</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {log.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No log entries yet.</p>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
              {log.map((entry, i) => (
                <div key={entry.id} className="relative mb-4">
                  <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center
                    ${i === 0 ? 'bg-slate-400 border-slate-400' : 'bg-[#1A438A] border-[#1A438A]'}`}>
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

export default function Form1Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <Form1PageContent />
    </Suspense>
  );
}