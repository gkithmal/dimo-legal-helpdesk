'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import {
  X, Home, Lightbulb, Search, Settings, User,
  ArrowLeft, FileText, CheckCircle2, Paperclip, AlertCircle,
  Send, Loader2, Calendar, Plus, Trash2, Upload, File, Eye,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AttachedFile { id: string; name: string; size: number; file: File; fileUrl?: string; }
interface CommentEntry { id: number; author: string; text: string; time: string; }
interface LogEntry { id: number; actor: string; role: string; action: string; timestamp: string; }
interface OwnerRow { name: string; address: string; }
interface LegalHistoryEntry {
  id: string; caseNo: string; court: string; outstandingAmount: string;
  prosecutionInfo: string; statusOfCase: string; remarks: string;
}
type CustomerType = 'Individual' | 'Sole-proprietorship' | 'Partnership' | 'Company' | '';
type FormMode = 'new' | 'view' | 'resubmit' | 'draft';

// ─── Constants ────────────────────────────────────────────────────────────────
const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' },
  { label: 'Approvals' },
  { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' },
  { label: 'Legal GM\nApproval' },
  { label: 'Ready to\nCollect' },
];

const FORM3_DOCS_BASE = [
  'Original Agreement (if any)',
  'Original Credit Application',
  'Copy of the Letter of Demand (LOD)',
  'Original Postal Article receipt for LOD',
  'Copies of Letters Sent to the Customer',
  'Original Letters Sent by the Customer',
  'Originals Documents referred to in the Account statement',
];

const FORM3_DOCS_BY_TYPE: Record<string, string[]> = {
  'Individual': ['NIC', 'Other (Individual)'],
  'Sole-proprietorship': ['NIC/passport of the sole proprietor', 'Business registration/sole proprietorship certificate', 'Other (Sole proprietorship)'],
  'Partnership': ['Partnership registration certificate', 'NIC/passport copies of every partner', 'Other (Partnership)'],
  'Company': ['Incorporation Certificate of the Company', 'Form 1, 13 or any other document to prove the registered address', 'Any other company related documents'],
};

const CUSTOMER_TYPES: CustomerType[] = ['Individual', 'Sole-proprietorship', 'Partnership', 'Company'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateSubmissionId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `LHD_${d}_${String(Math.floor(Math.random()*999)+1).padStart(3,'0')}`;
}
function formatBytes(b: number) { if (b<1024) return `${b} B`; if (b<1048576) return `${(b/1024).toFixed(1)} KB`; return `${(b/1048576).toFixed(1)} MB`; }
function sanitize(v: string) { return v.replace(/[<>]/g, ''); }

// ─── Field Components ─────────────────────────────────────────────────────────
function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{children}{required && <span className="text-red-400 ml-0.5">*</span>}</label>;
}
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1"><AlertCircle className="w-3 h-3 flex-shrink-0"/>{message}</p>;
}
function TextField({ value, onChange, placeholder, disabled=false, hasError=false, type='text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; hasError?: boolean; type?: string;
}) {
  return <input type={type} value={value} onChange={e=>onChange(sanitize(e.target.value))} placeholder={placeholder} disabled={disabled}
    className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150
      ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
      : hasError ? 'bg-white border-red-400 ring-2 ring-red-400/10 focus:outline-none'
      : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`} />;
}
function TextArea({ value, onChange, placeholder, rows=3, disabled=false, hasError=false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; disabled?: boolean; hasError?: boolean;
}) {
  return <textarea value={value} onChange={e=>onChange(sanitize(e.target.value))} placeholder={placeholder} rows={rows} disabled={disabled}
    className={`w-full px-3.5 py-2.5 rounded-lg border text-sm resize-none transition-all duration-150
      ${disabled ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
      : hasError ? 'bg-white border-red-400 ring-2 ring-red-400/10 focus:outline-none'
      : 'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`} />;
}
function SelectField({ value, onChange, options, placeholder, disabled=false, hasError=false }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean; hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-sm text-left transition-all duration-150
          ${disabled ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
          : hasError ? 'bg-white border-red-400 ring-2 ring-red-400/10'
          : open ? 'bg-white border-[#1A438A] shadow-sm ring-2 ring-[#1A438A]/10'
          : 'bg-white border-slate-200 text-slate-700 hover:border-[#4686B7] cursor-pointer'}`}>
        <span className={value ? 'text-slate-800 font-medium' : 'text-slate-400'}>{value || placeholder || 'Select...'}</span>
        <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180 text-[#1A438A]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)}/>
          <div className="absolute z-20 top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
            {options.map(opt => (
              <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors first:rounded-t-xl last:rounded-b-xl
                  ${value===opt ? 'bg-[#1A438A] text-white font-medium' : 'text-slate-700 hover:bg-[#EEF3F8] hover:text-[#1A438A]'}`}>
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
function ComboBox({ value, onChange, options, placeholder, disabled=false, hasError=false }: {
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
        <input ref={inputRef} type="text" value={open ? query : value} onChange={e=>{setQuery(e.target.value);setOpen(true);if(!e.target.value)onChange('');}}
          onFocus={()=>{setOpen(true);setQuery('');}} placeholder={value||placeholder||'Type to search...'} disabled={disabled}
          className={`flex-1 px-3.5 py-2.5 text-sm bg-transparent focus:outline-none rounded-lg ${disabled?'cursor-not-allowed text-slate-400':'text-slate-800'} ${!open&&value?'font-medium':''} placeholder:text-slate-400`}/>
        <div className="flex items-center pr-2 gap-0.5">
          {value && !disabled && <button type="button" onMouseDown={e=>{e.preventDefault();onChange('');setQuery('');}} className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-slate-500"><X className="w-3 h-3"/></button>}
          <button type="button" disabled={disabled} onMouseDown={e=>{e.preventDefault();if(!disabled){setOpen(!open);if(!open)inputRef.current?.focus();}}}
            className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-[#1A438A] disabled:pointer-events-none">
            <svg className={`w-4 h-4 transition-transform ${open?'rotate-180 text-[#1A438A]':''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>
        </div>
      </div>
      {open && !disabled && (
        <div className="absolute z-30 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden top-full mt-1.5 max-h-52 overflow-y-auto">
          {filtered.length===0 ? <div className="px-3.5 py-4 text-center text-sm text-slate-400">No matches found</div>
          : filtered.map(opt => <button key={opt} type="button" onMouseDown={e=>{e.preventDefault();onChange(opt);setQuery('');setOpen(false);}}
              className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors ${value===opt?'bg-[#1A438A] text-white font-medium':'text-slate-700 hover:bg-[#EEF3F8] hover:text-[#1A438A]'}`}>{opt}</button>)}
        </div>
      )}
    </div>
  );
}
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg px-4 py-2.5 mb-4 -mx-1" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
      <span className="text-white text-sm font-bold">{children}</span>
    </div>
  );
}
function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="h-px flex-1 bg-slate-100"/>
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{children}</span>
      <div className="h-px flex-1 bg-slate-100"/>
    </div>
  );
}

// ─── Upload Popup ─────────────────────────────────────────────────────────────
function UploadPopup({ docLabel, files, onAdd, onRemove, onClose, onConfirm, canRemove=true }: {
  docLabel: string; files: AttachedFile[]; onAdd: (f: AttachedFile[]) => void;
  onRemove: (id: string) => void; onClose: () => void; onConfirm?: () => void; canRemove?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFiles = (fl: FileList|null) => {
    if (!fl) return;
    onAdd(Array.from(fl).map(f => ({ id: `${Date.now()}-${Math.random()}`, name: f.name, size: f.size, file: f })));
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Paperclip className="w-4 h-4 text-white"/></div>
            <div><p className="text-white font-bold text-sm">Attach Documents</p><p className="text-white/60 text-[11px] truncate max-w-[280px]">{docLabel}</p></div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4"/></button>
        </div>
        {canRemove && (
          <div className="p-5">
            <div onDrop={e=>{e.preventDefault();setDragging(false);handleFiles(e.dataTransfer.files);}} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onClick={()=>inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging?'border-[#1A438A] bg-[#EEF3F8]':'border-slate-200 hover:border-[#4686B7] hover:bg-slate-50'}`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 ${dragging?'bg-[#1A438A]':'bg-slate-100'}`}><Upload className={`w-6 h-6 ${dragging?'text-white':'text-slate-400'}`}/></div>
              <p className="text-sm font-semibold text-slate-700 mb-1">{dragging?'Drop files here':'Drag & drop files here'}</p>
              <p className="text-[11px] text-slate-400">or click to browse</p>
              <input ref={inputRef} type="file" multiple className="hidden" onChange={e=>handleFiles(e.target.files)}/>
            </div>
          </div>
        )}
        {files.length > 0 && (
          <div className="px-5 pb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Attached ({files.length})</p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#EEF3F8] flex items-center justify-center flex-shrink-0"><File className="w-4 h-4 text-[#1A438A]"/></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-700 truncate">{f.name}</p><p className="text-[11px] text-slate-400">{formatBytes(f.size)}</p></div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={()=>window.open(f.fileUrl||URL.createObjectURL(f.file),'_blank')} className="w-7 h-7 rounded-lg hover:bg-[#EEF3F8] flex items-center justify-center text-slate-400 hover:text-[#1A438A]"><Eye className="w-3.5 h-3.5"/></button>
                    {canRemove && <button onClick={()=>onRemove(f.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="p-5 pt-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all">Cancel</button>
          <button onClick={()=>{if(onConfirm)onConfirm();else onClose();}} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>
            Done {files.length>0&&`(${files.length} file${files.length>1?'s':''})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Validation Modal ─────────────────────────────────────────────────────────
function ValidationModal({ errors, onClose }: { errors: string[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 border-b border-red-100">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0"><AlertCircle className="w-5 h-5 text-red-500"/></div>
          <div><h3 className="text-red-700 font-bold text-sm">Required Fields Missing</h3><p className="text-red-500 text-[11px] mt-0.5">Please fill in all mandatory fields.</p></div>
        </div>
        <div className="p-5 space-y-2">
          {errors.map((err,i) => (
            <div key={i} className="flex items-center gap-2.5 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0"/>
              <span className="text-sm text-red-700 font-medium">{err}</span>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>Got it, I&apos;ll fix these</button>
        </div>
      </div>
    </div>
  );
}

// ─── View Log Modal ───────────────────────────────────────────────────────────
function ViewLogModal({ log, onClose }: { log: LogEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>
          <span className="text-white font-bold text-base">Workflow Log</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4"/></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {log.length===0 ? <p className="text-sm text-slate-400 text-center py-8">No log entries yet.</p> : (
            <div className="relative pl-6">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200"/>
              {log.map((entry,i) => (
                <div key={entry.id} className="relative mb-4">
                  <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${i===0?'bg-slate-400 border-slate-400':'bg-[#1A438A] border-[#1A438A]'}`}><div className="w-1.5 h-1.5 rounded-full bg-white"/></div>
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
          <button onClick={onClose} className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>Close</button>
        </div>
      </div>
    </div>
  );
}
// ─── Customer Section ─────────────────────────────────────────────────────────
function CustomerSection({ customerType, data, onChange, disabled, submitted }: {
  customerType: CustomerType;
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  disabled: boolean;
  submitted: boolean;
}) {
  const err = (field: string, label: string) => submitted && !data[field] ? `${label} is required` : undefined;

  if (customerType === 'Individual') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Name of the Customer</FieldLabel><TextField value={data.customerName||''} onChange={v=>onChange('customerName',v)} disabled={disabled} hasError={!!err('customerName','Name')}/><FieldError message={err('customerName','Name')}/></div>
        <div><FieldLabel required>SAP BP Code</FieldLabel><TextField value={data.sapBpCode||''} onChange={v=>onChange('sapBpCode',v)} disabled={disabled} hasError={!!err('sapBpCode','SAP BP Code')}/><FieldError message={err('sapBpCode','SAP BP Code')}/></div>
      </div>
      <div><FieldLabel required>NIC No</FieldLabel><TextField value={data.nicNo||''} onChange={v=>onChange('nicNo',v.replace(/[^a-zA-Z0-9]/g,''))} disabled={disabled} hasError={!!err('nicNo','NIC')}/><FieldError message={err('nicNo','NIC')}/></div>
      <div><FieldLabel required>Residential Address</FieldLabel><TextField value={data.residentialAddress||''} onChange={v=>onChange('residentialAddress',v)} disabled={disabled} hasError={!!err('residentialAddress','Residential Address')}/><FieldError message={err('residentialAddress','Residential Address')}/></div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Contact No</FieldLabel><TextField value={data.contactNo||''} onChange={v=>onChange('contactNo',v)} disabled={disabled} hasError={!!err('contactNo','Contact No')}/><FieldError message={err('contactNo','Contact No')}/></div>
        <div><FieldLabel required>Email Address</FieldLabel><TextField value={data.emailAddress||''} onChange={v=>onChange('emailAddress',v)} type="email" disabled={disabled} hasError={!!err('emailAddress','Email')}/><FieldError message={err('emailAddress','Email')}/></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Outstanding Amount Rs.</FieldLabel><TextField value={data.outstandingAmount||''} onChange={v=>onChange('outstandingAmount',v)} disabled={disabled} hasError={!!err('outstandingAmount','Outstanding Amount')}/><FieldError message={err('outstandingAmount','Outstanding Amount')}/></div>
        <div><FieldLabel>If relevant to Service, Vehicle No</FieldLabel><TextField value={data.vehicleNo||''} onChange={v=>onChange('vehicleNo',v)} disabled={disabled}/></div>
      </div>
      <div><FieldLabel>Other Details</FieldLabel><TextArea value={data.otherDetails||''} onChange={v=>onChange('otherDetails',v)} disabled={disabled} rows={2}/></div>
    </div>
  );

  if (customerType === 'Sole-proprietorship') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Name of the Owner</FieldLabel><TextField value={data.ownerName||''} onChange={v=>onChange('ownerName',v)} disabled={disabled} hasError={!!err('ownerName','Owner Name')}/><FieldError message={err('ownerName','Owner Name')}/></div>
        <div><FieldLabel required>SAP BP Code</FieldLabel><TextField value={data.sapBpCode||''} onChange={v=>onChange('sapBpCode',v)} disabled={disabled} hasError={!!err('sapBpCode','SAP BP Code')}/><FieldError message={err('sapBpCode','SAP BP Code')}/></div>
      </div>
      <div><FieldLabel required>Residential Address</FieldLabel><TextField value={data.residentialAddress||''} onChange={v=>onChange('residentialAddress',v)} disabled={disabled} hasError={!!err('residentialAddress','Residential Address')}/><FieldError message={err('residentialAddress','Residential Address')}/></div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Business Name</FieldLabel><TextField value={data.businessName||''} onChange={v=>onChange('businessName',v)} disabled={disabled} hasError={!!err('businessName','Business Name')}/><FieldError message={err('businessName','Business Name')}/></div>
        <div><FieldLabel required>Business Registration No</FieldLabel><TextField value={data.businessRegNo||''} onChange={v=>onChange('businessRegNo',v)} disabled={disabled} hasError={!!err('businessRegNo','Business Reg No')}/><FieldError message={err('businessRegNo','Business Reg No')}/></div>
      </div>
      <div><FieldLabel required>Principal Place of Business</FieldLabel><TextField value={data.principalPlaceOfBusiness||''} onChange={v=>onChange('principalPlaceOfBusiness',v)} disabled={disabled} hasError={!!err('principalPlaceOfBusiness','Principal Place of Business')}/><FieldError message={err('principalPlaceOfBusiness','Principal Place of Business')}/></div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Contact No</FieldLabel><TextField value={data.contactNo||''} onChange={v=>onChange('contactNo',v)} disabled={disabled} hasError={!!err('contactNo','Contact No')}/><FieldError message={err('contactNo','Contact No')}/></div>
        <div><FieldLabel required>Email Address</FieldLabel><TextField value={data.emailAddress||''} onChange={v=>onChange('emailAddress',v)} type="email" disabled={disabled} hasError={!!err('emailAddress','Email')}/><FieldError message={err('emailAddress','Email')}/></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Outstanding Amount Rs.</FieldLabel><TextField value={data.outstandingAmount||''} onChange={v=>onChange('outstandingAmount',v)} disabled={disabled} hasError={!!err('outstandingAmount','Outstanding Amount')}/><FieldError message={err('outstandingAmount','Outstanding Amount')}/></div>
        <div><FieldLabel>If relevant to Service, Vehicle No</FieldLabel><TextField value={data.vehicleNo||''} onChange={v=>onChange('vehicleNo',v)} disabled={disabled}/></div>
      </div>
      <div><FieldLabel>Other Details</FieldLabel><TextArea value={data.otherDetails||''} onChange={v=>onChange('otherDetails',v)} disabled={disabled} rows={2}/></div>
    </div>
  );

  if (customerType === 'Partnership') return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Details of the Owners</FieldLabel>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-2 gap-0 bg-slate-50 border-b border-slate-200">
            <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Name <span className="text-red-400">*</span></div>
            <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-l border-slate-200">Residential Address <span className="text-red-400">*</span></div>
          </div>
          {(data.owners||[{name:'',address:''},{name:'',address:''}]).map((o: OwnerRow, i: number) => (
            <div key={i} className={`grid grid-cols-2 ${i<(data.owners||[]).length-1?'border-b border-slate-100':''}`}>
              <div className="px-2 py-2"><TextField value={o.name} onChange={v=>{const owners=[...(data.owners||[{name:'',address:''},{name:'',address:''}])];owners[i]={...owners[i],name:v};onChange('owners',owners);}} disabled={disabled} placeholder="Owner name"/></div>
              <div className="px-2 py-2 border-l border-slate-100"><TextField value={o.address} onChange={v=>{const owners=[...(data.owners||[{name:'',address:''},{name:'',address:''}])];owners[i]={...owners[i],address:v};onChange('owners',owners);}} disabled={disabled} placeholder="Residential address"/></div>
            </div>
          ))}
        </div>
        {!disabled && <button type="button" onClick={()=>{const owners=[...(data.owners||[{name:'',address:''},{name:'',address:''}]),{name:'',address:''}];onChange('owners',owners);}} className="mt-2 text-[11px] text-[#1A438A] font-semibold hover:underline flex items-center gap-1"><Plus className="w-3 h-3"/>Add Owner</button>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Business Name</FieldLabel><TextField value={data.businessName||''} onChange={v=>onChange('businessName',v)} disabled={disabled} hasError={!!err('businessName','Business Name')}/><FieldError message={err('businessName','Business Name')}/></div>
        <div><FieldLabel required>Business Registration No</FieldLabel><TextField value={data.businessRegNo||''} onChange={v=>onChange('businessRegNo',v)} disabled={disabled} hasError={!!err('businessRegNo','Business Reg No')}/><FieldError message={err('businessRegNo','Business Reg No')}/></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>SAP BP Code</FieldLabel><TextField value={data.sapBpCode||''} onChange={v=>onChange('sapBpCode',v)} disabled={disabled} hasError={!!err('sapBpCode','SAP BP Code')}/><FieldError message={err('sapBpCode','SAP BP Code')}/></div>
        <div><FieldLabel required>Principal Place of Business</FieldLabel><TextField value={data.principalPlaceOfBusiness||''} onChange={v=>onChange('principalPlaceOfBusiness',v)} disabled={disabled} hasError={!!err('principalPlaceOfBusiness','Principal Place of Business')}/><FieldError message={err('principalPlaceOfBusiness','Principal Place of Business')}/></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Contact No</FieldLabel><TextField value={data.contactNo||''} onChange={v=>onChange('contactNo',v)} disabled={disabled} hasError={!!err('contactNo','Contact No')}/><FieldError message={err('contactNo','Contact No')}/></div>
        <div><FieldLabel required>Email Address</FieldLabel><TextField value={data.emailAddress||''} onChange={v=>onChange('emailAddress',v)} type="email" disabled={disabled} hasError={!!err('emailAddress','Email')}/><FieldError message={err('emailAddress','Email')}/></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Outstanding Amount Rs.</FieldLabel><TextField value={data.outstandingAmount||''} onChange={v=>onChange('outstandingAmount',v)} disabled={disabled} hasError={!!err('outstandingAmount','Outstanding Amount')}/><FieldError message={err('outstandingAmount','Outstanding Amount')}/></div>
        <div><FieldLabel>If relevant to Service, Vehicle No</FieldLabel><TextField value={data.vehicleNo||''} onChange={v=>onChange('vehicleNo',v)} disabled={disabled}/></div>
      </div>
      <div><FieldLabel>Other Details</FieldLabel><TextArea value={data.otherDetails||''} onChange={v=>onChange('otherDetails',v)} disabled={disabled} rows={2}/></div>
    </div>
  );

  if (customerType === 'Company') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Company Name</FieldLabel><TextField value={data.companyName||''} onChange={v=>onChange('companyName',v)} disabled={disabled} hasError={!!err('companyName','Company Name')}/><FieldError message={err('companyName','Company Name')}/></div>
        <div><FieldLabel required>SAP BP Code</FieldLabel><TextField value={data.sapBpCode||''} onChange={v=>onChange('sapBpCode',v)} disabled={disabled} hasError={!!err('sapBpCode','SAP BP Code')}/><FieldError message={err('sapBpCode','SAP BP Code')}/></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Company Registration No</FieldLabel><TextField value={data.companyRegNo||''} onChange={v=>onChange('companyRegNo',v)} disabled={disabled} hasError={!!err('companyRegNo','Company Reg No')}/><FieldError message={err('companyRegNo','Company Reg No')}/></div>
        <div><FieldLabel required>Registered Address</FieldLabel><TextField value={data.registeredAddress||''} onChange={v=>onChange('registeredAddress',v)} disabled={disabled} hasError={!!err('registeredAddress','Registered Address')}/><FieldError message={err('registeredAddress','Registered Address')}/></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Contact No</FieldLabel><TextField value={data.contactNo||''} onChange={v=>onChange('contactNo',v)} disabled={disabled} hasError={!!err('contactNo','Contact No')}/><FieldError message={err('contactNo','Contact No')}/></div>
        <div><FieldLabel required>Email Address</FieldLabel><TextField value={data.emailAddress||''} onChange={v=>onChange('emailAddress',v)} type="email" disabled={disabled} hasError={!!err('emailAddress','Email')}/><FieldError message={err('emailAddress','Email')}/></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel required>Outstanding Amount Rs.</FieldLabel><TextField value={data.outstandingAmount||''} onChange={v=>onChange('outstandingAmount',v)} disabled={disabled} hasError={!!err('outstandingAmount','Outstanding Amount')}/><FieldError message={err('outstandingAmount','Outstanding Amount')}/></div>
        <div><FieldLabel>If relevant to Service, Vehicle No</FieldLabel><TextField value={data.vehicleNo||''} onChange={v=>onChange('vehicleNo',v)} disabled={disabled}/></div>
      </div>
      <div><FieldLabel>Other Details</FieldLabel><TextArea value={data.otherDetails||''} onChange={v=>onChange('otherDetails',v)} disabled={disabled} rows={2}/></div>
    </div>
  );

  return null;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function Form3PageContent() {
  const searchParams = useSearchParams();
  const urlMode = (searchParams.get('mode') as FormMode) ?? 'new';
  const submissionId = searchParams.get('id');
  const mode = urlMode;
  const router = useRouter();
  const { data: session } = useSession();
  const isReadOnly = mode === 'view';

  const [showSignOut, setShowSignOut] = useState(false);
  const [submissionNo, setSubmissionNo] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showBackModal, setShowBackModal] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructionsText, setInstructionsText] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [uploadPopup, setUploadPopup] = useState<{docKey: string; docLabel: string; docId: string}|null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string|null>(null);
  const [docFiles, setDocFiles] = useState<Record<string, AttachedFile[]>>({});
  const [docIdMap, setDocIdMap] = useState<Record<string, string>>({});
  const docFilesRef = useRef<Record<string, AttachedFile[]>>({});
  const [commentInput, setCommentInput] = useState('');
  const [comments, setComments] = useState<CommentEntry[]>([]);

  // ── Form fields ──
  const [demandDate, setDemandDate] = useState('');
  const [initiatorName, setInitiatorName] = useState('');
  const [initiatorContact, setInitiatorContact] = useState('');
  const [managerInCharge, setManagerInCharge] = useState('');
  const [officerInCharge, setOfficerInCharge] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [sapCostCenter, setSapCostCenter] = useState('');
  const [clusterNo, setClusterNo] = useState('');
  const [repName, setRepName] = useState('');
  const [repDesignation, setRepDesignation] = useState('');
  const [repNic, setRepNic] = useState('');
  const [repContact, setRepContact] = useState('');
  const [repEmail, setRepEmail] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('');
  const [customerData, setCustomerData] = useState<Record<string, any>>({});
  const [legalHistory, setLegalHistory] = useState<LegalHistoryEntry[]>([]);
  const [bum, setBum] = useState('');
  const [fbp, setFbp] = useState('');
  const [bumOptions, setBumOptions] = useState<string[]>([]);
  const [fbpOptions, setFbpOptions] = useState<string[]>([]);
  const [companyCodeOptions, setCompanyCodeOptions] = useState<string[]>([]);
  const [sapCostCenterOptions, setSapCostCenterOptions] = useState<string[]>([]);
  const [userIdMap, setUserIdMap] = useState<Record<string, string>>({});

  // Load users & settings
  useEffect(() => {
    fetch('/api/users').then(r=>r.json()).then(data => {
      if (!data.success) return;
      const users = data.data;
      const idMap: Record<string,string> = {};
      users.forEach((u: any) => { if (u.name) idMap[u.name]=u.id; idMap[u.email]=u.id; });
      setUserIdMap(idMap);
      setBumOptions(users.filter((u: any) => u.role==='BUM' && u.isActive).map((u: any) => u.name||u.email));
      setFbpOptions(users.filter((u: any) => u.role==='FBP' && u.isActive).map((u: any) => u.name||u.email));
    }).catch(()=>{});
    fetch('/api/settings/forms').then(r=>r.json()).then(data => {
      if (data.success) {
        const config = data.data.find((c: any) => c.formId === 3);
        if (config?.instructions) setInstructionsText(config.instructions);
      }
    }).catch(()=>{});
    // Load company codes and cost centers
    fetch('/api/users').then(r=>r.json()).catch(()=>{});
    // Seed some defaults
    setCompanyCodeOptions(['DM01 - DIMO PLC', '000003999', '000004001', '000004002', '000004003']);
    setSapCostCenterOptions(['000003999', '000004001', '000004002', '000004003', '000004004', '000004005']);
  }, []);

  // Pre-fill initiator name from session
  useEffect(() => {
    if (session?.user?.name && mode === 'new') setInitiatorName(session.user.name);
  }, [session, mode]);

  // Load existing submission for view/resubmit/draft modes
  useEffect(() => {
    if ((mode==='new') || !submissionId) { setSubmissionNo(generateSubmissionId()); return; }
    fetch(`/api/submissions/${submissionId}`).then(r=>r.json()).then(d => {
      if (!d.success) return;
      const s = d.data;
      setSubmissionNo(s.submissionNo);
      setSubmissionStatus(s.status||'');
      // Parse meta from scopeOfAgreement
      let meta: Record<string,any> = {};
      try { meta = JSON.parse(s.scopeOfAgreement||'{}'); } catch {}
      setDemandDate(meta.demandDate||'');
      setInitiatorName(meta.initiatorName||'');
      setInitiatorContact(meta.initiatorContact||'');
      setManagerInCharge(meta.managerInCharge||'');
      setOfficerInCharge(meta.officerInCharge||'');
      setCompanyCode(s.companyCode||'');
      setSapCostCenter(s.sapCostCenter||'');
      setClusterNo(meta.clusterNo||'');
      setRepName(meta.repName||'');
      setRepDesignation(meta.repDesignation||'');
      setRepNic(meta.repNic||'');
      setRepContact(meta.repContact||'');
      setRepEmail(meta.repEmail||'');
      setCustomerType(meta.customerType||'');
      setCustomerData(meta.customerData||{});
      setLegalHistory(meta.legalHistory||[]);
      if (s.approvals?.length) {
        s.approvals.forEach((a: any) => {
          if (a.role==='BUM') setBum(a.approverName||'');
          if (a.role==='FBP') setFbp(a.approverName||'');
        });
      }
      // Build log
      const fmt = (d: string) => d ? new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
      const logEntries: LogEntry[] = [
        { id:0, actor:'System', role:'System', action:'Submission created', timestamp: fmt(s.createdAt) },
        ...(s.approvals||[]).filter((a: any)=>a.actionDate).map((a: any,i: number)=>({
          id:i+1, actor:a.approverName||a.role, role:a.role,
          action: a.status==='APPROVED'?'Approved':a.status==='SENT_BACK'?'Sent Back':'Cancelled',
          timestamp: fmt(a.actionDate),
        })),
        ...(s.comments||[]).map((c: any,i: number)=>({ id:1000+i, actor:c.authorName, role:c.authorRole, action:`Comment: "${c.text}"`, timestamp:fmt(c.createdAt) })),
      ].sort((a,b)=>a.id-b.id);
      setLog(logEntries);
      if (s.documents?.length) {
        const loaded: Record<string,AttachedFile[]> = {};
        const idMap2: Record<string,string> = {};
        s.documents.forEach((doc: any) => {
          idMap2[doc.label] = doc.id;
          if (doc.fileUrl) loaded[doc.label] = [{ id:doc.id, name:doc.label, size:0, file:{name:doc.label,size:0} as File, fileUrl:doc.fileUrl }];
        });
        setDocFiles(loaded);
        setDocIdMap(idMap2);
      }
    }).catch(err=>console.error('Failed to load:', err));
  }, [mode, submissionId]);

  // ── Required docs based on customer type ──
  const requiredDocs: { label: string; key: string }[] = [
    ...(customerType ? FORM3_DOCS_BY_TYPE[customerType]||[] : []).map(l=>({label:l,key:l})),
    ...FORM3_DOCS_BASE.map(l=>({label:l,key:l})),
  ];

  // ── Validation ──
  const validate = (): string[] => {
    const errs: string[] = [];
    if (!demandDate) errs.push('Letter of Demand Sent Date is required');
    if (!initiatorName.trim()) errs.push('Initiator Name is required');
    if (!initiatorContact.trim()) errs.push('Initiator Contact No is required');
    if (!managerInCharge.trim()) errs.push('Manager in Charge is required');
    if (!officerInCharge.trim()) errs.push('Officer in Charge is required');
    if (!companyCode) errs.push('Company Code is required');
    if (!sapCostCenter) errs.push('SAP Cost Center is required');
    if (!clusterNo.trim()) errs.push('Cluster No is required');
    if (!repName.trim()) errs.push('Representative Name is required');
    if (!repDesignation.trim()) errs.push('Representative Designation is required');
    if (!repNic.trim()) errs.push('Representative NIC is required');
    if (!repContact.trim()) errs.push('Representative Contact No is required');
    if (!repEmail.trim()) errs.push('Representative Email Address is required');
    if (!customerType) errs.push('Type of Customer is required');
    if (!bum) errs.push('BUM is required');
    if (!fbp) errs.push('FBP is required');
    return errs;
  };

  const hasError = (field: string) => submitted && validate().some(e => e.toLowerCase().includes(field.toLowerCase()));

  // ── Build meta JSON ──
  const buildMeta = () => JSON.stringify({
    demandDate, initiatorName, initiatorContact,
    managerInCharge, officerInCharge, clusterNo,
    repName, repDesignation, repNic, repContact, repEmail,
    customerType, customerData, legalHistory,
  });

  // ── Submit ──
  const handleSubmitClick = async (asDraft = false) => {
    if (!asDraft) {
      const errs = validate();
      if (errs.length > 0) { setValidationErrors(errs); setShowValidation(true); return; }
    }
    setIsSubmitting(true);
    try {
      const payload = {
        formId: 3, formName: 'Instruction For Litigation',
        status: asDraft ? 'DRAFT' : 'PENDING_APPROVAL',
        initiatorId: session?.user?.id || '',
        companyCode, title: 'Instruction For Litigation',
        sapCostCenter, scopeOfAgreement: buildMeta(),
        term: demandDate, value: customerData.outstandingAmount||'0',
        remarks: '', initiatorComments: '',
        bumId: userIdMap[bum]||bum,
        fbpId: userIdMap[fbp]||fbp,
        parties: customerType ? [{ type: customerType, name: customerData.customerName||customerData.companyName||customerData.ownerName||'Customer' }] : [],
        ...(mode==='resubmit' && submissionId && { parentId: submissionId, isResubmission: true }),
      };
      const isDraftEdit = mode==='draft' && submissionId;
      const res = await fetch(isDraftEdit ? `/api/submissions/${submissionId}` : '/api/submissions', {
        method: isDraftEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isDraftEdit ? { status: asDraft?'DRAFT':'PENDING_APPROVAL', companyCode, sapCostCenter, scopeOfAgreement: buildMeta(), term: demandDate, value: customerData.outstandingAmount||'0' } : payload),
      });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error||`Server error: ${res.status}`); }
      const data = await res.json();
      if (data.submissionNo) setSubmissionNo(data.submissionNo);
      if (mode==='resubmit' && submissionId) {
        await fetch(`/api/submissions/${submissionId}`,{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status:'RESUBMITTED'}) });
      }
      // Upload files
      if (!asDraft && data.data?.id && data.data?.documents?.length) {
        const docLabelToId: Record<string,string> = {};
        data.data.documents.forEach((d: any) => { docLabelToId[d.label]=d.id; });
        const uploads: Promise<void>[] = [];
        for (const [docKey, files] of Object.entries(docFilesRef.current)) {
          for (const f of files as AttachedFile[]) {
            if (f.file && !f.fileUrl) {
              const docId = docLabelToId[docKey]||'';
              uploads.push((async()=>{
                const fd = new FormData(); fd.append('file',f.file); fd.append('submissionId',data.data.id);
                const ur = await fetch('/api/upload',{method:'POST',body:fd});
                const ud = await ur.json();
                if (ud.success && ud.url && docId) {
                  await fetch(`/api/submissions/${data.data.id}`,{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({documentId:docId,fileUrl:ud.url,documentStatus:'UPLOADED'}) });
                }
              })());
            }
          }
        }
        await Promise.all(uploads);
      }
      if (asDraft) { router.push(ROUTES.HOME); }
      else if (mode==='resubmit') { router.push(ROUTES.HOME); }
      else { setShowSuccess(true); }
    } catch (err: any) {
      setValidationErrors([err.message||'Submission failed.']);
      setShowValidation(true);
    } finally { setIsSubmitting(false); }
  };

  const addLegalHistory = () => setLegalHistory(prev => [...prev, { id: `${Date.now()}`, caseNo:'', court:'', outstandingAmount:'', prosecutionInfo:'', statusOfCase:'', remarks:'' }]);
  const updateLegalHistory = (id: string, field: string, value: string) => setLegalHistory(prev => prev.map(h => h.id===id ? {...h,[field]:value} : h));
  const removeLegalHistory = (id: string) => setLegalHistory(prev => prev.filter(h => h.id!==id));

  const addFilesToDoc = (key: string, files: AttachedFile[]) => setDocFiles(prev => { const n={...prev,[key]:[...(prev[key]||[]),...files]}; docFilesRef.current=n; return n; });
  const removeFileFromDoc = (key: string, id: string) => setDocFiles(prev => ({...prev,[key]:(prev[key]||[]).filter(f=>f.id!==id)}));

  const canUploadDocs = !isReadOnly || ['PENDING_APPROVAL','SENT_BACK','DRAFT'].includes(submissionStatus);

  const statusToStep: Record<string,number> = {
    DRAFT:0, PENDING_APPROVAL:1, PENDING_LEGAL_GM:2,
    PENDING_LEGAL_OFFICER:3, PENDING_COURT_OFFICER:3,
    PENDING_SPECIAL_APPROVER:3, PENDING_LEGAL_GM_FINAL:4,
    COMPLETED:5, CANCELLED:5, SENT_BACK:1,
  };
  const currentStep = mode==='view' ? (statusToStep[submissionStatus]??1) : 0;

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* ── Sidebar ── */}
      <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen" style={{background:'linear-gradient(180deg, #1A438A 0%, #17293E 100%)'}}>
        <div className="relative mb-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">{session?.user?.name?.[0]||'U'}</div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]"/>
        </div>
        <div className="text-center">
          <p className="text-white text-[10px] font-semibold">{session?.user?.name?.split(' ')[0]||'Me'}</p>
          <p className="text-white/40 text-[9px]">{session?.user?.name?.split(' ').slice(1).join(' ')||''}</p>
        </div>
        <div className="w-8 h-px bg-white/10"/>
        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          <NotificationBell/>
          <button onClick={()=>router.push('/home')} className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Home className="w-[18px] h-[18px]"/></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Lightbulb className="w-[18px] h-[18px]"/></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Search className="w-[18px] h-[18px]"/></button>
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <button onClick={()=>router.push('/settings')} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><Settings className="w-[18px] h-[18px]"/></button>
          <button onClick={()=>setShowSignOut(true)} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><User className="w-[18px] h-[18px]"/></button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex gap-5 p-5 overflow-auto min-w-0">

        {/* ── Left: Form ── */}
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
                {mode!=='new' && (
                  <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border backdrop-blur-sm ${mode==='view'?'bg-blue-500/20 text-blue-200 border-blue-400/30':'bg-orange-500/20 text-orange-200 border-orange-400/30'}`}>
                    {mode==='view'?'View Only':'Resubmission'}
                  </span>
                )}
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 3</div>
              </div>
            </div>
          </div>

          {/* Form Body */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 rounded-full bg-[#1A438A]"/>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Submission Details</span>
            </div>
            <div className="px-6 py-6 space-y-5">

              {/* Letter of Demand Date */}
              <div>
                <FieldLabel required>Letter of Demand Sent Date</FieldLabel>
                <div className="relative">
                  <input type="date" value={demandDate} onChange={e=>setDemandDate(e.target.value)} disabled={isReadOnly}
                    className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150
                      ${isReadOnly?'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
                      : hasError('demand')?'bg-white border-red-400 ring-2 ring-red-400/10 focus:outline-none'
                      :'bg-white border-slate-200 text-slate-800 hover:border-[#4686B7] focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10'}`}/>
                  <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
                </div>
                <FieldError message={hasError('demand') ? 'Letter of Demand Sent Date is required' : undefined}/>
              </div>

              {/* Initiator's Information */}
              <div className="space-y-4">
                <SectionHeader>Initiator&apos;s Information</SectionHeader>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Name</FieldLabel>
                    <TextField value={initiatorName} onChange={setInitiatorName} placeholder="Full name" disabled={isReadOnly} hasError={hasError('initiator name')}/>
                    <FieldError message={hasError('initiator name') ? 'Initiator Name is required' : undefined}/>
                  </div>
                  <div>
                    <FieldLabel required>Contact No</FieldLabel>
                    <TextField value={initiatorContact} onChange={setInitiatorContact} placeholder="+94..." disabled={isReadOnly} hasError={hasError('initiator contact')}/>
                    <FieldError message={hasError('initiator contact') ? 'Initiator Contact No is required' : undefined}/>
                  </div>
                </div>
              </div>

              {/* Department's Details */}
              <div className="space-y-4">
                <SectionHeader>Department&apos;s Details of the Creditor / Initiator</SectionHeader>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Manager in Charge</FieldLabel>
                    <TextField value={managerInCharge} onChange={setManagerInCharge} placeholder="Manager name" disabled={isReadOnly} hasError={hasError('manager')}/>
                    <FieldError message={hasError('manager') ? 'Manager in Charge is required' : undefined}/>
                  </div>
                  <div>
                    <FieldLabel required>Officer in Charge</FieldLabel>
                    <TextField value={officerInCharge} onChange={setOfficerInCharge} placeholder="Officer name" disabled={isReadOnly} hasError={hasError('officer in charge')}/>
                    <FieldError message={hasError('officer in charge') ? 'Officer in Charge is required' : undefined}/>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <FieldLabel required>Company Code</FieldLabel>
                    <ComboBox value={companyCode} onChange={setCompanyCode} options={companyCodeOptions} placeholder="Select..." disabled={isReadOnly} hasError={hasError('company code')}/>
                    <FieldError message={hasError('company code') ? 'Company Code is required' : undefined}/>
                  </div>
                  <div>
                    <FieldLabel required>SAP Cost Center No</FieldLabel>
                    <ComboBox value={sapCostCenter} onChange={setSapCostCenter} options={sapCostCenterOptions} placeholder="Select..." disabled={isReadOnly} hasError={hasError('sap cost center')}/>
                    <FieldError message={hasError('sap cost center') ? 'SAP Cost Center is required' : undefined}/>
                  </div>
                  <div>
                    <FieldLabel required>Cluster No</FieldLabel>
                    <TextField value={clusterNo} onChange={setClusterNo} placeholder="Cluster number" disabled={isReadOnly} hasError={hasError('cluster no')}/>
                    <FieldError message={hasError('cluster no') ? 'Cluster No is required' : undefined}/>
                  </div>
                </div>
              </div>

              {/* Representative Details */}
              <div className="space-y-4">
                <SectionHeader>Representative Details (for Court Representation)</SectionHeader>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Name</FieldLabel>
                    <TextField value={repName} onChange={setRepName} placeholder="Representative name" disabled={isReadOnly} hasError={hasError('representative name')}/>
                    <FieldError message={hasError('representative name') ? 'Representative Name is required' : undefined}/>
                  </div>
                  <div>
                    <FieldLabel required>Designation</FieldLabel>
                    <TextField value={repDesignation} onChange={setRepDesignation} placeholder="Designation" disabled={isReadOnly} hasError={hasError('designation')}/>
                    <FieldError message={hasError('designation') ? 'Designation is required' : undefined}/>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <FieldLabel required>NIC</FieldLabel>
                    <TextField value={repNic} onChange={v=>setRepNic(v.replace(/[^a-zA-Z0-9]/g,''))} placeholder="NIC number" disabled={isReadOnly} hasError={hasError('representative nic')}/>
                    <FieldError message={hasError('representative nic') ? 'NIC is required' : undefined}/>
                  </div>
                  <div>
                    <FieldLabel required>Contact No</FieldLabel>
                    <TextField value={repContact} onChange={setRepContact} placeholder="+94..." disabled={isReadOnly} hasError={hasError('representative contact')}/>
                    <FieldError message={hasError('representative contact') ? 'Contact No is required' : undefined}/>
                  </div>
                  <div>
                    <FieldLabel required>Email Address</FieldLabel>
                    <TextField value={repEmail} onChange={setRepEmail} placeholder="email@example.com" type="email" disabled={isReadOnly} hasError={hasError('representative email')}/>
                    <FieldError message={hasError('representative email') ? 'Email Address is required' : undefined}/>
                  </div>
                </div>
              </div>

              {/* Customer's Personal and Business Information */}
              <div className="space-y-4">
                <SectionHeader>Customer&apos;s Personal and Business Information</SectionHeader>
                <div>
                  <FieldLabel required>Type of the Customer</FieldLabel>
                  <SelectField value={customerType} onChange={v=>{setCustomerType(v as CustomerType); setCustomerData({});}} options={CUSTOMER_TYPES} placeholder="Select customer type..." disabled={isReadOnly} hasError={hasError('type of customer')}/>
                  <FieldError message={hasError('type of customer') ? 'Type of Customer is required' : undefined}/>
                </div>
                {customerType && (
                  <CustomerSection customerType={customerType} data={customerData} onChange={(f,v)=>setCustomerData(prev=>({...prev,[f]:v}))} disabled={isReadOnly} submitted={submitted}/>
                )}
              </div>

              {/* Legal Actions History */}
              <div className="space-y-4">
                <SectionHeader>Legal Actions History for Ongoing Cases</SectionHeader>
                <p className="text-[11px] text-slate-400 italic">Optional — add any existing legal cases related to this customer.</p>
                {legalHistory.map((h) => (
                  <div key={h.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 relative">
                    {!isReadOnly && (
                      <button onClick={()=>removeLegalHistory(h.id)} className="absolute top-3 right-3 w-6 h-6 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-400 hover:text-red-500 transition-colors">
                        <X className="w-3.5 h-3.5"/>
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div><FieldLabel>Case No</FieldLabel><TextField value={h.caseNo} onChange={v=>updateLegalHistory(h.id,'caseNo',v)} disabled={isReadOnly}/></div>
                      <div><FieldLabel>Court</FieldLabel><TextField value={h.court} onChange={v=>updateLegalHistory(h.id,'court',v)} disabled={isReadOnly}/></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><FieldLabel>Outstanding Amount</FieldLabel><TextField value={h.outstandingAmount} onChange={v=>updateLegalHistory(h.id,'outstandingAmount',v)} disabled={isReadOnly}/></div>
                      <div><FieldLabel>Prosecution Information</FieldLabel><TextField value={h.prosecutionInfo} onChange={v=>updateLegalHistory(h.id,'prosecutionInfo',v)} disabled={isReadOnly}/></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><FieldLabel>Status of the Case/s</FieldLabel><TextField value={h.statusOfCase} onChange={v=>updateLegalHistory(h.id,'statusOfCase',v)} disabled={isReadOnly}/></div>
                      <div><FieldLabel>Remarks</FieldLabel><TextField value={h.remarks} onChange={v=>updateLegalHistory(h.id,'remarks',v)} disabled={isReadOnly}/></div>
                    </div>
                  </div>
                ))}
                {!isReadOnly && (
                  <button onClick={addLegalHistory} className="flex items-center gap-2 text-sm font-semibold text-[#1A438A] hover:text-[#1e5aad] transition-colors">
                    <div className="w-7 h-7 rounded-lg bg-[#EEF3F8] flex items-center justify-center"><Plus className="w-4 h-4"/></div>
                    Add Legal History Entry
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-[296px] flex-shrink-0 flex flex-col gap-4">

          {/* Workflow Tracker */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-5">
              {mode!=='new' ? <button onClick={()=>setShowLog(true)} className="text-[11px] font-semibold text-[#1A438A] hover:underline">View Log</button> : <div/>}
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Submission No.</p>
                <p className="text-[#1A438A] font-bold text-sm font-mono">{submissionNo||'—'}</p>
              </div>
            </div>
            <div className="relative flex justify-between items-start">
              <div className="absolute top-[9px] left-[9px] right-[9px] h-px bg-slate-200"/>
              <div className="absolute top-[9px] left-[9px] h-px bg-[#1A438A] transition-all" style={{width:`${currentStep===0?0:(currentStep/(WORKFLOW_STEPS.length-1))*100}%`}}/>
              {WORKFLOW_STEPS.map((step,i) => (
                <div key={i} className="relative flex flex-col items-center z-10" style={{width:`${100/WORKFLOW_STEPS.length}%`}}>
                  <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all shadow-sm
                    ${i<currentStep?'bg-[#1A438A] border-[#1A438A]':i===currentStep?'bg-[#1A438A] border-[#1A438A] ring-4 ring-[#1A438A]/15':'bg-white border-slate-300'}`}>
                    {i<currentStep&&<CheckCircle2 className="w-2.5 h-2.5 text-white"/>}
                    {i===currentStep&&<div className="w-2 h-2 rounded-full bg-white"/>}
                  </div>
                  <p className="text-[9px] text-center leading-tight whitespace-pre-line mt-1.5 text-slate-500 font-medium px-0.5">{step.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Required Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
              <button onClick={()=>setShowInstructions(true)} className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all active:scale-95" style={{background:'linear-gradient(135deg, #AC9C2F, #c9b535)'}}>Instructions</button>
            </div>
            <div className="p-3 space-y-1.5 min-h-[96px]">
              {requiredDocs.length===0 ? (
                <div className="py-5 text-center">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2"><Paperclip className="w-5 h-5 text-slate-300"/></div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">Select customer type to see<br/>required documents</p>
                </div>
              ) : requiredDocs.map((doc,i) => {
                const files = docFiles[doc.key]||[];
                const hasFiles = files.length>0;
                return (
                  <div key={doc.key} className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all ${hasFiles?'bg-emerald-50 border-emerald-200':'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                    <div className="flex-1 mr-2 min-w-0">
                      <span className="text-[11px] text-slate-600 leading-tight block"><span className="font-bold text-slate-300 mr-1">{i+1}.</span>{doc.label}</span>
                      {hasFiles&&<span className="text-[10px] text-emerald-600 font-semibold">{files.length} file{files.length>1?'s':''} attached</span>}
                    </div>
                    {canUploadDocs ? (
                      <button onClick={()=>setUploadPopup({docKey:doc.key,docLabel:doc.label,docId:docIdMap[doc.label]||''})} className="flex-shrink-0 transition-colors">
                        {hasFiles?<CheckCircle2 className="w-4 h-4 text-emerald-500 hover:text-emerald-600"/>:<Paperclip className="w-4 h-4 text-[#1183B7] hover:text-[#1A438A]"/>}
                      </button>
                    ) : hasFiles&&<CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0"/>}
                  </div>
                );
              })}
            </div>
            {/* Documents by Legal Dept */}
            <div className="border-t border-slate-100">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/80">
                <div className="w-0.5 h-3.5 rounded-full bg-[#1A438A]"/>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#17293E]">Documents by Legal Dept.</span>
              </div>
              <div className="px-3 py-2">
                <p className="text-[11px] text-slate-400 italic px-1">No documents added yet</p>
              </div>
            </div>
          </div>

          {/* Approvals */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <div className="w-0.5 h-4 rounded-full bg-[#1A438A]"/>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Approvals</span>
            </div>
            <div className="p-4 space-y-3.5">
              <div>
                <FieldLabel required>BUM</FieldLabel>
                <ComboBox value={bum} onChange={setBum} options={bumOptions} placeholder="Type or select BUM..." disabled={isReadOnly} hasError={hasError('bum')}/>
                <FieldError message={hasError('bum') ? 'BUM is required' : undefined}/>
              </div>
              <div>
                <FieldLabel required>FBP</FieldLabel>
                <ComboBox value={fbp} onChange={setFbp} options={fbpOptions} placeholder="Type or select FBP..." disabled={isReadOnly} hasError={hasError('fbp')}/>
                <FieldError message={hasError('fbp') ? 'FBP is required' : undefined}/>
              </div>
            </div>
          </div>

          {/* Comments */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <div className="w-0.5 h-4 rounded-full bg-[#1A438A]"/>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Comments</span>
            </div>
            <div className="p-3">
              {comments.length>0 && (
                <div className="mb-3 space-y-2 max-h-36 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex justify-between mb-1"><span className="text-[11px] font-bold text-[#1A438A]">{c.author}</span><span className="text-[10px] text-slate-400">{c.time}</span></div>
                      <p className="text-xs text-slate-600 leading-relaxed">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${commentInput?'border-[#1A438A] bg-white ring-2 ring-[#1A438A]/10':'border-slate-200 bg-slate-50/80'}`}>
                <input type="text" value={commentInput} onChange={e=>setCommentInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&commentInput.trim()){setComments(prev=>[...prev,{id:Date.now(),author:session?.user?.name||'You',text:commentInput.trim(),time:'Just now'}]);setCommentInput('');}}}
                  placeholder="Post your comment here" disabled={isReadOnly}
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"/>
                <button disabled={isReadOnly||!commentInput.trim()} onClick={()=>{if(commentInput.trim()){setComments(prev=>[...prev,{id:Date.now(),author:session?.user?.name||'You',text:commentInput.trim(),time:'Just now'}]);setCommentInput('');}}}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white"/>
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button onClick={()=>setShowBackModal(true)} disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all duration-200 disabled:opacity-50">
              <ArrowLeft className="w-4 h-4"/>Back
            </button>
            {!isReadOnly && mode!=='resubmit' && (
              <button onClick={()=>handleSubmitClick(true)} disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all duration-200 active:scale-95 disabled:opacity-70"
                style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>
                {isSubmitting?'Saving...':'Save Draft'}
              </button>
            )}
            {!isReadOnly && (
              <button onClick={()=>{setSubmitted(true);handleSubmitClick(false);}} disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all duration-200 active:scale-95 shadow-lg shadow-[#AC9C2F]/25 disabled:opacity-70"
                style={{background:'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)'}}>
                {isSubmitting ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Submitting...</span>
                : mode==='resubmit'?'Resubmit':'Submit'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Upload Popup ── */}
      {uploadPopup && (
        <UploadPopup docLabel={uploadPopup.docLabel} files={docFiles[uploadPopup.docKey]||[]}
          onAdd={files=>addFilesToDoc(uploadPopup.docKey,files)} onRemove={id=>removeFileFromDoc(uploadPopup.docKey,id)}
          canRemove={canUploadDocs} onClose={()=>setUploadPopup(null)}
          onConfirm={async()=>{
            const files = docFiles[uploadPopup.docKey]||[];
            const newFiles = files.filter(f=>!f.fileUrl&&f.file);
            if (!newFiles.length||!submissionId) { setUploadPopup(null); return; }
            setUploadingDoc(uploadPopup.docKey);
            for (const f of newFiles) {
              try {
                const fd = new FormData(); fd.append('file',f.file); fd.append('submissionId',submissionId);
                const ur = await fetch('/api/upload',{method:'POST',body:fd});
                const ud = await ur.json();
                if (ud.success&&ud.url) {
                  setDocFiles(prev=>({...prev,[uploadPopup.docKey]:(prev[uploadPopup.docKey]||[]).map(df=>df.id===f.id?{...df,fileUrl:ud.url}:df)}));
                  if (uploadPopup.docId) {
                    await fetch(`/api/submissions/${submissionId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId:uploadPopup.docId,fileUrl:ud.url,documentStatus:'UPLOADED'})});
                  }
                }
              } catch(e){ console.error('Upload failed',e); }
            }
            setUploadingDoc(null); setUploadPopup(null);
          }}/>
      )}

      {/* ── Back Modal ── */}
      {showBackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={()=>setShowBackModal(false)}/>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4"><AlertCircle className="w-6 h-6 text-amber-500"/></div>
            <h3 className="text-[#17293E] font-bold text-base mb-1">Leave this form?</h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">Your progress will be lost if you go back without saving.</p>
            <div className="flex flex-col gap-2 w-full">
              <button onClick={()=>handleSubmitClick(true)} disabled={isSubmitting} className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>
                {isSubmitting?'Saving...':'Save as Draft & Go Back'}
              </button>
              <button onClick={()=>router.push(ROUTES.HOME)} disabled={isSubmitting} className="w-full py-2.5 rounded-xl font-bold text-sm border-2 border-red-200 text-red-500 hover:bg-red-50 transition-all">Discard & Go Back</button>
              <button onClick={()=>setShowBackModal(false)} className="w-full py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-all">Cancel, Stay Here</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Validation Modal ── */}
      {showValidation && <ValidationModal errors={validationErrors} onClose={()=>setShowValidation(false)}/>}

      {/* ── Instructions Modal ── */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setShowInstructions(false)}/>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[82vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>
              <span className="text-white font-bold text-base">Instructions</span>
              <button onClick={()=>setShowInstructions(false)} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {instructionsText ? <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{instructionsText}</p>
              : <div className="bg-amber-50 border border-amber-200 rounded-xl p-4"><p className="text-sm text-amber-800 font-medium">No instructions configured yet.</p></div>}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={()=>setShowInstructions(false)} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95" style={{background:'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)'}}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Modal ── */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-green-500/30" style={{background:'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'}}>
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
            </div>
            <h2 className="text-[#17293E] text-xl font-bold mb-2">Successfully Submitted!</h2>
            <p className="text-slate-500 text-sm mb-4 leading-relaxed">Your litigation request has been submitted for parallel approval by BUM and FBP.</p>
            <div className="w-full bg-[#f0f4f9] rounded-xl px-6 py-3 mb-6">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Submission No.</p>
              <p className="text-[#1A438A] font-bold text-lg font-mono">{submissionNo||'—'}</p>
            </div>
            <button onClick={()=>{setShowSuccess(false);router.push(ROUTES.HOME);}} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95 shadow-lg shadow-[#1A438A]/20" style={{background:'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)'}}>Return to Home</button>
          </div>
        </div>
      )}

      {/* ── View Log ── */}
      {showLog && <ViewLogModal log={log} onClose={()=>setShowLog(false)}/>}

      {/* ── Sign Out ── */}
      {showSignOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setShowSignOut(false)}/>
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-sm z-10">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Sign Out</h3>
            <p className="text-sm text-slate-500 mb-5">Are you sure you want to sign out?</p>
            <div className="flex gap-3">
              <button onClick={()=>setShowSignOut(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
              <button onClick={()=>{setShowSignOut(false);router.push('/login');}} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{background:'linear-gradient(135deg, #ef4444, #dc2626)'}}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Form3Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <Form3PageContent/>
    </Suspense>
  );
}