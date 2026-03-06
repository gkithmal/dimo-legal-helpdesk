'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Home, Lightbulb, Search, Settings, User,
  ArrowLeft, CheckCircle2, FileText, Eye, Loader2,
} from 'lucide-react';
import NotificationBell from '@/components/shared/NotificationBell';

interface Submission {
  id: string; submissionNo: string; status: string;
  initiatorName?: string; companyCode?: string; sapCostCenter?: string;
  f9PropertyOwnerType?: string; f9PropertyOwnerName?: string;
  f9PremisesAssNo?: string; f9PropertyType?: string; f9ConsiderationRs?: string;
  f9PlanNo?: string; f9LotNo?: string; f9Facilities?: string;
  f9COCDate?: string; f9GMCApprovalNo?: string; f9GMCApprovalDate?: string;
  f9InitiatorContactNo?: string; f9Remarks?: string;
  f9NIC?: string; f9BusinessRegNo?: string; f9VATRegNo?: string; f9OwnerContactNo?: string;
  f9BoardResolutionNo?: string; f9BoardResolutionDate?: string;
  f9StampDutyOpinionNo?: string; f9StampDutyRs?: string;
  f9LegalFeeRs?: string; f9ReferenceNo?: string; f9DeedNo?: string;
  f9DeedDate?: string; f9LandRegistryRegNo?: string;
  f9DateHandoverFinance?: string; f9OfficialRemarks?: string;
  documents: { id: string; label: string; type: string; status: string; fileUrl?: string | null }[];
  comments?: { id: string; authorName: string; authorRole: string; text: string; createdAt: string }[];
}

const WORKFLOW_STEPS = [
  { label: 'Form\nSubmission' }, { label: 'Legal GM\nReview' }, { label: 'In\nProgress' }, { label: 'Handing\nOver' },
];

function fmtDate(d?: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function WorkflowStepper({ activeStep }: { activeStep: number }) {
  return (
    <div className="relative flex justify-between items-start">
      <div className="absolute top-[9px] left-[9px] right-[9px] h-px bg-slate-200" />
      <div className="absolute top-[9px] left-[9px] h-px bg-[#1A438A]"
        style={{ width: `${activeStep === 0 ? 0 : (activeStep / (WORKFLOW_STEPS.length - 1)) * 100}%` }} />
      {WORKFLOW_STEPS.map((step, i) => (
        <div key={i} className="relative flex flex-col items-center z-10" style={{ width: `${100 / WORKFLOW_STEPS.length}%` }}>
          <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shadow-sm
            ${i < activeStep ? 'bg-[#1A438A] border-[#1A438A]'
            : i === activeStep ? 'bg-[#1A438A] border-[#1A438A] ring-4 ring-[#1A438A]/15'
            : 'bg-white border-slate-300'}`}>
            {i < activeStep && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
            {i === activeStep && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
          <p className="text-[9px] text-center leading-tight whitespace-pre-line mt-1.5 text-slate-500 font-medium">{step.label}</p>
        </div>
      ))}
    </div>
  );
}

function ReadField({ label, value, span2 }: { label: string; value?: string; span2?: boolean }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</label>
      <div className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 min-h-[36px]">
        {value || <span className="text-slate-400 italic">—</span>}
      </div>
    </div>
  );
}

function AcknowledgeModal({ submissionNo, onConfirm, onClose }:
  { submissionNo: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center mb-5">
          <FileText className="w-10 h-10 text-blue-500" />
        </div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Acknowledge Document Receipt</h2>
        <p className="text-slate-500 text-sm mb-2 leading-relaxed">
          You are confirming receipt of all physical documents related to the purchase of premises at:
        </p>
        <p className="text-[#1A438A] font-bold text-sm font-mono mb-1">#{submissionNo.split('_').pop()}</p>
        <p className="text-xs text-slate-400 mb-6">
          This action will mark the workflow as fully completed.
        </p>
        <div className="flex gap-3 w-full">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl text-white text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            Acknowledge Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

function CompletedModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-2xl bg-emerald-100 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/20">
          <CheckCircle2 className="w-12 h-12 text-emerald-500" />
        </div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Workflow Completed</h2>
        <p className="text-slate-500 text-sm mb-1 leading-relaxed">
          The purchase of premises has been fully completed and all documents have been received.
        </p>
        <p className="text-xs text-slate-400 mb-6">The request is now closed.</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl text-white font-semibold text-sm"
          style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

function CEOInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('id');

  const [showSignOut, setShowSignOut] = useState(false);
  const [submission, setSubmission]   = useState<Submission | null>(null);
  const [loading, setLoading]         = useState(false);
  const [acting, setActing]           = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDone, setShowDone]       = useState(false);

  const userName = session?.user?.name as string;

  const load = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/submissions/${submissionId}`);
      const d = await r.json();
      if (d.success) setSubmission(d.data);
    } finally { setLoading(false); }
  }, [submissionId]);

  useEffect(() => { load(); }, [load]);

  const handleAcknowledge = async () => {
    if (!submission) return;
    setActing(true);
    setShowConfirm(false);
    try {
      await fetch(`/api/submissions/${submission.id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'CEO_F9', action: 'ACKNOWLEDGED', approverName: userName }),
      });
      setShowDone(true);
    } finally { setActing(false); }
  };

  const s = submission;
  const propTypes  = s?.f9PropertyType ? JSON.parse(s.f9PropertyType) : [];
  const facilities = s?.f9Facilities   ? JSON.parse(s.f9Facilities)   : [];
  const alreadyActed = s?.status === 'COMPLETED';

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEF3F8]">
      <Loader2 className="w-8 h-8 animate-spin text-[#1A438A]" />
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

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-6 py-6">
          <div className="flex gap-5">
            {/* Left: Form details */}
            <div className="flex-1 min-w-0">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
                  <button onClick={() => router.push('/home')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 mr-1">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="flex-1">
                    <h1 className="text-sm font-bold text-[#17293E]">Approval for Purchasing of a Premises</h1>
                    <p className="text-[10px] text-slate-400">
                      16/FM/1641/07/09 <span className="font-bold text-slate-600">Form 9</span>
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-semibold">CEO Acknowledgement</span>
                    </p>
                  </div>
                </div>
                <div className="p-5 space-y-5">
                  {s && (
                    <>
                      {/* Initiator */}
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white bg-[#1A438A] px-3 py-1.5 rounded-lg mb-3">Initiator's Information :</div>
                        <div className="grid grid-cols-2 gap-3">
                          <ReadField label="Name*" value={s.initiatorName} />
                          <div className="grid grid-cols-2 gap-2">
                            <ReadField label="Company Code*" value={s.companyCode} />
                            <ReadField label="SAP Cost Centre*" value={s.sapCostCenter} />
                          </div>
                          <ReadField label="Contact No*" value={s.f9InitiatorContactNo} />
                          <div className="grid grid-cols-2 gap-2">
                            <ReadField label="GMC Approval No*" value={s.f9GMCApprovalNo} />
                            <ReadField label="GMC App. Date*" value={fmtDate(s.f9GMCApprovalDate)} />
                          </div>
                        </div>
                      </div>
                      {/* Property Owner */}
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white bg-[#1A438A] px-3 py-1.5 rounded-lg mb-3">Details of the Property Owner</div>
                        <div className="grid grid-cols-2 gap-3">
                          <ReadField label="Property Owner Type*" value={s.f9PropertyOwnerType} />
                          <ReadField label="Name*" value={s.f9PropertyOwnerName} />
                          <ReadField label="NIC" value={s.f9NIC} />
                          <ReadField label="Business Registration Number" value={s.f9BusinessRegNo} />
                          <ReadField label="VAT Reg. No" value={s.f9VATRegNo} />
                          <ReadField label="Contact No*" value={s.f9OwnerContactNo} />
                        </div>
                      </div>
                      {/* Premises */}
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white bg-[#1A438A] px-3 py-1.5 rounded-lg mb-3">Details of the Premises</div>
                        <div className="grid grid-cols-2 gap-3">
                          <ReadField label="Premises bearing Ass. No*" value={s.f9PremisesAssNo} />
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Property Type*</label>
                            <div className="flex gap-5 items-center h-[36px]">
                              {['House','Building','Land'].map(t => (
                                <label key={t} className="flex items-center gap-1.5 text-sm">
                                  <input type="checkbox" checked={propTypes.includes(t)} readOnly className="w-4 h-4 rounded border-slate-300" /> {t}
                                </label>
                              ))}
                            </div>
                          </div>
                          <ReadField label="Consideration Rs.*" value={s.f9ConsiderationRs} />
                          <ReadField label="Plan No*" value={s.f9PlanNo} />
                          <ReadField label="Lot No*" value={s.f9LotNo} />
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Availability of Facilities*</label>
                            <div className="flex gap-5 items-center h-[36px]">
                              {['Electricity','Water','Access Road'].map(f => (
                                <label key={f} className="flex items-center gap-1.5 text-sm">
                                  <input type="checkbox" checked={facilities.includes(f)} readOnly className="w-4 h-4 rounded border-slate-300" /> {f}
                                </label>
                              ))}
                            </div>
                          </div>
                          <ReadField label="Date of the COC (For Buildings)" value={fmtDate(s.f9COCDate)} />
                          <ReadField label="Remarks" value={s.f9Remarks} span2 />
                        </div>
                      </div>

                      {/* Official Use Only — read-only summary */}
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white bg-[#4686B7] px-3 py-1.5 rounded-lg mb-3">
                          Official Use Only
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <ReadField label="Board Resolution No." value={s.f9BoardResolutionNo} />
                          <ReadField label="Board Resolution Date" value={fmtDate(s.f9BoardResolutionDate)} />
                          <ReadField label="Stamp Duty Opinion No." value={s.f9StampDutyOpinionNo} />
                          <ReadField label="Stamp Duty Rs." value={s.f9StampDutyRs} />
                          <ReadField label="Legal Fee Rs." value={s.f9LegalFeeRs} />
                          <ReadField label="Reference No." value={s.f9ReferenceNo} />
                          <ReadField label="Deed No." value={s.f9DeedNo} />
                          <ReadField label="Deed Date" value={fmtDate(s.f9DeedDate)} />
                          <ReadField label="Land Registry Reg. No/s" value={s.f9LandRegistryRegNo} span2 />
                          <ReadField label="Date Handover to Finance Dept" value={fmtDate(s.f9DateHandoverFinance)} />
                          <ReadField label="Remarks" value={s.f9OfficialRemarks} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Panel */}
            <div className="w-[280px] flex-shrink-0 space-y-4">
              {s && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-400">Submission No</span>
                    <span className="text-sm font-black text-[#17293E] font-mono">#{s.submissionNo.split('_').pop()}</span>
                  </div>
                  <WorkflowStepper activeStep={alreadyActed ? 4 : 3} />
                </div>
              )}

              {/* All documents */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3"
                  style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                  <span className="text-white text-sm font-semibold">Required Documents</span>
                  <button className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                    Instructions
                  </button>
                </div>
                <div className="p-3 space-y-1.5 min-h-[96px]">
                  {s?.documents.filter(d => d.type === 'required').map((doc, i) => (
                    <div key={doc.id}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all
                        ${doc.fileUrl ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex-1 mr-2 min-w-0">
                        <span className="text-[11px] text-slate-600 leading-tight block">
                          <span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{doc.label}
                        </span>
                        {doc.fileUrl && <span className="text-[10px] text-emerald-600 font-semibold">1 file attached</span>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {doc.fileUrl && (
                          <a href={doc.fileUrl} target="_blank" rel="noreferrer"
                            className="w-7 h-7 rounded-lg hover:bg-[#EEF3F8] flex items-center justify-center text-slate-400 hover:text-[#1A438A] transition-colors">
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {doc.fileUrl && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                      </div>
                    </div>
                  ))}
                </div>
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

              {/* Comments */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Comments</span>
                </div>
                <div className="p-3 space-y-2 max-h-28 overflow-y-auto">
                  {s?.comments?.map((c: any) => (
                    <div key={c.id} className="text-xs bg-slate-50 rounded-lg p-2">
                      <div className="flex justify-between mb-0.5">
                        <span className="font-semibold text-slate-700">{c.authorName}</span>
                        <span className="text-[10px] text-slate-400">{fmtDate(c.createdAt)}</span>
                      </div>
                      <p className="text-slate-600">{c.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Completion note */}
              {!alreadyActed && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                  <p className="font-semibold mb-1">Physical Document Handover</p>
                  <p>The Legal Officer has physically handed over all documents related to this purchase. Please acknowledge receipt to close this workflow.</p>
                </div>
              )}

              {alreadyActed && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-700 font-semibold text-center">
                  ✓ Documents acknowledged. Workflow completed.
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2">
                <button onClick={() => router.push('/home')}
                  className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 bg-white">
                  Back
                </button>
                {!alreadyActed && (
                  <button onClick={() => setShowConfirm(true)} disabled={acting}
                    className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                    {acting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Acknowledge Receipt of Documents'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showConfirm && s && (
        <AcknowledgeModal
          submissionNo={s.submissionNo}
          onConfirm={handleAcknowledge}
          onClose={() => setShowConfirm(false)} />
      )}
      {showDone && <CompletedModal onClose={() => router.push('/home')} />}
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

export default function Form9CEOPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#EEF3F8]"><Loader2 className="w-8 h-8 animate-spin text-[#1A438A]" /></div>}>
      <CEOInner />
    </Suspense>
  );
}