'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import {
  X, Home, Lightbulb, Search, Settings, User,
  ArrowLeft, CheckCircle2, FileText,
  Send, Paperclip, AlertCircle, Loader2, ThumbsUp, ThumbsDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type CustomerType = 'Individual' | 'Sole-proprietorship' | 'Partnership' | 'Company' | '';
type CommentEntry = { id: number; author: string; text: string; time: string };
interface LegalHistoryEntry {
  id: string; caseNo: string; court: string;
  outstandingAmount: string; prosecutionInfo: string;
  statusOfCase: string; remarks: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' },
  { label: 'Approvals' },
  { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' },
  { label: 'Legal GM\nApproval' },
  { label: 'Ready to\nCollect' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      <div className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 min-h-[40px]">
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

// ─── Customer Read Display ────────────────────────────────────────────────────
function CustomerDisplay({ customerType, data }: { customerType: CustomerType; data: Record<string, any> }) {
  if (!customerType) return <div className="text-sm text-slate-400 italic px-1">No customer data</div>;

  if (customerType === 'Individual') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Name of the Customer" value={data.customerName || ''} />
        <ReadField label="SAP BP Code" value={data.sapBpCode || ''} />
      </div>
      <ReadField label="NIC No" value={data.nicNo || ''} />
      <ReadField label="Residential Address" value={data.residentialAddress || ''} />
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Contact No" value={data.contactNo || ''} />
        <ReadField label="Email Address" value={data.emailAddress || ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Outstanding Amount Rs." value={data.outstandingAmount || ''} />
        <ReadField label="Vehicle No" value={data.vehicleNo || ''} />
      </div>
      {data.otherDetails && <ReadField label="Other Details" value={data.otherDetails} />}
    </div>
  );

  if (customerType === 'Sole-proprietorship') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Name of the Owner" value={data.ownerName || ''} />
        <ReadField label="SAP BP Code" value={data.sapBpCode || ''} />
      </div>
      <ReadField label="Residential Address" value={data.residentialAddress || ''} />
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Business Name" value={data.businessName || ''} />
        <ReadField label="Business Registration No" value={data.businessRegNo || ''} />
      </div>
      <ReadField label="Principal Place of Business" value={data.principalPlaceOfBusiness || ''} />
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Contact No" value={data.contactNo || ''} />
        <ReadField label="Email Address" value={data.emailAddress || ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Outstanding Amount Rs." value={data.outstandingAmount || ''} />
        <ReadField label="Vehicle No" value={data.vehicleNo || ''} />
      </div>
      {data.otherDetails && <ReadField label="Other Details" value={data.otherDetails} />}
    </div>
  );

  if (customerType === 'Partnership') return (
    <div className="space-y-4">
      {(data.owners || []).length > 0 && (
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Details of the Owners</label>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-2 bg-slate-50 border-b border-slate-200">
              <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Name</div>
              <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-l border-slate-200">Residential Address</div>
            </div>
            {data.owners.map((o: any, i: number) => (
              <div key={i} className={`grid grid-cols-2 ${i < data.owners.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div className="px-3.5 py-2.5 text-sm text-slate-700">{o.name || '—'}</div>
                <div className="px-3.5 py-2.5 text-sm text-slate-700 border-l border-slate-100">{o.address || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Business Name" value={data.businessName || ''} />
        <ReadField label="Business Registration No" value={data.businessRegNo || ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="SAP BP Code" value={data.sapBpCode || ''} />
        <ReadField label="Principal Place of Business" value={data.principalPlaceOfBusiness || ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Contact No" value={data.contactNo || ''} />
        <ReadField label="Email Address" value={data.emailAddress || ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Outstanding Amount Rs." value={data.outstandingAmount || ''} />
        <ReadField label="Vehicle No" value={data.vehicleNo || ''} />
      </div>
      {data.otherDetails && <ReadField label="Other Details" value={data.otherDetails} />}
    </div>
  );

  if (customerType === 'Company') return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Company Name" value={data.companyName || ''} />
        <ReadField label="SAP BP Code" value={data.sapBpCode || ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Company Registration No" value={data.companyRegNo || ''} />
        <ReadField label="Registered Address" value={data.registeredAddress || ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Contact No" value={data.contactNo || ''} />
        <ReadField label="Email Address" value={data.emailAddress || ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ReadField label="Outstanding Amount Rs." value={data.outstandingAmount || ''} />
        <ReadField label="Vehicle No" value={data.vehicleNo || ''} />
      </div>
      {data.otherDetails && <ReadField label="Other Details" value={data.otherDetails} />}
    </div>
  );

  return null;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function SpecialApproverForm3Content() {
  const { data: session, status } = useSession();
  const currentUserName = session?.user?.name ?? 'User';
  const firstName = currentUserName.split(' ')[0];
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('id');

  const [submissionNo,     setSubmissionNo]     = useState('');
  const [submissionStatus, setSubmissionStatus] = useState('');
  const [isLoading,        setIsLoading]        = useState(true);
  const [loadError,        setLoadError]        = useState('');
  const [isActing,         setIsActing]         = useState(false);
  const [hasActed,         setHasActed]         = useState(false);
  const [apiError,         setApiError]         = useState('');
  const [showSignOut,      setShowSignOut]      = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal,  setShowRejectModal]  = useState(false);
  const [rejectReason,     setRejectReason]     = useState('');
  const [showSuccess,      setShowSuccess]      = useState(false);
  const [successMessage,   setSuccessMessage]   = useState('');
  const [comments,         setComments]         = useState<CommentEntry[]>([]);
  const [commentInput,     setCommentInput]     = useState('');
  const [docFiles,         setDocFiles]         = useState<{ id: string; label: string; fileUrl?: string }[]>([]);

  // ── Approval details ──
  const [bum, setBum] = useState('');
  const [fbp, setFbp] = useState('');

  // ── Form 3 fields (from meta JSON in scopeOfAgreement) ──
  const [demandDate,       setDemandDate]       = useState('');
  const [initiatorName,    setInitiatorName]    = useState('');
  const [initiatorContact, setInitiatorContact] = useState('');
  const [managerInCharge,  setManagerInCharge]  = useState('');
  const [officerInCharge,  setOfficerInCharge]  = useState('');
  const [companyCode,      setCompanyCode]      = useState('');
  const [sapCostCenter,    setSapCostCenter]    = useState('');
  const [clusterNo,        setClusterNo]        = useState('');
  const [repName,          setRepName]          = useState('');
  const [repDesignation,   setRepDesignation]   = useState('');
  const [repNic,           setRepNic]           = useState('');
  const [repContact,       setRepContact]       = useState('');
  const [repEmail,         setRepEmail]         = useState('');
  const [customerType,     setCustomerType]     = useState<CustomerType>('');
  const [customerData,     setCustomerData]     = useState<Record<string, any>>({});
  const [legalHistory,     setLegalHistory]     = useState<LegalHistoryEntry[]>([]);

  // ── Load submission ──
  const loadSubmission = useCallback(async () => {
    if (!submissionId) { setLoadError('No submission ID provided.'); setIsLoading(false); return; }
    try {
      const res = await fetch(`/api/submissions/${submissionId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load');
      const s = data.data;
      setSubmissionNo(s.submissionNo);
      setSubmissionStatus(s.status ?? '');

      let meta: Record<string, any> = {};
      try { meta = JSON.parse(s.scopeOfAgreement || '{}'); } catch {}

      setDemandDate(meta.demandDate || '');
      setInitiatorName(meta.initiatorName || '');
      setInitiatorContact(meta.initiatorContact || '');
      setManagerInCharge(meta.managerInCharge || '');
      setOfficerInCharge(meta.officerInCharge || '');
      setCompanyCode(s.companyCode || '');
      setSapCostCenter(s.sapCostCenter || '');
      setClusterNo(meta.clusterNo || '');
      setRepName(meta.repName || '');
      setRepDesignation(meta.repDesignation || '');
      setRepNic(meta.repNic || '');
      setRepContact(meta.repContact || '');
      setRepEmail(meta.repEmail || '');
      setCustomerType(meta.customerType || '');
      setCustomerData(meta.customerData || {});
      setLegalHistory(meta.legalHistory || []);

      if (s.approvals?.length) {
        s.approvals.forEach((a: any) => {
          if (a.role === 'BUM') setBum(a.approverName || '');
          if (a.role === 'FBP') setFbp(a.approverName || '');
        });
      }
      if (s.documents?.length) setDocFiles(s.documents);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [submissionId]);

  useEffect(() => { loadSubmission(); }, [loadSubmission]);

  // ── Approve ──
  const handleApprove = async () => {
    if (!submissionId) return;
    setIsActing(true); setApiError('');
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVED', role: 'SPECIAL_APPROVER', approverName: currentUserName, approverEmail: session?.user?.email, approverId: session?.user?.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Approval failed');
      setHasActed(true);
      setSuccessMessage('You have approved this request.');
      setShowApproveModal(false);
      setShowSuccess(true);
    } catch (err: any) {
      setApiError(err.message || 'Approval failed. Please try again.');
    } finally { setIsActing(false); }
  };

  // ── Reject ──
  const handleReject = async () => {
    if (!submissionId || !rejectReason.trim()) return;
    setIsActing(true); setApiError('');
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SENT_BACK', role: 'SPECIAL_APPROVER', approverName: currentUserName, approverEmail: session?.user?.email, approverId: session?.user?.id, comment: rejectReason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Rejection failed');
      setHasActed(true);
      setSuccessMessage('You have rejected this request.');
      setShowRejectModal(false);
      setShowSuccess(true);
    } catch (err: any) {
      setApiError(err.message || 'Rejection failed. Please try again.');
    } finally { setIsActing(false); }
  };

  const handlePostComment = () => {
    if (!commentInput.trim()) return;
    setComments(prev => [...prev, { id: Date.now(), author: currentUserName, text: commentInput.trim(), time: 'Just now' }]);
    setCommentInput('');
  };

  const statusToStep: Record<string, number> = {
    DRAFT: 0, PENDING_APPROVAL: 1, PENDING_LEGAL_GM: 2,
    PENDING_LEGAL_OFFICER: 3, PENDING_COURT_OFFICER: 3,
    PENDING_SPECIAL_APPROVER: 3, PENDING_LEGAL_GM_FINAL: 4,
    COMPLETED: 5, CANCELLED: 5, SENT_BACK: 1,
  };
  const currentStep = statusToStep[submissionStatus] ?? 1;
  const isPendingAction = submissionStatus === 'PENDING_SPECIAL_APPROVER';

  // ── Loading / error ──
    if (status === 'loading') return null;
  if (status === 'authenticated' && !['SPECIAL_APPROVER'].includes(session?.user?.role as string)) {
    router.replace('/');
    return null;
  }
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-[#1A438A] animate-spin" />
        <p className="text-slate-500 text-sm font-medium">Loading submission...</p>
      </div>
    </div>
  );

  if (loadError) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]">
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 max-w-sm w-full text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
        <p className="text-slate-600 text-sm mb-4">{loadError}</p>
        <button onClick={() => router.push(ROUTES.SPECIAL_APPROVER_HOME)} className="w-full py-2.5 rounded-xl font-bold text-white text-sm"
          style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>Return to Home</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* ── Sidebar ── */}
      <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen"
        style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
        <div className="relative mb-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">
            {firstName.charAt(0).toUpperCase()}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]" />
        </div>
        <div className="text-center">
          <p className="text-white text-[10px] font-semibold truncate w-12 text-center">{firstName}</p>
        </div>
        <div className="w-8 h-px bg-white/10" />
        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          <NotificationBell />
          <button onClick={() => router.push(ROUTES.SPECIAL_APPROVER_HOME)} title="Home"
            className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all">
            <Home className="w-[18px] h-[18px]" />
          </button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all">
            <Lightbulb className="w-[18px] h-[18px]" />
          </button>
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all">
            <Search className="w-[18px] h-[18px]" />
          </button>
        </nav>
        <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
          <button className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all">
            <Settings className="w-[18px] h-[18px]" />
          </button>
          <button onClick={() => setShowSignOut(true)}
            className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all">
            <User className="w-[18px] h-[18px]" />
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex gap-5 p-5 overflow-auto min-w-0">

        {/* ── Left: Form read-only ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Header */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">Instruction For Litigation</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono tracking-wide">16/FM/1641/07/03</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold px-3 py-1 rounded-full border backdrop-blur-sm bg-purple-500/20 text-purple-200 border-purple-400/30">
                  Special Approver View
                </span>
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">Form 3</div>
              </div>
            </div>
          </div>

          {/* API Error */}
          {apiError && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">{apiError}</p>
              <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Form Body */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Submission Details</span>
            </div>
            <div className="px-6 py-6 space-y-5">

              <ReadField label="Letter of Demand Sent Date" value={demandDate} />

              <SectionDivider>Initiator's Information</SectionDivider>
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Name" value={initiatorName} />
                <ReadField label="Contact No" value={initiatorContact} />
              </div>

              <SectionDivider>Department's Details of the Creditor / Initiator</SectionDivider>
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Manager in Charge" value={managerInCharge} />
                <ReadField label="Officer in Charge" value={officerInCharge} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <ReadField label="Company Code" value={companyCode} />
                <ReadField label="SAP Cost Center No" value={sapCostCenter} />
                <ReadField label="Cluster No" value={clusterNo} />
              </div>

              <SectionDivider>Representative Details (for Court Representation)</SectionDivider>
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Name" value={repName} />
                <ReadField label="Designation" value={repDesignation} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <ReadField label="NIC" value={repNic} />
                <ReadField label="Contact No" value={repContact} />
                <ReadField label="Email Address" value={repEmail} />
              </div>

              <SectionDivider>Customer's Personal and Business Information</SectionDivider>
              <ReadField label="Type of the Customer" value={customerType} />
              {customerType && <CustomerDisplay customerType={customerType} data={customerData} />}

              {legalHistory.length > 0 && (
                <>
                  <SectionDivider>Legal Actions History for Ongoing Cases</SectionDivider>
                  {legalHistory.map((h, idx) => (
                    <div key={h.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Case #{idx + 1}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <ReadField label="Case No" value={h.caseNo} />
                        <ReadField label="Court" value={h.court} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <ReadField label="Outstanding Amount" value={h.outstandingAmount} />
                        <ReadField label="Prosecution Information" value={h.prosecutionInfo} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <ReadField label="Status of the Case/s" value={h.statusOfCase} />
                        <ReadField label="Remarks" value={h.remarks} />
                      </div>
                    </div>
                  ))}
                </>
              )}
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

          {/* Required Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center px-4 py-3" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
            </div>
            <div className="p-3 space-y-1.5 min-h-[80px]">
              {docFiles.length === 0
                ? <div className="py-5 text-center">
                    <Paperclip className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                    <p className="text-[11px] text-slate-400">No documents attached</p>
                  </div>
                : docFiles.map((doc, i) => (
                  <div key={doc.id}
                    onClick={() => doc.fileUrl && window.open(doc.fileUrl, '_blank')}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all
                      ${doc.fileUrl ? 'bg-emerald-50 border-emerald-200 cursor-pointer hover:bg-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                    <span className="text-[11px] text-slate-600 flex-1 mr-2">
                      <span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{doc.label}
                    </span>
                    {doc.fileUrl
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      : <Paperclip className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                  </div>
                ))
              }
            </div>
          </div>

          {/* Approvals */}
          <PanelSection title="Approvals">
            <div className="p-4 space-y-3.5">
              {[{ label: 'BUM', value: bum }, { label: 'FBP', value: fbp }].map(({ label, value }) => (
                <div key={label}>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
                  <div className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600">
                    {value || <span className="text-slate-300 italic">—</span>}
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
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px] font-bold text-[#1A438A]">{c.author}</span>
                        <span className="text-[10px] text-slate-400">{c.time}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${commentInput ? 'border-[#1A438A] bg-white ring-2 ring-[#1A438A]/10' : 'border-slate-200 bg-slate-50/80'}`}>
                <input type="text" value={commentInput} onChange={e => setCommentInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                  placeholder="Post your comment here"
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />
                <button onClick={handlePostComment} disabled={!commentInput.trim()}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </PanelSection>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button onClick={() => router.push(ROUTES.SPECIAL_APPROVER_HOME)} disabled={isActing}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all disabled:opacity-50">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            {isPendingAction && (
              <>
                <button onClick={() => setShowRejectModal(true)} disabled={isActing || hasActed}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-70"
                  style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)' }}>
                  <ThumbsDown className="w-4 h-4" /> Reject
                </button>
                <button onClick={() => setShowApproveModal(true)} disabled={isActing || hasActed}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-70"
                  style={{ background: 'linear-gradient(135deg, #16a34a, #22c55e)' }}>
                  <ThumbsUp className="w-4 h-4" /> Approve
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Approve Modal ── */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowApproveModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
              <ThumbsUp className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-[#17293E] font-bold text-base mb-1">Approve this request?</h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">This will mark your special approval as granted and advance the workflow.</p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setShowApproveModal(false)} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={handleApprove} disabled={isActing || hasActed}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #16a34a, #22c55e)' }}>
                {isActing ? 'Approving...' : 'Approve'}
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
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <ThumbsDown className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-[#17293E] font-bold text-base">Reject this request?</h3>
                <p className="text-slate-500 text-xs mt-0.5">Provide a reason — this will be sent back to the initiator.</p>
              </div>
            </div>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection..." rows={3}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10 mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setShowRejectModal(false)} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={handleReject} disabled={isActing || hasActed || !rejectReason.trim()}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)' }}>
                {isActing ? 'Rejecting...' : 'Reject'}
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
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-[#17293E] text-xl font-bold mb-2">Done!</h2>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">{successMessage}</p>
            <button onClick={() => router.push(ROUTES.SPECIAL_APPROVER_HOME)}
              className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95 shadow-lg shadow-[#1A438A]/20"
              style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
              Return to Home
            </button>
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
              <button onClick={() => setShowSignOut(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => { setShowSignOut(false); router.push('/login'); }}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white active:scale-95"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SpecialApproverForm3Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <SpecialApproverForm3Content />
    </Suspense>
  );
}