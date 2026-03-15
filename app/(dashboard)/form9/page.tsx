'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Home, Lightbulb, Search, Settings, User,
  CheckCircle2, FileText, Upload, X, Eye, Trash2, Paperclip, File,
  AlertCircle, Loader2, ChevronDown, ArrowLeft,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import NotificationBell from '@/components/shared/NotificationBell';

// ─── Types ────────────────────────────────────────────────────────────────────
type FormMode = 'new' | 'view' | 'confirm' | 'docs';

interface AttachedFile { id: string; label: string; name?: string; file?: File; fileUrl?: string; size?: number }

function formatBytes(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
interface UserOption   { id: string; name: string; email: string }

interface Submission {
  id: string; submissionNo: string; status: string; loStage?: string;
  initiatorName?: string;
  f9PropertyOwnerType?: string; f9PropertyOwnerName?: string; f9NIC?: string;
  f9BusinessRegNo?: string; f9VATRegNo?: string; f9OwnerContactNo?: string;
  f9PremisesAssNo?: string; f9PropertyType?: string; f9ConsiderationRs?: string;
  f9PlanNo?: string; f9LotNo?: string; f9Facilities?: string;
  f9COCDate?: string; f9GMCApprovalNo?: string; f9GMCApprovalDate?: string;
  f9InitiatorContactNo?: string; f9Remarks?: string;
  f9ClusterDirectorId?: string; f9GMCMemberId?: string;
  companyCode?: string; sapCostCenter?: string;
  documents: { id: string; label: string; type: string; status: string; fileUrl?: string | null }[];
  comments?: { id: string; authorName: string; authorRole: string; text: string; createdAt: string }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const INITIAL_DOCS = ['Title Deed', 'Plan', "Owner's Letter", 'Extracts'];

// Fallback docs per owner type (used if settings not configured)
const OWNER_TYPE_DOCS: Record<string, string[]> = {
  'Company': [
    'Incorporation Certificate of the Company',
    'Form 1, 13 or any other document to prove the registered address',
    'Any other company related documents',
  ],
  'Partnership': [
    'Partnership registration certificate',
    'NIC / passport copies of every partner',
    'Other',
  ],
  'Sole-proprietorship': [
    'NIC / passport of the sole proprietor',
    'Business registration certificate / sole proprietorship certificate',
    'Other',
  ],
  'Individual': [
    'NIC',
    'Other',
  ],
};

const COMPANY_CODES = ['DM01 - DIMO PLC','DM02 - DIMO Colombo','DM03 - DIMO Kandy','DM04 - DIMO Galle'];
const SAP_CENTERS   = ['000003999','000004001','000004002','000004003','000004004'];

const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' },
  { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' },
  { label: 'Handing\nOver' },
];

function fmtDate(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function WorkflowStepper({ activeStep }: { activeStep: number }) {
  return (
    <div className="relative flex justify-between items-start">
      <div className="absolute top-[9px] left-[9px] right-[9px] h-px bg-slate-200" />
      <div className="absolute top-[9px] left-[9px] h-px bg-[#1A438A] transition-all"
        style={{ width: `${activeStep === 0 ? 0 : (activeStep / (WORKFLOW_STEPS.length - 1)) * 100}%` }} />
      {WORKFLOW_STEPS.map((step, i) => (
        <div key={i} className="relative flex flex-col items-center z-10" style={{ width: `${100 / WORKFLOW_STEPS.length}%` }}>
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

function FieldLabel({ text }: { text: string }) {
  return <label className="block text-[11px] font-semibold text-slate-500 mb-1">{text}</label>;
}

function ReadField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <FieldLabel text={label} />
      <div className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 min-h-[36px]">
        {value || <span className="text-slate-400 italic">—</span>}
      </div>
    </div>
  );
}

function SuccessModal({ submissionNo, onClose }: { submissionNo: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-emerald-100 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/20">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Submitted Successfully</h2>
        <p className="text-slate-500 text-sm mb-1 leading-relaxed">Your Form 9 request has been submitted for Legal GM review.</p>
        <p className="text-[#1A438A] font-bold text-sm font-mono mb-6">#{submissionNo.split('_').pop()}</p>
        <button onClick={onClose}
          className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all"
          style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

function ConfirmActionModal({ title, message, confirmLabel, confirmClass, requireComment, onConfirm, onClose }:
  { title: string; message: string; confirmLabel: string; confirmClass: string; requireComment?: boolean; onConfirm: (c?: string) => void; onClose: () => void }) {
  const [comment, setComment] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-bold text-[#17293E] mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-4">{message}</p>
        {requireComment && (
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none h-24 mb-4 focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30"
            placeholder="Add a comment (optional)..." />
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
          <button onClick={() => onConfirm(comment || undefined)} className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold ${confirmClass}`}>{confirmLabel}</button>
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

function UploadPopup({ docLabel, files, onAdd, onRemove, onClose }: {
  docLabel: string; files: AttachedFile[];
  onAdd: (f: AttachedFile[]) => void; onRemove: (id: string) => void; onClose: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    onAdd(Array.from(incoming).map((f) => ({
      id: `${Date.now()}-${Math.random()}`, label: f.name, name: f.name, size: f.size, file: f,
    })));
  };

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
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

        <div className="p-5">
          <div onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)} onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200
              ${dragging ? 'border-[#1A438A] bg-[#EEF3F8] scale-[1.01]' : 'border-slate-200 hover:border-[#4686B7] hover:bg-slate-50'}`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-colors ${dragging ? 'bg-[#1A438A]' : 'bg-slate-100'}`}>
              <Upload className={`w-6 h-6 ${dragging ? 'text-white' : 'text-slate-400'}`} />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">{dragging ? 'Drop files here' : 'Drag & drop files here'}</p>
            <p className="text-[11px] text-slate-400">or click to browse from your computer</p>
            <p className="text-[11px] text-slate-300 mt-2">PDF, Word, Images — any file type accepted</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </div>
        </div>

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
                    <p className="text-sm font-medium text-slate-700 truncate">{f.name || f.label}</p>
                    <p className="text-[11px] text-slate-400">{formatBytes(f.size)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {f.file && (
                      <button onClick={() => window.open(URL.createObjectURL(f.file!), '_blank')}
                        className="w-7 h-7 rounded-lg hover:bg-[#EEF3F8] flex items-center justify-center text-slate-400 hover:text-[#1A438A] transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => onRemove(f.id)}
                      className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            Done {files.length > 0 && `(${files.length} file${files.length > 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
function Form9Inner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('id');
  const modeParam   = searchParams.get('mode') as FormMode | null;
  const [showSignOut, setShowSignOut] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructionsText, setInstructionsText] = useState('');
  const [formConfigDocs, setFormConfigDocs] = useState<{ id: string; label: string; type: string; isRequired: boolean }[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidation, setShowValidation] = useState(false);

  // Form fields
  const [name,           setName]           = useState('');
  const [companyCode,    setCompanyCode]    = useState('');
  const [sapCenter,      setSapCenter]      = useState('');
  const [contactNo,      setContactNo]      = useState('');
  const [gmcApprovalNo,  setGmcApprovalNo]  = useState('');
  const [gmcApprovalDate,setGmcApprovalDate]= useState('');
  // Property Owner
  const [ownerType,      setOwnerType]      = useState('');
  const [ownerName,      setOwnerName]      = useState('');
  const [nic,            setNic]            = useState('');
  const [businessReg,    setBusinessReg]    = useState('');
  const [vatReg,         setVatReg]         = useState('');
  const [ownerContact,   setOwnerContact]   = useState('');
  // Premises
  const [assNo,          setAssNo]          = useState('');
  const [propTypes,      setPropTypes]      = useState<string[]>([]);
  const [consideration,  setConsideration]  = useState('');
  const [planNo,         setPlanNo]         = useState('');
  const [lotNo,          setLotNo]          = useState('');
  const [facilities,     setFacilities]     = useState<string[]>([]);
  const [cocDate,        setCocDate]        = useState('');
  const [remarks,        setRemarks]        = useState('');
  // Approvers
  const [cdId, setCdId]       = useState('');
  const [gmcId, setGmcId]     = useState('');
  const [cdList, setCdList]   = useState<UserOption[]>([]);
  const [gmcList, setGmcList] = useState<UserOption[]>([]);
  // Documents
  const [docFiles, setDocFiles] = useState<Record<string, AttachedFile[]>>({});
  const [uploadPopup, setUploadPopup] = useState<{ docId: string; docLabel: string } | null>(null);

  // Submission state
  const [submission,    setSubmission]    = useState<Submission | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [successNo,     setSuccessNo]     = useState('');
  const [confirmModal,  setConfirmModal]  = useState<'cancel' | 'proceed' | 'submit_docs' | null>(null);
  const [error,         setError]         = useState('');

  const userRole = session?.user?.role as string;
  const userId   = session?.user?.id as string;
  const userName = session?.user?.name as string;

  // Determine page mode
  const mode: FormMode = (() => {
    if (submissionId && submission) {
      if (submission.status === 'PENDING_BUM_CONFIRM') return 'confirm';
      if (submission.status === 'PENDING_BUM_DOCS')    return 'docs';
      if (modeParam === 'view' || modeParam) return 'view';
    }
    if (submissionId && !submission) return 'view';
    return modeParam === 'view' ? 'view' : 'new';
  })();

  // Prefill session user data
  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
  }, [session]);

  // Load instructions + docs config from settings
  useEffect(() => {
    fetch('/api/settings/forms').then(r => r.json()).then(data => {
      if (data.success) {
        const config = data.data.find((c: any) => c.formId === 9);
        if (config?.instructions) setInstructionsText(config.instructions);
        if (config?.docs?.length) setFormConfigDocs(config.docs);
      }
    }).catch(() => {});
  }, []);

  // Load approver lists
  useEffect(() => {
    fetch('/api/users?role=CLUSTER_DIRECTOR').then(r => r.json()).then(d => { if (d.success) setCdList(d.data); });
    fetch('/api/users?role=GMC_MEMBER').then(r => r.json()).then(d => { if (d.success) setGmcList(d.data); });
  }, []);

  // Load submission
  const loadSubmission = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}`);
      const data = await res.json();
      if (data.success) setSubmission(data.data);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => { loadSubmission(); }, [loadSubmission]);

  const togglePropType = (t: string) => setPropTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const toggleFacility = (f: string) => setFacilities(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  const addFilesToDoc = (docId: string, newFiles: AttachedFile[]) => {
    setDocFiles(prev => ({ ...prev, [docId]: [...(prev[docId] || []), ...newFiles] }));
  };
  const removeFileFromDoc = (docId: string, fileId: string) => {
    setDocFiles(prev => ({ ...prev, [docId]: (prev[docId] || []).filter(f => f.id !== fileId) }));
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!name)               errs.push('Name is required');
    if (!companyCode)        errs.push('Company Code is required');
    if (!sapCenter)          errs.push('SAP Cost Centre is required');
    if (!contactNo)          errs.push('Contact No is required');
    if (!gmcApprovalNo)      errs.push('GMC Approval No is required');
    if (!gmcApprovalDate)    errs.push('GMC Approval Date is required');
    if (!ownerType)          errs.push('Property Owner Type is required');
    if (!ownerName)          errs.push('Property Owner Name is required');
    if (!ownerContact)       errs.push('Property Owner Contact No is required');
    if (!assNo)              errs.push('Premises Ass. No is required');
    if (propTypes.length === 0) errs.push('Property Type is required');
    if (!consideration)      errs.push('Consideration (Rs.) is required');
    if (!planNo)             errs.push('Plan No is required');
    if (!lotNo)              errs.push('Lot No is required');
    if (facilities.length === 0) errs.push('Availability of Facilities is required');
    if (!cdId)               errs.push('Cluster Director approval is required');
    if (!gmcId)              errs.push('GMC Member approval is required');
    return errs;
  };

  const handleSubmitNew = async () => {
    const errs = validate();
    if (errs.length > 0) {
      setValidationErrors(errs);
      setShowValidation(true);
      return;
    }
    setSubmitting(true); setError('');
    try {
      // Upload documents
      const uploadedDocs: { label: string; fileUrl: string }[] = [];
      for (const label of INITIAL_DOCS) {
        const files = docFiles[label] || [];
        const f = files[0]?.file;
        if (f) {
          const fd = new FormData(); fd.append('file', f);
          const up = await fetch('/api/upload', { method: 'POST', body: fd });
          const ud = await up.json();
          if (ud.success) uploadedDocs.push({ label, fileUrl: ud.url });
        }
      }
      const docsData = INITIAL_DOCS.map(label => ({
        label, type: 'required', fileUrl: uploadedDocs.find(u => u.label === label)?.fileUrl || null,
      }));

      const body = {
        formId: 9, formName: 'Approval for Purchasing of a Premises',
        status: 'PENDING_LEGAL_GM', companyCode, sapCostCenter: sapCenter,
        title: 'Approval for Purchasing of a Premises',
        scopeOfAgreement: `Purchase of premises at Ass. No. ${assNo}`,
        term: '', value: consideration, remarks: '',
        initiatorId: userId,
        f9PropertyOwnerType: ownerType, f9PropertyOwnerName: ownerName,
        f9NIC: nic, f9BusinessRegNo: businessReg, f9VATRegNo: vatReg,
        f9OwnerContactNo: ownerContact, f9PremisesAssNo: assNo,
        f9PropertyType: JSON.stringify(propTypes), f9ConsiderationRs: consideration,
        f9PlanNo: planNo, f9LotNo: lotNo,
        f9Facilities: JSON.stringify(facilities), f9COCDate: cocDate,
        f9GMCApprovalNo: gmcApprovalNo, f9GMCApprovalDate: gmcApprovalDate,
        f9InitiatorContactNo: contactNo, f9Remarks: remarks,
        f9ClusterDirectorId: cdId, f9GMCMemberId: gmcId,
        documents: docsData, parties: [],
      };
      const res = await fetch('/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) setSuccessNo(data.submissionNo);
      else setError(data.error || 'Submission failed');
    } catch (e) {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmProceed = async () => {
    if (!submissionId) return;
    setSubmitting(true);
    try {
      await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'BUM_F9_CONFIRM', action: 'PROCEED', approverName: userName }),
      });
      router.push('/home');
    } finally { setSubmitting(false); }
  };

  const handleCancelRequest = async () => {
    if (!submissionId) return;
    setSubmitting(true);
    try {
      await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'BUM_F9_CONFIRM', action: 'CANCELLED', approverName: userName }),
      });
      router.push('/home');
    } finally { setSubmitting(false); }
  };

  const handleSubmitDocs = async () => {
    if (!submission) return;
    setSubmitting(true);
    try {
      // Upload any new files for existing doc entries
      const pendingDocs = submission.documents.filter(d => (docFiles[d.id] || []).length > 0);
      for (const doc of pendingDocs) {
        const f = (docFiles[doc.id] || [])[0]?.file;
        if (!f) continue;
        const fd = new FormData(); fd.append('file', f);
        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        const ud = await up.json();
        if (ud.success) {
          await fetch(`/api/submissions/${submission.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId: doc.id, fileUrl: ud.url }),
          });
        }
      }
      await fetch(`/api/submissions/${submission.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'BUM_F9_DOCS', action: 'SUBMITTED', approverName: userName }),
      });
      router.push('/home');
    } finally { setSubmitting(false); }
  };

  const getStepperActive = () => {
    if (!submission) return 0;
    const s = submission.status;
    if (s === 'COMPLETED') return 3;
    if (['PENDING_CEO', 'PENDING_LEGAL_OFFICER'].includes(s) && submission.loStage === 'F9_EXECUTION') return 3;
    if (['PENDING_FACILITY_MANAGER', 'PENDING_BUM_DOCS', 'PENDING_LEGAL_OFFICER'].includes(s)) return 2;
    if (['PENDING_CLUSTER_DIRECTOR', 'PENDING_GMC', 'PENDING_BUM_CONFIRM'].includes(s)) return 2;
    if (['PENDING_LEGAL_GM', 'PENDING_LEGAL_GM_FINAL', 'PENDING_LEGAL_OFFICER'].includes(s)) return 1;
    return 0;
  };

  if (loading && submissionId) {
    return <div className="min-h-screen flex items-center justify-center bg-[#EEF3F8]">
      <Loader2 className="w-8 h-8 animate-spin text-[#1A438A]" />
    </div>;
  }

  // ── Determine what to show ──────────────────────────────────────────────────
  const isReadOnly = mode === 'view' || mode === 'confirm';
  const s = submission;

  const cdUser  = cdList.find(u => u.id === (s?.f9ClusterDirectorId || cdId));
  const gmcUser = gmcList.find(u => u.id === (s?.f9GMCMemberId || gmcId));

  const propTypesArr = s?.f9PropertyType ? JSON.parse(s.f9PropertyType) : propTypes;
  const facilitiesArr = s?.f9Facilities ? JSON.parse(s.f9Facilities) : facilities;

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>
      {/* ── Sidebar ── */}
      <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen"
        style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
        <div className="relative mb-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">
            {session?.user?.name?.charAt(0)?.toUpperCase() || 'U'}
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
        {/* Left: Form */}
        <div className="flex-1 min-w-0">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
                    {(mode === 'view' || mode === 'confirm' || mode === 'docs') && (
                      <button onClick={() => router.push('/home')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors mr-1">
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                    )}
                    <div className="flex-1">
                      <h1 className="text-sm font-bold text-[#17293E]">Approval for Purchasing of a Premises</h1>
                      <p className="text-[10px] text-slate-400">16/FM/1641/07/09 <span className="font-bold text-slate-600">Form 9</span></p>
                    </div>
                    {s && <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border">#{s.submissionNo.split('_').pop()}</span>}
                  </div>

                  <div className="p-5 space-y-5">
                    {/* ── Section: Initiator ── */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white bg-[#1A438A] px-3 py-1.5 rounded-lg mb-3">Initiator's Information :</div>
                      <div className="grid grid-cols-2 gap-3">
                        {isReadOnly
                          ? <ReadField label="Name*" value={s?.initiatorName || name} />
                          : <div><FieldLabel text="Name*" /><input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" placeholder="Your name" /></div>
                        }
                        <div className="grid grid-cols-2 gap-2 col-span-1">
                          {isReadOnly
                            ? <ReadField label="Company Code*" value={s?.companyCode} />
                            : <div><FieldLabel text="Company Code*" /><select value={companyCode} onChange={e => setCompanyCode(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30"><option value="">Select...</option>{COMPANY_CODES.map(c => <option key={c}>{c}</option>)}</select></div>
                          }
                          {isReadOnly
                            ? <ReadField label="SAP Cost Centre*" value={s?.sapCostCenter} />
                            : <div><FieldLabel text="SAP Cost Centre*" /><select value={sapCenter} onChange={e => setSapCenter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30"><option value="">Select...</option>{SAP_CENTERS.map(c => <option key={c}>{c}</option>)}</select></div>
                          }
                        </div>
                        {isReadOnly
                          ? <ReadField label="Contact No*" value={s?.f9InitiatorContactNo} />
                          : <div><FieldLabel text="Contact No*" /><input value={contactNo} onChange={e => setContactNo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" placeholder="+94..." /></div>
                        }
                        <div className="grid grid-cols-2 gap-2">
                          {isReadOnly
                            ? <ReadField label="GMC Approval No*" value={s?.f9GMCApprovalNo} />
                            : <div><FieldLabel text="GMC Approval No*" /><input value={gmcApprovalNo} onChange={e => setGmcApprovalNo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" /></div>
                          }
                          {isReadOnly
                            ? <ReadField label="GMC App. Date*" value={fmtDate(s?.f9GMCApprovalDate)} />
                            : <div><FieldLabel text="GMC App. Date*" /><DatePicker value={gmcApprovalDate} onChange={setGmcApprovalDate} /></div>
                          }
                        </div>
                      </div>
                    </div>

                    {/* ── Section: Property Owner ── */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white bg-[#1A438A] px-3 py-1.5 rounded-lg mb-3">Details of the Property Owner</div>
                      <div className="grid grid-cols-2 gap-3">
                        {isReadOnly
                          ? <ReadField label="Property Owner Type*" value={s?.f9PropertyOwnerType} />
                          : <div><FieldLabel text="Property Owner Type*" /><select value={ownerType} onChange={e => setOwnerType(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30"><option value="">Select...</option>{['Company','Partnership','Sole-proprietorship','Individual'].map(t => <option key={t}>{t}</option>)}</select></div>
                        }
                        {isReadOnly
                          ? <ReadField label="Name*" value={s?.f9PropertyOwnerName} />
                          : <div><FieldLabel text="Name*" /><input value={ownerName} onChange={e => setOwnerName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" /></div>
                        }
                        {isReadOnly
                          ? <ReadField label="NIC" value={s?.f9NIC} />
                          : <div><FieldLabel text="NIC" /><input value={nic} onChange={e => setNic(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" /></div>
                        }
                        {isReadOnly
                          ? <ReadField label="Business Registration Number" value={s?.f9BusinessRegNo} />
                          : <div><FieldLabel text="Business Registration Number" /><input value={businessReg} onChange={e => setBusinessReg(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" /></div>
                        }
                        {isReadOnly
                          ? <ReadField label="VAT Reg. No" value={s?.f9VATRegNo} />
                          : <div><FieldLabel text="VAT Reg. No" /><input value={vatReg} onChange={e => setVatReg(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" /></div>
                        }
                        {isReadOnly
                          ? <ReadField label="Contact No*" value={s?.f9OwnerContactNo} />
                          : <div><FieldLabel text="Contact No*" /><input value={ownerContact} onChange={e => setOwnerContact(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" /></div>
                        }
                      </div>
                    </div>

                    {/* ── Section: Premises ── */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white bg-[#1A438A] px-3 py-1.5 rounded-lg mb-3">Details of the Premises</div>
                      <div className="grid grid-cols-2 gap-3">
                        {isReadOnly
                          ? <ReadField label="Premises bearing Ass. No*" value={s?.f9PremisesAssNo} />
                          : <div><FieldLabel text="Premises bearing Ass. No*" /><input value={assNo} onChange={e => setAssNo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" /></div>
                        }
                        <div>
                          <FieldLabel text="Property Type*" />
                          <div className="flex gap-5 items-center h-[36px]">
                            {['House','Building','Land'].map(t => (
                              <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <input type="checkbox" checked={propTypesArr.includes(t)} onChange={() => !isReadOnly && togglePropType(t)}
                                  disabled={isReadOnly}
                                  className="w-4 h-4 rounded border-slate-300 text-[#1A438A] focus:ring-[#1A438A]/30" />
                                {t}
                              </label>
                            ))}
                          </div>
                        </div>
                        {isReadOnly
                          ? <ReadField label="Consideration Rs.*" value={s?.f9ConsiderationRs} />
                          : <div><FieldLabel text="Consideration Rs.*" /><input type="number" value={consideration} onChange={e => setConsideration(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" /></div>
                        }
                        {isReadOnly
                          ? <ReadField label="Plan No*" value={s?.f9PlanNo} />
                          : <div><FieldLabel text="Plan No*" /><input value={planNo} onChange={e => setPlanNo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" /></div>
                        }
                        {isReadOnly
                          ? <ReadField label="Lot No*" value={s?.f9LotNo} />
                          : <div><FieldLabel text="Lot No*" /><input value={lotNo} onChange={e => setLotNo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" /></div>
                        }
                        <div>
                          <FieldLabel text="Availability of the Facilities*" />
                          <div className="flex gap-5 items-center h-[36px]">
                            {['Electricity','Water','Access Road'].map(f => (
                              <label key={f} className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <input type="checkbox" checked={facilitiesArr.includes(f)} onChange={() => !isReadOnly && toggleFacility(f)}
                                  disabled={isReadOnly}
                                  className="w-4 h-4 rounded border-slate-300 text-[#1A438A] focus:ring-[#1A438A]/30" />
                                {f}
                              </label>
                            ))}
                          </div>
                        </div>
                        {isReadOnly
                          ? <ReadField label="Date of the COC (For Buildings)" value={fmtDate(s?.f9COCDate)} />
                          : <div><FieldLabel text="Date of the COC (For Buildings)" /><DatePicker value={cocDate} onChange={setCocDate} /></div>
                        }
                        <div className="col-span-2">
                          {isReadOnly
                            ? <ReadField label="Remarks" value={s?.f9Remarks} />
                            : <div><FieldLabel text="Remarks" /><textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30" /></div>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

        {/* Right: Panel */}
        <div className="w-[296px] flex-shrink-0 space-y-4">
                {/* Stepper + Submission No */}
                {s && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-slate-400">Submission No</span>
                      <span className="text-sm font-black text-[#17293E] font-mono">#{s.submissionNo.split('_').pop()}</span>
                    </div>
                    <WorkflowStepper activeStep={getStepperActive()} />
                  </div>
                )}

                {/* Documents Panel */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3"
                    style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                    <span className="text-white text-sm font-semibold">Required Documents</span>
                    <button
                      className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                      Instructions
                    </button>
                  </div>
                  <div className="p-3 space-y-1.5 min-h-[96px]">
                    {(mode === 'docs' ? (s?.documents.filter((d: any) => d.type === 'required') || []) : (() => {
                      // Dynamic docs based on ownerType + settings config
                      const docItems: { label: string; isRequired: boolean }[] = [];
                      if (formConfigDocs.length > 0) {
                        formConfigDocs.forEach(doc => {
                          const norm = doc.type.replace('-', ' ');
                          if (doc.type === 'Common' || doc.type === ownerType || norm === ownerType) {
                            if (!docItems.find(d => d.label === doc.label)) docItems.push({ label: doc.label, isRequired: doc.isRequired });
                          }
                        });
                      }
                      if (docItems.length === 0) {
                        [...INITIAL_DOCS, ...(OWNER_TYPE_DOCS[ownerType] || [])].forEach(l => { if (!docItems.find(d => d.label === l)) docItems.push({ label: l, isRequired: true }); });
                      }
                      return docItems.map(({ label, isRequired }) => {
                        const doc = s?.documents?.find((d: any) => d.label === label);
                        return { ...(doc || { id: label, label, type: 'required', status: 'NONE', fileUrl: null }), _isRequired: isRequired };
                      });
                    })()).map((doc: any, i: number) => {
                      const files = docFiles[doc.id] || [];
                      const hasFile = files.length > 0 || !!doc.fileUrl;
                      return (
                        <div key={doc.id || i}
                          className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all
                            ${hasFile ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                          <div className="flex-1 mr-2 min-w-0">
                            <span className="text-[11px] text-slate-600 leading-tight flex items-center gap-1 flex-wrap">
                              <span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{doc.label}
                              {(doc._isRequired === false) && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">Optional</span>}
                            </span>
                            {files.length > 0 && <span className="text-[10px] text-emerald-600 font-semibold">{files.length} file{files.length > 1 ? 's' : ''} ready</span>}
                            {doc.fileUrl && files.length === 0 && <span className="text-[10px] text-emerald-600 font-semibold">1 file attached</span>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {doc.fileUrl && (
                              <a href={doc.fileUrl} target="_blank" rel="noreferrer"
                                className="w-7 h-7 rounded-lg hover:bg-[#EEF3F8] flex items-center justify-center text-slate-400 hover:text-[#1A438A] transition-colors">
                                <Eye className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {(mode === 'new' || mode === 'docs') ? (
                              <button onClick={() => setUploadPopup({ docId: doc.id, docLabel: doc.label })} className="flex-shrink-0 transition-colors">
                                {hasFile ? <CheckCircle2 className="w-4 h-4 text-emerald-500 hover:text-emerald-600" /> : <Paperclip className="w-4 h-4 text-[#1183B7] hover:text-[#1A438A]" />}
                              </button>
                            ) : (
                              hasFile && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Documents by Legal Dept sub-section */}
                  <div className="border-t border-slate-100">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/80">
                      <div className="w-0.5 h-3.5 rounded-full bg-[#1A438A]" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#17293E]">Documents by Legal Dept.</span>
                    </div>
                    <div className="px-3 py-2 space-y-1.5">
                      {(() => {
                        const loDocs = s?.documents?.filter((d: any) => d.type?.startsWith('LO_PREPARED')) || [];
                        if (loDocs.length === 0) return <p className="text-[11px] text-slate-400 italic px-1">No documents added yet</p>;
                        return loDocs.map((d: any) => (
                          <div key={d.id} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-[#EEF3F8] border border-[#1A438A]/20">
                            <FileText className="w-3.5 h-3.5 text-[#1A438A]" />
                            <span className="text-[11px] font-semibold text-[#1A438A] flex-1 truncate">{d.label}</span>
                            <span className="text-[9px] uppercase font-bold text-[#4686B7] bg-[#1A438A]/10 px-1.5 py-0.5 rounded">
                              {d.type === 'LO_PREPARED_FINAL' ? 'Final' : 'Initial'}
                            </span>
                            {d.fileUrl && (
                              <button onClick={() => window.open(d.fileUrl, '_blank')}
                                className="w-6 h-6 rounded flex items-center justify-center text-[#1A438A] hover:bg-[#1A438A]/10 transition-colors">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>

                {/* Approvals */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Approvals</span>
                  </div>
                  <div className="p-3 space-y-2.5">
                    {isReadOnly ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500 font-medium">Cluster Director</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-600 font-mono truncate max-w-[140px]">{cdUser?.email || s?.f9ClusterDirectorId || '—'}</span>
                            {(s?.status === 'PENDING_GMC' || s?.status === 'PENDING_BUM_DOCS' || s?.status === 'COMPLETED') && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500 font-medium">GMC member</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-600 font-mono truncate max-w-[140px]">{gmcUser?.email || s?.f9GMCMemberId || '—'}</span>
                            {(s?.status === 'PENDING_BUM_DOCS' || s?.status === 'COMPLETED') && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <FieldLabel text="Cluster Director*" />
                          <select value={cdId} onChange={e => setCdId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30">
                            <option value="">Select...</option>
                            {cdList.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                          </select>
                        </div>
                        <div>
                          <FieldLabel text="GMC member*" />
                          <select value={gmcId} onChange={e => setGmcId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A438A]/30">
                            <option value="">Select...</option>
                            {gmcList.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Comments */}
                {s?.comments && s.comments.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Comments</span>
                    </div>
                    <div className="p-3 space-y-2 max-h-40 overflow-y-auto">
                      {s.comments.map((c: any) => (
                        <div key={c.id} className="text-xs bg-slate-50 rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-slate-700">{c.authorName}</span>
                            <span className="text-[10px] text-slate-400">{fmtDate(c.createdAt)}</span>
                          </div>
                          <p className="text-slate-600">{c.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 font-medium">{error}</div>}

                {/* Action Buttons */}
                <div className="flex flex-col gap-2">
                  {mode === 'new' && (
                    <>
                      <button onClick={() => router.push('/home')} className="w-full py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">BACK</button>
                      <button onClick={handleSubmitNew} disabled={submitting}
                        className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)' }}>
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'SUBMIT'}
                      </button>
                    </>
                  )}
                  {mode === 'confirm' && (
                    <>
                      <button onClick={() => router.push('/home')} className="w-full py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">Back</button>
                      <button onClick={() => setConfirmModal('cancel')} className="w-full py-3 rounded-xl text-white text-sm font-semibold bg-red-500 hover:bg-red-600 transition-all">Cancel Request</button>
                      <button onClick={() => setConfirmModal('proceed')} disabled={submitting}
                        className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all"
                        style={{ background: '#89BD3B' }}>
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Send to Approvals'}
                      </button>
                    </>
                  )}
                  {mode === 'docs' && (
                    <>
                      <button onClick={() => router.push('/home')} className="w-full py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">Back</button>
                      <button onClick={() => setConfirmModal('cancel')} className="w-full py-3 rounded-xl text-white text-sm font-semibold bg-red-500 hover:bg-red-600 transition-all">Cancel Request</button>
                      <button onClick={() => setConfirmModal('submit_docs')} disabled={submitting}
                        className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all"
                        style={{ background: '#89BD3B' }}>
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Submit Documents'}
                      </button>
                    </>
                  )}
                  {mode === 'view' && (
                    <button onClick={() => router.push('/home')} className="w-full py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">Back</button>
                  )}
                </div>
        </div>
      </div>

      {/* Modals */}
      {successNo && <SuccessModal submissionNo={successNo} onClose={() => router.push('/home')} />}
      {confirmModal === 'proceed' && (
        <ConfirmActionModal title="Send to Approvals?" message="The request will be sent to the Cluster Director for approval."
          confirmLabel="Yes, Proceed" confirmClass="bg-[#89BD3B] hover:bg-[#7aaa30]"
          onConfirm={() => { setConfirmModal(null); handleConfirmProceed(); }} onClose={() => setConfirmModal(null)} />
      )}
      {confirmModal === 'cancel' && (
        <ConfirmActionModal title="Cancel Request?" message="This action is irreversible. The request will be permanently cancelled."
          confirmLabel="Yes, Cancel" confirmClass="bg-red-500 hover:bg-red-600" requireComment
          onConfirm={() => { setConfirmModal(null); handleCancelRequest(); }} onClose={() => setConfirmModal(null)} />
      )}
      {confirmModal === 'submit_docs' && (
        <ConfirmActionModal title="Submit Documents?" message="All uploaded documents will be sent to the Legal Officer for review."
          confirmLabel="Yes, Submit" confirmClass="bg-[#89BD3B] hover:bg-[#7aaa30]"
          onConfirm={() => { setConfirmModal(null); handleSubmitDocs(); }} onClose={() => setConfirmModal(null)} />
      )}

      {/* ── Validation Modal ── */}
      {showValidation && (
        <ValidationModal errors={validationErrors} onClose={() => setShowValidation(false)} />
      )}

      {/* ── Upload Popup ── */}
      {uploadPopup && (
        <UploadPopup
          docLabel={uploadPopup.docLabel}
          files={docFiles[uploadPopup.docId] || []}
          onAdd={(files) => addFilesToDoc(uploadPopup.docId, files)}
          onRemove={(id) => removeFileFromDoc(uploadPopup.docId, id)}
          onClose={() => setUploadPopup(null)}
        />
      )}

      {/* ── Instructions Modal ── */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowInstructions(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[82vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white font-bold text-base">Instructions</span>
              <button onClick={() => setShowInstructions(false)} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
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

      {/* ── Sign Out Modal ── */}
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

export default function Form9Page() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#EEF3F8]"><Loader2 className="w-8 h-8 animate-spin text-[#1A438A]" /></div>}><Form9Inner /></Suspense>;
}