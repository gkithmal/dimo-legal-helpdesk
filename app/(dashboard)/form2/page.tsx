'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import {
  X, Home, Lightbulb, Search, Settings, User,
  ArrowLeft, FileText, CheckCircle2, Paperclip, AlertCircle,
  Send, Loader2, Calendar, ChevronDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttachedFile { id: string; name: string; size: number; file: File; fileUrl?: string; }
interface CommentEntry { id: number; author: string; text: string; time: string; }
interface LogEntry { id: number; actor: string; role: string; action: string; timestamp: string; }
interface LessorParty { type: string; name: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const SAP_CODES = [
  '000003999', '000004001', '000004002', '000004003', '000004004', '000004005', '000004006',
];

const LESSEE_OPTIONS = [
  'Diesel & Motor Engineering PLC',
  'DIMO Bodyworks (Pvt) Ltd',
  'DIMO Trading (Pvt) Ltd',
];

const LESSOR_TYPES = ['Company', 'Partnership', 'Sole proprietorship', 'Individual'];

const WORKFLOW_STEPS = [
    { label: 'Form\nSubmission' },
    { label: 'Approvals' },
    { label: 'CEO\nApproval' },
    { label: 'Legal GM\nReview' },
    { label: 'In\nProgress' },
    { label: 'Legal GM\nApproval' },
    { label: 'Ready to\nCollect' },
  ];



// All 24 Form 2 docs from SRS — shown dynamically based on lessor type
const FORM2_DOCS_ALL = [
  { label: "Offer Letter from the landowner and/or the Life Interest Holder", types: ["all"] },
  { label: "Copy of the Title Deed of the property to be leased", types: ["all"] },
  { label: "Copy of the Approved Survey Plan", types: ["all"] },
  { label: "Extracts from Land Registry for past 30 years", types: ["all"] },
  { label: "Copy of the Approved Building Plan", types: ["all"] },
  { label: "Latest Street Line Certificate from Municipal Council/Urban Council/Pradeshiya Sabha", types: ["all"] },
  { label: "Latest Building Line Certificate from Municipal Council/Urban Council/Pradeshiya Sabha", types: ["all"] },
  { label: "Latest Non-Vesting Certificate from Municipal Council/Urban Council/Pradeshiya Sabha", types: ["all"] },
  { label: "Certificate of Ownership from Municipal Council/Urban Council/Pradeshiya Sabha", types: ["all"] },
  { label: "Last Municipal Tax payment receipt with a copy of latest Assessment Notice", types: ["all"] },
  { label: "Certificate of Conformity (if there is a building)", types: ["all"] },
  { label: "Declaration that premises are not vested or subject of any notice of acquisition", types: ["all"] },
  { label: "Plan of the building/area to be leased with parking areas", types: ["all"] },
  { label: "Copy of any Mortgage on property (if no Mortgage, confirmation to that effect)", types: ["all"] },
  { label: "If loans outstanding — Copy of Loan Agreement with lending authority", types: ["all"] },
  { label: "Letter of Acceptance", types: ["all"] },
  { label: "Last receipt of Water and Electricity bills paid", types: ["all"] },
  { label: "Copy of National Identity Card/Cards", types: ["all"] },
  { label: "If owner living abroad — copy of Passport and Power of Attorney", types: ["all"] },
  { label: "Copy of Fire Certificate (for Buildings)", types: ["all"] },
  { label: "Inventory", types: ["all"] },
  { label: "Lessor VAT Registration No (If applicable)", types: ["all"] },
  { label: "Confirmation from Facilities Manager regarding existing buildings", types: ["all"] },
  { label: "i. Memorandum and Article of Association", types: ["Company"] },
  { label: "ii. Board Resolution", types: ["Company"] },
  { label: "iii. Company registration certificate", types: ["Company"] },
  { label: "iv. Registered Address of the company", types: ["Company"] },
  { label: "v. Form 20", types: ["Company"] },
  { label: "i. Partnership registration certificate", types: ["Partnership"] },
  { label: "ii. NIC/passport copies of every partner", types: ["Partnership"] },
  { label: "i. NIC/passport of the sole proprietor", types: ["Sole proprietorship"] },
  { label: "ii. Business registration/sole proprietorship certificate", types: ["Sole proprietorship"] },
  { label: "i. NIC (Individual owner)", types: ["Individual"] },
];

const STATUS_TO_STEP: Record<string, number> = {
  DRAFT: 0, PENDING_APPROVAL: 1, PENDING_CEO: 2,
  PENDING_LEGAL_GM: 3, PENDING_LEGAL_OFFICER: 4,
  PENDING_LEGAL_GM_FINAL: 5, COMPLETED: 6,
  CANCELLED: 1, SENT_BACK: 1,
};

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
  return <p className="text-[11px] text-red-500 mt-1 font-medium">{message}</p>;
}

function TextField({ value, onChange, placeholder, disabled, hasError }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; hasError?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all
        focus:outline-none focus:ring-2 focus:ring-[#1A438A]/10 focus:border-[#1A438A]
        disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
        ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
    />
  );
}

function SelectField({ value, onChange, options, placeholder, disabled, hasError }: {
  value: string; onChange: (v: string) => void; options: string[];
  placeholder?: string; disabled?: boolean; hasError?: boolean;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className={`w-full px-3.5 py-2.5 rounded-lg border text-sm appearance-none transition-all pr-8
          focus:outline-none focus:ring-2 focus:ring-[#1A438A]/10 focus:border-[#1A438A]
          disabled:bg-slate-50 disabled:cursor-not-allowed
          ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}
          ${!value ? 'text-slate-400' : 'text-slate-700'}`}>
        <option value="">{placeholder || 'Select...'}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  );
}

function DateField({ value, onChange, disabled, hasError }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; hasError?: boolean;
}) {
  return (
    <div className="relative">
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all pr-10
          focus:outline-none focus:ring-2 focus:ring-[#1A438A]/10 focus:border-[#1A438A]
          disabled:bg-slate-50 disabled:cursor-not-allowed
          ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
      />
      <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
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

function ValidationModal({ errors, onClose }: { errors: string[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
          <h3 className="text-white font-bold text-base">Please fix the following</h3>
        </div>
        <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700">{e}</p>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl font-bold text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>OK</button>
        </div>
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
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {log.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">No log entries yet.</p> : (
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
          <button onClick={onClose} className="w-full py-2.5 rounded-xl font-bold text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Content ─────────────────────────────────────────────────────────────

function generateSubmissionId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
  return `LHD_${datePart}_${seq}`;
}

function Form2PageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = (searchParams.get('mode') || 'new') as 'new' | 'view' | 'draft' | 'resubmit';
  const submissionId = searchParams.get('id');
  const isReadOnly = mode === 'view';

  const [showSignOut, setShowSignOut] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showBackModal, setShowBackModal] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [submissionNo, setSubmissionNo] = useState("");
  useEffect(() => { setSubmissionNo(generateSubmissionId()); }, []);
  const [submissionStatus, setSubmissionStatus] = useState('');
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructionsText, setInstructionsText] = useState('');
  const [formConfigDocs, setFormConfigDocs] = useState<{label: string; type: string}[]>([]);

  // ── Form fields ──
  const [contactPerson, setContactPerson] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [deptSapCode, setDeptSapCode] = useState('');
  const [purposeOfLease, setPurposeOfLease] = useState('');
  const [lessorParties, setLessorParties] = useState<LessorParty[]>([
    { type: '', name: '' }, { type: '', name: '' },
  ]);
  const [nicNo, setNicNo] = useState('');
  const [vatRegNo, setVatRegNo] = useState('');
  const [lessorContact, setLessorContact] = useState('');
  const [leaseName, setLeaseName] = useState('');
  const [premisesAssetNo, setPremisesAssetNo] = useState('');
  const [periodOfLease, setPeriodOfLease] = useState('');
  const [assetHouse, setAssetHouse] = useState(false);
  const [assetLand, setAssetLand] = useState(false);
  const [assetBuilding, setAssetBuilding] = useState(false);
  const [assetExtent, setAssetExtent] = useState('');
  const [commencingFrom, setCommencingFrom] = useState('');
  const [endingOn, setEndingOn] = useState('');
  const [monthlyRental, setMonthlyRental] = useState('');
  const [advancePayment, setAdvancePayment] = useState('');
  const [deductibleRate, setDeductibleRate] = useState('');
  const [deductiblePeriod, setDeductiblePeriod] = useState('');
  const [refundableDeposit, setRefundableDeposit] = useState('');
  const [electricityWaterPhone, setElectricityWaterPhone] = useState('');
  const [previousAgreementNo, setPreviousAgreementNo] = useState('');
  const [dateOfPrincipalAgreement, setDateOfPrincipalAgreement] = useState('');
  const [buildingsConstructed, setBuildingsConstructed] = useState<'yes' | 'no' | ''>('');
  const [intendToConstruct, setIntendToConstruct] = useState<'yes' | 'no' | ''>('');
  const [remarks, setRemarks] = useState('');

  // ── Approvers ──
  const [bum, setBum] = useState('');
  const [fbp, setFbp] = useState('');
  const [clusterHead, setClusterHead] = useState('');
  const [bumOptions, setBumOptions] = useState<string[]>([]);
  const [fbpOptions, setFbpOptions] = useState<string[]>([]);
  const [clusterOptions, setClusterOptions] = useState<string[]>([]);
  const [userIdMap, setUserIdMap] = useState<Record<string, string>>({});

  // ── Documents ──
  const [docFiles, setDocFiles] = useState<Record<string, AttachedFile[]>>({});
  const [docIdMap, setDocIdMap] = useState<Record<string, string>>({});
  const docFilesRef = useRef<Record<string, AttachedFile[]>>({});
  const [uploadPopup, setUploadPopup] = useState<{ docKey: string; docLabel: string; docId: string } | null>(null);

  // ── Load users ──
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => {
      if (!data.success) return;
      const users: { id: string; name: string; email: string; role: string; isActive: boolean }[] = data.data;
      const idMap: Record<string, string> = {};
      users.forEach(u => { if (u.name) idMap[u.name] = u.id; idMap[u.email] = u.id; });
      setUserIdMap(idMap);
      const toNames = (role: string) => users.filter(u => u.role === role && u.isActive).map(u => u.name || u.email);
      setBumOptions(toNames('BUM'));
      setFbpOptions(toNames('FBP'));
      setClusterOptions(toNames('CLUSTER_HEAD'));
    }).catch(console.error);
  }, []);

  // ── Pre-fill contact person from session ──
  useEffect(() => {
    if (session?.user?.name && !contactPerson) {
      setContactPerson(session.user.name);
    }
  }, [session]);

  // ── Load form config ──
  useEffect(() => {
    fetch('/api/settings/forms').then(r => r.json()).then(data => {
      if (data.success) {
        const config = data.data.find((c: any) => c.formId === 2);
        if (config?.instructions) setInstructionsText(config.instructions);
        if (config?.docs?.length) setFormConfigDocs(config.docs);
      }
    }).catch(() => {});
  }, []);

  // ── Load existing submission ──
  useEffect(() => {
    if ((mode === 'view' || mode === 'draft' || mode === 'resubmit') && submissionId) {
      fetch(`/api/submissions/${submissionId}`).then(r => r.json()).then(({ data: s }) => {
        if (!s) return;
        setSubmissionNo(s.submissionNo || '');
        setSubmissionStatus(s.status || '');
        try {
          const meta = JSON.parse(s.scopeOfAgreement || '{}');
          setContactNo(meta.contactNo || '');
          setDeptSapCode(meta.deptSapCode || '');
          setPurposeOfLease(meta.purposeOfLease || '');
          setLessorParties(meta.lessorParties || [{ type: '', name: '' }, { type: '', name: '' }]);
          setNicNo(meta.nicNo || '');
          setVatRegNo(meta.vatRegNo || '');
          setLessorContact(meta.lessorContact || '');
          setLeaseName(meta.leaseName || '');
          setPremisesAssetNo(meta.premisesAssetNo || '');
          setPeriodOfLease(meta.periodOfLease || '');
          setAssetHouse(meta.assetHouse || false);
          setAssetLand(meta.assetLand || false);
          setAssetBuilding(meta.assetBuilding || false);
          setAssetExtent(meta.assetExtent || '');
          setCommencingFrom(meta.commencingFrom || '');
          setEndingOn(meta.endingOn || '');
          setMonthlyRental(meta.monthlyRental || '');
          setAdvancePayment(meta.advancePayment || '');
          setDeductibleRate(meta.deductibleRate || '');
          setDeductiblePeriod(meta.deductiblePeriod || '');
          setRefundableDeposit(meta.refundableDeposit || '');
          setElectricityWaterPhone(meta.electricityWaterPhone || '');
          setPreviousAgreementNo(meta.previousAgreementNo || '');
          setDateOfPrincipalAgreement(meta.dateOfPrincipalAgreement || '');
          setBuildingsConstructed(meta.buildingsConstructed || '');
          setIntendToConstruct(meta.intendToConstruct || '');
          setRemarks(meta.remarks || '');
          setContactPerson(meta.contactPerson || session?.user?.name || '');
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
          setDocFiles(loaded); setDocIdMap(idMap);
        }
        const fmt = (d: string) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        setLog([
          { id: 0, actor: 'System', role: 'System', action: 'Submission created', timestamp: fmt(s.createdAt) },
          ...(s.approvals || []).filter((a: any) => a.actionDate).map((a: any, i: number) => ({
            id: i + 1, actor: a.approverName || a.role, role: a.role,
            action: a.status === 'APPROVED' ? 'Approved' : a.status === 'SENT_BACK' ? 'Sent Back' : 'Cancelled',
            timestamp: fmt(a.actionDate),
          })),
        ]);
      }).catch(console.error);
    }
  }, [mode, submissionId]);

  // ── Validation ──
  const validate = (): string[] => {
    const errors: string[] = [];
    if (!contactNo.trim())        errors.push('Contact No is required');
    if (!deptSapCode)             errors.push('Dept. SAP code is required');
    if (!purposeOfLease.trim())   errors.push('Purpose of Lease is required');
    if (!lessorParties.some(p => p.type && p.name.trim())) errors.push('At least one Property Owner (Lessor) is required');
    if (!nicNo.trim())            errors.push('NIC No is required');
    if (!lessorContact.trim())    errors.push('Contact is required');
    if (!leaseName.trim())        errors.push('Name of Lessee/Tenant is required');
    if (!periodOfLease.trim())    errors.push('Period of Lease is required');
    if (!assetHouse && !assetLand && !assetBuilding) errors.push('Asset Type is required (select at least one)');
    if (!commencingFrom)          errors.push('Commencing from date is required');
    if (!endingOn)                errors.push('Ending on date is required');
    if (!monthlyRental.trim())    errors.push('Monthly Rental is required');
    if (!refundableDeposit.trim()) errors.push('Refundable Deposit is required');
    if (!electricityWaterPhone.trim()) errors.push('Electricity, Water & Phone is required');
    if (!buildingsConstructed)    errors.push('Please indicate if buildings are fully or partly constructed');
    if (!intendToConstruct)       errors.push('Please indicate if you intend to construct any building');
    if (!bum)                     errors.push('BUM is required');
    if (!fbp)                     errors.push('FBP is required');
    if (!clusterHead)             errors.push('Cluster Head is required');
    return errors;
  };

  const hasError = (field: string) => submitted && validate().some(e => e.toLowerCase().includes(field.toLowerCase()));

  const buildMeta = () => JSON.stringify({
    contactNo, deptSapCode, purposeOfLease, lessorParties, nicNo, vatRegNo, lessorContact,
    leaseName, premisesAssetNo, periodOfLease, assetHouse, assetLand, assetBuilding, assetExtent,
    commencingFrom, endingOn, monthlyRental, advancePayment, deductibleRate, deductiblePeriod,
    refundableDeposit, electricityWaterPhone, previousAgreementNo, dateOfPrincipalAgreement,
    buildingsConstructed, intendToConstruct, remarks,
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
        submissionNo,
        formId: 2,
        formName: 'Lease Agreement',
        status: asDraft ? 'DRAFT' : 'PENDING_APPROVAL',
        initiatorId: session?.user?.id || '',
        initiatorName: session?.user?.name || '',
        companyCode: deptSapCode || 'N/A',
        title: 'Lease Agreement',
        sapCostCenter: deptSapCode || 'N/A',
        scopeOfAgreement: buildMeta(),
        term: `${commencingFrom} to ${endingOn}`,
        lkrValue: monthlyRental.replace(/,/g, ''),
        remarks,
        initiatorComments: '',
        legalOfficerId: '',
        bumId: userIdMap[bum] || bum,
        fbpId: userIdMap[fbp] || fbp,
        clusterHeadId: userIdMap[clusterHead] || clusterHead,
        parties: lessorParties.filter(p => p.type && p.name.trim()),
        ...(mode === 'resubmit' && submissionId && { parentId: submissionId, isResubmission: true }),
      };

      const isDraftEdit = mode === 'draft' && submissionId;
      const res = await fetch(isDraftEdit ? `/api/submissions/${submissionId}` : '/api/submissions', {
        method: isDraftEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isDraftEdit ? { status: asDraft ? 'DRAFT' : 'PENDING_APPROVAL', scopeOfAgreement: buildMeta() } : payload),
      });

      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Server error: ${res.status}`); }

      const data = await res.json();
      console.log('[Form2 submit response]', JSON.stringify(data).slice(0, 300));
      const no = data.data?.submissionNo || data.submissionNo || "";
      if (no) setSubmissionNo(no);
      else console.warn('[Form2] submissionNo missing from response', data);
      if (!asDraft) setShowSuccess(true);

      // Upload files
      if (!asDraft && data.data?.id && data.data?.documents?.length) {
        const newSubId = data.data.id;
        const docLabelToId: Record<string, string> = {};
        data.data.documents.forEach((d: { id: string; label: string }) => { docLabelToId[d.label] = d.id; });
        await Promise.all(
          Object.entries(docFilesRef.current).flatMap(([docKey, files]) =>
            (files as AttachedFile[]).filter(f => f.file && !f.fileUrl).map(async (f) => {
              const fd = new FormData(); fd.append('file', f.file); fd.append('submissionId', newSubId);
              const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
              const uploadData = await uploadRes.json();
              if (uploadData.success && uploadData.url && docLabelToId[docKey]) {
                await fetch(`/api/submissions/${newSubId}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ documentId: docLabelToId[docKey], fileUrl: uploadData.url, documentStatus: 'UPLOADED' }),
                });
              }
            })
          )
        );
      }

      if (asDraft || mode === 'resubmit') router.push(ROUTES.HOME);
    } catch (err: unknown) {
      setValidationErrors([err instanceof Error ? err.message : 'Submission failed. Please try again.']);
      setShowValidation(true);
    } finally { setIsSubmitting(false); }
  };

  const addFilesToDoc = (docKey: string, newFiles: AttachedFile[]) =>
    setDocFiles(prev => { const next = { ...prev, [docKey]: [...(prev[docKey] || []), ...newFiles] }; docFilesRef.current = next; return next; });

  const removeFileFromDoc = (docKey: string, fileId: string) =>
    setDocFiles(prev => ({ ...prev, [docKey]: (prev[docKey] || []).filter(f => f.id !== fileId) }));

  const currentStep = mode === 'view' ? (STATUS_TO_STEP[submissionStatus] ?? 1) : 0;
  const canUploadDocs = !isReadOnly || ['PENDING_APPROVAL', 'SENT_BACK', 'DRAFT'].includes(submissionStatus);

  // Dynamic docs based on selected lessor types + settings
  const selectedTypes = [...new Set(lessorParties.map((p: any) => p.type).filter(Boolean))];
  const FORM2_DOCS: string[] = [];
  if (formConfigDocs.length > 0) {
    // Use admin-configured docs from settings — filter by lessor type + Common
    formConfigDocs.forEach((doc) => {
      const normalizedType = doc.type.replace('-', ' ');
      if (doc.type === 'Common' || selectedTypes.includes(doc.type) || selectedTypes.includes(normalizedType)) {
        if (!FORM2_DOCS.includes(doc.label)) FORM2_DOCS.push(doc.label);
      }
    });
  } else {
    // Fallback to hardcoded FORM2_DOCS_ALL if settings not yet configured
    FORM2_DOCS_ALL
      .filter((d: any) => d.types.includes('all') || selectedTypes.some((t: any) => d.types.includes(t)))
      .forEach((d: any) => { if (!FORM2_DOCS.includes(d.label)) FORM2_DOCS.push(d.label); });
  }

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* ── Sidebar ── */}
      <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen"
        style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
        <div className="relative mb-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">
            {(session?.user?.name || 'U').charAt(0)}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]" />
        </div>
        <div className="text-center">
          <p className="text-white text-[10px] font-semibold">{(session?.user?.name || '').split(' ')[0]}</p>
          <p className="text-white/40 text-[9px]">{(session?.user?.name || '').split(' ')[1] || ''}</p>
        </div>
        <div className="w-8 h-px bg-white/10" />
        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          <NotificationBell />
          <button onClick={() => router.push(ROUTES.HOME)} className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all" title="Home">
            <Home className="w-[18px] h-[18px]" />
          </button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Lightbulb className="w-[18px] h-[18px]" /></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Search className="w-[18px] h-[18px]" /></button>
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><Settings className="w-[18px] h-[18px]" /></button>
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
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">Lease Agreement</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono tracking-wide">16/FM/1641/07/02</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {mode !== 'new' && (
                  <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border
                    ${mode === 'view' ? 'bg-blue-500/20 text-blue-200 border-blue-400/30' : 'bg-orange-500/20 text-orange-200 border-orange-400/30'}`}>
                    {mode === 'view' ? 'View Only' : 'Resubmission'}
                  </span>
                )}
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 2</div>
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

              {/* Row 1: Contact Person (auto) + Contact No + SAP Code */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Contact Person (Dimo)</FieldLabel>
                  <TextField value={contactPerson} onChange={(val: string) => setContactPerson(val)} placeholder="Contact person name" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel required>Contact No</FieldLabel>
                    <TextField value={contactNo} onChange={setContactNo} placeholder="+94..." disabled={isReadOnly} hasError={hasError('contact no')} />
                    <FieldError message={hasError('contact no') ? 'Required' : undefined} />
                  </div>
                  <div>
                    <FieldLabel required>Dept. SAP code</FieldLabel>
                    <SelectField value={deptSapCode} onChange={setDeptSapCode} options={SAP_CODES} placeholder="Select..." disabled={isReadOnly} hasError={hasError('sap code')} />
                    <FieldError message={hasError('sap code') ? 'Required' : undefined} />
                  </div>
                </div>
              </div>

              {/* Purpose of Lease */}
              <div>
                <FieldLabel required>Purpose of Lease</FieldLabel>
                <TextField value={purposeOfLease} onChange={setPurposeOfLease} placeholder="Enter purpose of lease..." disabled={isReadOnly} hasError={hasError('purpose')} />
                <FieldError message={hasError('purpose') ? 'Purpose of Lease is required' : undefined} />
              </div>

              <SectionDivider>Property Owner (Lessor)</SectionDivider>

              <div className="grid grid-cols-2 gap-4 mb-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">Type <span className="text-red-400">*</span></p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">Name of the Party <span className="text-red-400">*</span></p>
              </div>
              {lessorParties.map((party, i) => (
                <div key={i} className="grid grid-cols-2 gap-4">
                  <SelectField value={party.type}
                    onChange={(v) => { const u = [...lessorParties]; u[i] = { ...u[i], type: v }; setLessorParties(u); }}
                    options={LESSOR_TYPES} placeholder="Select type..." disabled={isReadOnly} />
                  <TextField value={party.name}
                    onChange={(v) => { const u = [...lessorParties]; u[i] = { ...u[i], name: v }; setLessorParties(u); }}
                    placeholder="Enter party name..." disabled={isReadOnly} />
                </div>
              ))}
              <FieldError message={hasError('lessor') ? 'At least one Property Owner (Lessor) is required' : undefined} />

              {/* NIC + VAT */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>NIC No</FieldLabel>
                  <TextField value={nicNo} onChange={setNicNo} placeholder="e.g. 978657354V" disabled={isReadOnly} hasError={hasError('nic')} />
                  <FieldError message={hasError('nic') ? 'NIC No is required' : undefined} />
                </div>
                <div>
                  <FieldLabel>VAT Reg. No.</FieldLabel>
                  <TextField value={vatRegNo} onChange={setVatRegNo} placeholder="e.g. 02009" disabled={isReadOnly} />
                </div>
              </div>

              {/* Lessor Contact */}
              <div>
                <FieldLabel required>Contact</FieldLabel>
                <TextField value={lessorContact} onChange={setLessorContact} placeholder="+94..." disabled={isReadOnly} hasError={hasError('contact is')} />
                <FieldError message={hasError('contact is') ? 'Contact is required' : undefined} />
              </div>

              <SectionDivider>Lessee / Tenant Details</SectionDivider>

              <div>
                <FieldLabel required>Name of Lessee/Tenant</FieldLabel>
                <SelectField value={leaseName} onChange={setLeaseName} options={LESSEE_OPTIONS}
                  placeholder="Select by Company Code..." disabled={isReadOnly} hasError={hasError('lessee')} />
                <FieldError message={hasError('lessee') ? 'Name of Lessee/Tenant is required' : undefined} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Premises bearing Asst. No</FieldLabel>
                  <TextField value={premisesAssetNo} onChange={setPremisesAssetNo} placeholder="e.g. 00005" disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel required>Period of Lease</FieldLabel>
                  <TextField value={periodOfLease} onChange={setPeriodOfLease} placeholder="e.g. 3 m" disabled={isReadOnly} hasError={hasError('period of lease')} />
                  <FieldError message={hasError('period of lease') ? 'Period of Lease is required' : undefined} />
                </div>
              </div>

              <SectionDivider>Asset &amp; Lease Details</SectionDivider>

              {/* Asset Type */}
              <div>
                <FieldLabel required>Asset Type</FieldLabel>
                <div className="flex items-center gap-6 mt-1 flex-wrap">
                  {[
                    { label: 'House', value: assetHouse, set: setAssetHouse },
                    { label: 'Land', value: assetLand, set: setAssetLand },
                    { label: 'Building', value: assetBuilding, set: setAssetBuilding },
                  ].map(({ label, value, set }) => (
                    <label key={label} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={value} onChange={e => !isReadOnly && set(e.target.checked)} className="w-4 h-4 accent-[#1A438A]" />
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                  ))}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">Extent</span>
                    <input type="text" value={assetExtent} onChange={e => setAssetExtent(e.target.value)}
                      placeholder="e.g. 20 P" disabled={isReadOnly}
                      className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#1A438A]" />
                  </div>
                </div>
                <FieldError message={hasError('asset type') ? 'Asset Type is required (select at least one)' : undefined} />
              </div>

              {/* Commencing + Ending */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Commencing from</FieldLabel>
                  <DateField value={commencingFrom} onChange={setCommencingFrom} disabled={isReadOnly} hasError={hasError('commencing')} />
                  <FieldError message={hasError('commencing') ? 'Required' : undefined} />
                </div>
                <div>
                  <FieldLabel required>Ending on</FieldLabel>
                  <DateField value={endingOn} onChange={setEndingOn} disabled={isReadOnly} hasError={hasError('ending')} />
                  <FieldError message={hasError('ending') ? 'Required' : undefined} />
                </div>
              </div>

              {/* Monthly Rental */}
              <div>
                <FieldLabel required>Monthly Rental Rs.</FieldLabel>
                <TextField value={monthlyRental} onChange={setMonthlyRental} placeholder="e.g. 100,000" disabled={isReadOnly} hasError={hasError('monthly rental')} />
                <FieldError message={hasError('monthly rental') ? 'Monthly Rental is required' : undefined} />
              </div>

              {/* Advance + Deductible + Period */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <FieldLabel>Advance Payment Rs.</FieldLabel>
                  <TextField value={advancePayment} onChange={setAdvancePayment} placeholder="e.g. 150,000" disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel>Deductible Rate Rs.</FieldLabel>
                  <TextField value={deductibleRate} onChange={setDeductibleRate} placeholder="e.g. 50,000" disabled={isReadOnly} />
                </div>
                <div>
                  <FieldLabel>Period</FieldLabel>
                  <TextField value={deductiblePeriod} onChange={setDeductiblePeriod} placeholder="e.g. 3 m" disabled={isReadOnly} />
                </div>
              </div>

              {/* Refundable Deposit */}
              <div>
                <FieldLabel required>Refundable Deposit Rs.</FieldLabel>
                <TextField value={refundableDeposit} onChange={setRefundableDeposit} placeholder="e.g. 175,000" disabled={isReadOnly} hasError={hasError('refundable')} />
                <FieldError message={hasError('refundable') ? 'Refundable Deposit is required' : undefined} />
              </div>

              {/* Electricity, Water & Phone */}
              <div>
                <FieldLabel required>Electricity, Water &amp; Phone</FieldLabel>
                <TextField value={electricityWaterPhone} onChange={setElectricityWaterPhone} placeholder="e.g. N/A" disabled={isReadOnly} hasError={hasError('electricity')} />
                <FieldError message={hasError('electricity') ? 'Electricity, Water & Phone is required' : undefined} />
              </div>

              {/* Previous Agreement No */}
              <div>
                <FieldLabel>If a Renewal, Previous Agreement No</FieldLabel>
                <TextField value={previousAgreementNo} onChange={setPreviousAgreementNo} placeholder="e.g. N/A" disabled={isReadOnly} />
              </div>

              {/* Date of Principal Agreement */}
              <div>
                <FieldLabel>Date of the Principal Agreement</FieldLabel>
                <DateField value={dateOfPrincipalAgreement} onChange={setDateOfPrincipalAgreement} disabled={isReadOnly} />
              </div>

              {/* Buildings constructed */}
              <div>
                <FieldLabel required>Are there any buildings fully or partly constructed?</FieldLabel>
                <div className="flex items-center gap-6 mt-1">
                  {(['yes', 'no'] as const).map((v) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={buildingsConstructed === v}
                        onChange={() => !isReadOnly && setBuildingsConstructed(buildingsConstructed === v ? '' : v)}
                        className="w-4 h-4 accent-[#1A438A]" />
                      <span className="text-sm text-slate-700 capitalize">{v}</span>
                    </label>
                  ))}
                </div>
                <FieldError message={hasError('buildings fully') ? 'This field is required' : undefined} />
              </div>

              {/* Intend to construct */}
              <div>
                <FieldLabel required>Do you intend to construct any building or put up any temporary structures in the leased land/premises?</FieldLabel>
                <div className="flex items-center gap-6 mt-1">
                  {(['yes', 'no'] as const).map((v) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={intendToConstruct === v}
                        onChange={() => !isReadOnly && setIntendToConstruct(intendToConstruct === v ? '' : v)}
                        className="w-4 h-4 accent-[#1A438A]" />
                      <span className="text-sm text-slate-700 capitalize">{v}</span>
                    </label>
                  ))}
                </div>
                <FieldError message={hasError('intend to construct') ? 'This field is required' : undefined} />
              </div>

              {/* Remarks */}
              <div>
                <FieldLabel>Remarks</FieldLabel>
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} disabled={isReadOnly}
                  placeholder="Optional remarks..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10 disabled:bg-slate-50 disabled:cursor-not-allowed" />
              </div>

            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-[320px] flex-shrink-0 flex flex-col gap-4">

          {/* Workflow Tracker */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-5">
              {mode !== 'new'
                ? <button onClick={() => setShowLog(true)} className="text-[11px] font-semibold text-[#1A438A] hover:underline">View Log</button>
                : <div />}
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
                  <p className="text-[8px] text-center leading-tight whitespace-pre-line mt-1.5 text-slate-500 font-medium px-0">{step.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Required Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
              <button onClick={() => setShowInstructions(true)}
                className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                Instructions
              </button>
            </div>
            <div className="p-3 space-y-1.5">
              {selectedTypes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <p className="text-[11px] text-slate-400 font-medium">Select lessor type to see<br/>required documents</p>
                </div>
              ) : FORM2_DOCS.map((doc: string, i: number) => {
                const files = docFiles[doc] || [];
                const hasFiles = files.length > 0;
                return (
                  <div key={doc} className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all
                    ${hasFiles ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                    <div className="flex-1 mr-2 min-w-0">
                      <span className="text-[11px] text-slate-600 leading-tight block">
                        <span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{doc}
                      </span>
                      {hasFiles && <span className="text-[10px] text-emerald-600 font-semibold">{files.length} file{files.length > 1 ? 's' : ''} attached</span>}
                    </div>
                    {canUploadDocs ? (
                      <button onClick={() => setUploadPopup({ docKey: doc, docLabel: doc, docId: docIdMap[doc] || '' })} className="flex-shrink-0">
                        {hasFiles ? <CheckCircle2 className="w-4 h-4 text-emerald-500 hover:text-emerald-600" /> : <Paperclip className="w-4 h-4 text-[#1183B7] hover:text-[#1A438A]" />}
                      </button>
                    ) : hasFiles && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-slate-100">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/80">
                <div className="w-0.5 h-3.5 rounded-full bg-[#1A438A]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#17293E]">Documents by Legal Dept.</span>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-slate-400 italic">No documents added yet</p>
              </div>
            </div>
          </div>

          {/* Approvals */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Approvals</span>
            </div>
            <div className="p-4 space-y-3.5">
              {[
                { label: 'BUM', value: bum, set: setBum, options: bumOptions, key: 'bum' },
                { label: 'FBP', value: fbp, set: setFbp, options: fbpOptions, key: 'fbp' },
                { label: 'Cluster Head', value: clusterHead, set: setClusterHead, options: clusterOptions, key: 'cluster head' },
              ].map(({ label, value, set, options, key }) => (
                <div key={label}>
                  <FieldLabel required>{label}</FieldLabel>
                  <SelectField value={value} onChange={set} options={options} placeholder={`Select ${label}...`} disabled={isReadOnly} hasError={hasError(key)} />
                  <FieldError message={hasError(key) ? `${label} is required` : undefined} />
                </div>
              ))}
              {/* CEO note */}
              <div className="mt-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-[11px] text-amber-700 font-semibold">CEO approval required</p>
                <p className="text-[10px] text-amber-600 mt-0.5">CEO will be notified automatically after first level approvals.</p>
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
                <input type="text" value={commentInput} onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (() => { if (!commentInput.trim()) return; setComments(p => [...p, { id: Date.now(), author: session?.user?.name || 'You', text: commentInput.trim(), time: 'Just now' }]); setCommentInput(''); })()}
                  placeholder="Post your comment here" disabled={isReadOnly}
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed" />
                <button
                  onClick={() => { if (!commentInput.trim()) return; setComments(p => [...p, { id: Date.now(), author: session?.user?.name || 'You', text: commentInput.trim(), time: 'Just now' }]); setCommentInput(''); }}
                  disabled={isReadOnly || !commentInput.trim()}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button onClick={() => setShowBackModal(true)} disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all disabled:opacity-50">
              <ArrowLeft className="w-4 h-4" />Back
            </button>
            {!isReadOnly && mode !== 'resubmit' && (
              <button onClick={() => handleSubmitClick(true)} disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                {isSubmitting ? 'Saving...' : 'Save Draft'}
              </button>
            )}
            {!isReadOnly && (
              <button onClick={() => { setSubmitted(true); handleSubmitClick(false); }} disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 shadow-lg disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)' }}>
                {isSubmitting ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Submitting...</span>
                  : mode === 'resubmit' ? 'Resubmit' : 'Submit'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Upload Popup ── */}
      {uploadPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setUploadPopup(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 text-white font-bold text-sm" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
              Upload: {uploadPopup.docLabel}
            </div>
            <div className="p-5">
              <label className="flex flex-col items-center gap-3 border-2 border-dashed border-slate-200 rounded-xl p-6 cursor-pointer hover:border-[#1A438A]/40 transition-colors">
                <Paperclip className="w-8 h-8 text-slate-300" />
                <span className="text-sm text-slate-500">Click to select file</span>
                <input type="file" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  addFilesToDoc(uploadPopup.docKey, [{ id: Date.now().toString(), name: file.name, size: file.size, file }]);
                }} />
              </label>
              {(docFiles[uploadPopup.docKey] || []).map((f) => (
                <div key={f.id} className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <FileText className="w-4 h-4 text-[#1A438A] flex-shrink-0" />
                  <span className="text-xs text-slate-600 flex-1 truncate">{f.name}</span>
                  <button onClick={() => removeFileFromDoc(uploadPopup.docKey, f.id)} className="text-red-400 hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setUploadPopup(null)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600">Cancel</button>
              <button onClick={() => setUploadPopup(null)} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showBackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBackModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-amber-500" />
            </div>
            <h3 className="text-[#17293E] font-bold text-base mb-1">Leave this form?</h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">Your progress will be lost if you go back without saving.</p>
            <div className="flex flex-col gap-2 w-full">
              <button onClick={() => handleSubmitClick(true)} disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Save as Draft & Go Back</button>
              <button onClick={() => router.push(ROUTES.HOME)}
                className="w-full py-2.5 rounded-xl font-bold text-sm border-2 border-red-200 text-red-500 hover:bg-red-50 transition-all">Discard & Go Back</button>
              <button onClick={() => setShowBackModal(false)} className="w-full py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-all">Cancel, Stay Here</button>
            </div>
          </div>
        </div>
      )}

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
            <p className="text-slate-500 text-sm mb-4 leading-relaxed">Your request has been submitted and sent for parallel approval to BUM, FBP and Cluster Head.</p>
            <div className="w-full bg-[#f0f4f9] rounded-xl px-6 py-3 mb-6">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Submission No.</p>
              <p className="text-[#1A438A] font-bold text-lg font-mono">{submissionNo || '—'}</p>
            </div>
            <button onClick={() => { setShowSuccess(false); router.push(ROUTES.HOME); }}
              className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95 shadow-lg shadow-[#1A438A]/20"
              style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Return to Home</button>
          </div>
        </div>
      )}

      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowInstructions(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[82vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white font-bold text-base">Instructions</span>
              <button onClick={() => setShowInstructions(false)} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {instructionsText
                ? <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{instructionsText}</p>
                : <div className="bg-amber-50 border border-amber-200 rounded-xl p-4"><p className="text-sm text-amber-800 font-medium">No instructions configured yet. Please contact the Legal GM.</p></div>}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => setShowInstructions(false)} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)' }}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {showValidation && <ValidationModal errors={validationErrors} onClose={() => setShowValidation(false)} />}
      {showLog && <ViewLogModal log={log} onClose={() => setShowLog(false)} />}

      {showSignOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSignOut(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-sm z-10">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Sign Out</h3>
            <p className="text-sm text-slate-500 mb-5">Are you sure you want to sign out?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowSignOut(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => { setShowSignOut(false); router.push('/login'); }} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white active:scale-95" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Form2Page() {


  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <Form2PageContent />
    </Suspense>
  );
}