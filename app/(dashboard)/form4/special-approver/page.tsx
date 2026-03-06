'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  LogOut, Home, Lightbulb, Search, Settings, User,
  Paperclip, CheckCircle2, X, File,
  Eye, Trash2, Send, ArrowLeft, Car,
  ThumbsUp, ThumbsDown,
} from 'lucide-react';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttachedFile { id: string; name: string; size: number; file: File; fileUrl?: string; }
interface CommentEntry { id: number; author: string; text: string; time: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' },
  { label: 'Approvals' },
  { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' },
  { label: 'Legal GM\nApproval' },
  { label: 'Ready to\nCollect' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (b === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ─── Field Components ─────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
      {children}
    </label>
  );
}

function ReadField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className={`w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 ${multiline ? 'whitespace-pre-wrap leading-relaxed min-h-[80px]' : ''}`}>
        {value || <span className="text-slate-400 italic">—</span>}
      </div>
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

function UploadPopup({ docLabel, files, onRemove, onClose, canRemove = false }: {
  docLabel: string; files: AttachedFile[];
  onRemove: (id: string) => void;
  onClose: () => void; canRemove?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Paperclip className="w-4 h-4 text-white" /></div>
            <div><p className="text-white font-bold text-sm">View Documents</p><p className="text-white/60 text-[11px] mt-0.5 truncate max-w-[280px]">{docLabel}</p></div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        {files.length > 0 ? (
          <div className="px-5 py-4">
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#EEF3F8] flex items-center justify-center flex-shrink-0"><File className="w-4 h-4 text-[#1A438A]" /></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-700 truncate">{f.name}</p><p className="text-[11px] text-slate-400">{formatBytes(f.size)}</p></div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { const url = f.fileUrl || URL.createObjectURL(f.file); window.open(url, '_blank'); }} className="w-7 h-7 rounded-lg hover:bg-[#EEF3F8] flex items-center justify-center text-slate-400 hover:text-[#1A438A]"><Eye className="w-3.5 h-3.5" /></button>
                    {canRemove && <button onClick={() => onRemove(f.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <Paperclip className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No files attached for this document</p>
          </div>
        )}
        <div className="p-5 pt-2">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Content ────────────────────────────────────────────────────────

function SpecialApproverForm4Content() {
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('id');
  const router = useRouter();
  const [showSignOut, setShowSignOut] = useState(false);
  const { data: session, status } = useSession();

  const currentUserName = session?.user?.name ?? 'User';
  const firstName = currentUserName.split(' ')[0];
  const avatarLetter = firstName.charAt(0).toUpperCase();

  // ── Form state (all read-only) ──
  const [submissionNo, setSubmissionNo] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState('');
  const [submissionLoStage, setSubmissionLoStage] = useState('');
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
  const [bum, setBum] = useState('');
  const [fbp, setFbp] = useState('');
  const [clusterHead, setClusterHead] = useState('');
  const [docFiles, setDocFiles] = useState<Record<string, AttachedFile[]>>({});
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [uploadPopup, setUploadPopup] = useState<{ docKey: string; docLabel: string } | null>(null);

  // ── Action state ──
  const [isActioning, setIsActioning] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [hasActed, setHasActed] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  if (status === 'loading') return null;
  if (status === 'authenticated' && !['SPECIAL_APPROVER'].includes(session?.user?.role as string)) {
    router.replace('/');
    return null;
  }

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
        setSubmissionLoStage(s.loStage ?? '');
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
        body: JSON.stringify({ action: 'APPROVED', role: 'SPECIAL_APPROVER', approverEmail: session?.user?.email, approverId: session?.user?.id }),
      });
      if (!res.ok) throw new Error('Approval failed');
      setHasActed(true);
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
        body: JSON.stringify({ action: 'SENT_BACK', role: 'SPECIAL_APPROVER', approverEmail: session?.user?.email, approverId: session?.user?.id, comment: rejectReason }),
      });
      if (!res.ok) throw new Error('Rejection failed');
      setHasActed(true);
      setSuccessMessage('You have sent back this request.');
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

  const loStage = submissionLoStage;
  const currentStep = (() => {
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
  const isPendingAction = submissionStatus === 'PENDING_SPECIAL_APPROVER';

  const allDocKeys = Object.keys(docFiles);

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');`}</style>

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
          <button onClick={() => router.push(ROUTES.SPECIAL_APPROVER_HOME)} className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all" title="Home">
            <Home className="w-[18px] h-[18px]" />
          </button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Lightbulb className="w-[18px] h-[18px]" /></button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"><Search className="w-[18px] h-[18px]" /></button>
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"><Settings className="w-[18px] h-[18px]" /></button>
          <button onClick={() => setShowSignOut(true)} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all" title="Sign Out">
            <User className="w-[18px] h-[18px]" />
          </button>
        </div>
      </aside>

      {/* Sign Out Modal */}
      {showSignOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSignOut(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-7 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mb-4"><LogOut className="w-7 h-7 text-red-500" /></div>
            <h3 className="text-[#17293E] font-bold text-base mb-1">Sign Out?</h3>
            <p className="text-slate-500 text-sm mb-6">You will be redirected to the login page.</p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setShowSignOut(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
              <button onClick={() => { setShowSignOut(false); router.push('/login'); }} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>Sign Out</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <div className="flex-1 flex gap-5 p-5 overflow-auto min-w-0">

        {/* ── Left: Form (read-only) ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Header */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><Car className="w-5 h-5 text-white" /></div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">Vehicle Rent Agreement</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono tracking-wide">18/FM/1641/07/04</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold px-3 py-1 rounded-full border backdrop-blur-sm bg-purple-500/20 text-purple-200 border-purple-400/30">
                  Special Approver View
                </span>
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
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Company Code (Hirer)" value={companyCode} />
                <ReadField label="SAP Cost Centre" value={sapCostCenter} />
              </div>

              <SectionDivider>Vehicle Owner</SectionDivider>
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Owner Type" value={ownerType} />
                <ReadField label="Owner Name" value={ownerName} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="NIC No" value={nicNo} />
                <ReadField label="Address" value={address} />
              </div>
              <ReadField label="Contact No" value={contactNo} />

              <SectionDivider>Vehicle Details</SectionDivider>
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Vehicle No" value={vehicleNo} />
                <ReadField label="Make" value={make} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Model" value={model} />
                <ReadField label="Chassis No" value={chassisNo} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Term of Rent" value={termOfRent} />
                <ReadField label="Commencing" value={commencing} />
              </div>

              <SectionDivider>Financial Details</SectionDivider>
              <ReadField label="Monthly Rental — excl. chauffeur (Rs.)" value={monthlyRentalExcl} />
              <ReadField label="Monthly Rental — incl. chauffeur (Rs.)" value={monthlyRentalIncl} />
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Refundable Deposit (Rs.)" value={refundableDeposit} />
                <ReadField label="Max Usage (km)" value={maxUsage} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Excess km Rate (Rs./km)" value={excessKmRate} />
                <ReadField label="Working Hours" value={workingHours} />
              </div>

              <SectionDivider>Renewal &amp; Additional Info</SectionDivider>
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Renewal Agreement No" value={renewalAgreementNo} />
                <ReadField label="Agreement Date" value={agreementDate} />
              </div>
              <ReadField label="Reason for Hiring" value={reasonForHiring} multiline />
              <ReadField label="Special Conditions & Remarks" value={specialConditions} multiline />
            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
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

          {/* Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white text-sm font-semibold">Submitted Documents</span>
            </div>
            <div className="p-3 space-y-1.5 min-h-[80px]">
              {allDocKeys.length === 0 ? (
                <div className="py-5 text-center">
                  <Paperclip className="w-5 h-5 text-slate-300 mx-auto mb-2" />
                  <p className="text-[11px] text-slate-400">No documents submitted</p>
                </div>
              ) : allDocKeys.map((key, i) => {
                const files = docFiles[key] || [];
                return (
                  <div key={key} className="flex items-center justify-between rounded-lg px-3 py-2 bg-emerald-50 border border-emerald-200">
                    <div className="flex-1 mr-2 min-w-0">
                      <span className="text-[11px] text-slate-600 leading-tight block">
                        <span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{key}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-semibold">{files.length} file{files.length > 1 ? 's' : ''}</span>
                    </div>
                    <button onClick={() => setUploadPopup({ docKey: key, docLabel: key })} className="flex-shrink-0">
                      <Eye className="w-4 h-4 text-[#1A438A]" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Approvals */}
          <PanelSection title="Approvals">
            <div className="p-4 space-y-3">
              {[['BUM', bum], ['FBP', fbp], ['Cluster Head', clusterHead]].map(([label, val]) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
                  <div className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">
                    {val || <span className="text-slate-400 italic">—</span>}
                  </div>
                </div>
              ))}
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

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button onClick={() => router.push(ROUTES.SPECIAL_APPROVER_HOME)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all duration-200">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            {isPendingAction && (
              <>
                <button onClick={() => setShowRejectModal(true)} disabled={isActioning || hasActed}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' }}>
                  <ThumbsDown className="w-4 h-4" /> Reject
                </button>
                <button onClick={() => setShowApproveModal(true)} disabled={isActioning || hasActed}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)' }}>
                  <ThumbsUp className="w-4 h-4" /> Approve
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Upload/View Popup */}
      {uploadPopup && (
        <UploadPopup
          docLabel={uploadPopup.docLabel}
          files={docFiles[uploadPopup.docKey] || []}
          onRemove={() => {}}
          onClose={() => setUploadPopup(null)}
          canRemove={false}
        />
      )}

      {/* Approve Modal */}
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

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowRejectModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0"><ThumbsDown className="w-5 h-5 text-red-600" /></div>
              <div><h3 className="text-[#17293E] font-bold text-base">Send Back this request?</h3><p className="text-slate-500 text-xs mt-0.5">Please provide a reason.</p></div>
            </div>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Enter reason..." rows={3}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10 mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setShowRejectModal(false)} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={handleReject} disabled={isActioning || !rejectReason.trim()} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' }}>
                {isActioning ? 'Sending...' : 'Send Back'}
              </button>
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
            <h2 className="text-[#17293E] text-xl font-bold mb-2">Done!</h2>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">{successMessage}</p>
            <button onClick={() => router.push(ROUTES.SPECIAL_APPROVER_HOME)} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95 shadow-lg shadow-[#1A438A]/20" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              Return to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SpecialApproverForm4Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <SpecialApproverForm4Content />
    </Suspense>
  );
}