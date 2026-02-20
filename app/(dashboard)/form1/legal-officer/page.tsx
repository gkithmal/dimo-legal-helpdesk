'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import {
  Home, Lightbulb, Search, Settings, User,
  ArrowLeft, CheckCircle2, FileText, Clock, XCircle,
  RotateCcw, Send, Paperclip, Plus, ChevronDown, Eye,
  AlertCircle, Upload, X, Calendar, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type LOStage = 'PENDING_GM' | 'REASSIGNED' | 'ACTIVE' | 'POST_GM_APPROVAL';
type DocStatus = 'NONE' | 'OK' | 'ATTENTION' | 'RESUBMIT';

type RequiredDoc = { id: string; label: string; status: DocStatus; hasFile: boolean; fileUrl?: string | null; comment?: string };
type PreparedDoc = { id: string; name: string; type: 'initial' | 'final' };
type SpecialApprover = { id: string; department: string; email: string };
type CommentEntry = { id: number; author: string; role: string; avatar: string; text: string; time: string; side: 'left' | 'right' };

type ApproverRecord = { id: string; role: string; approverName: string; approverEmail: string; status: string };
type Party = { type: string; name: string };

type Submission = {
  id: string;
  submissionNo: string;
  status: string;
  loStage: string;
  companyCode: string;
  title: string;
  sapCostCenter: string;
  scopeOfAgreement: string;
  term: string;
  value: string;
  remarks?: string;
  initiatorComments?: string;
  assignedLegalOfficer?: string;
  parties: Party[];
  approvals: ApproverRecord[];
  documents: { id: string; label: string; type: string; status: string; fileUrl?: string | null }[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  'Corp Comm', 'HRD', 'Finance Department',
  'Group Internal Audit & Compliance', 'Facilities Department',
  'Supply Chain', 'IT Department',
];
const DEPT_APPROVERS: Record<string, string[]> = {
  'Corp Comm':                          ['nimal.perera@dimolanka.com'],
  'HRD':                                ['dilrukshi.kurukulasuriya@dimolanka.com'],
  'Finance Department':                 ['malini.jayasekera@dimolanka.com'],
  'Group Internal Audit & Compliance':  ['tharanga.bandara@dimolanka.com'],
  'Facilities Department':              ['pradeep.senanayake@dimolanka.com'],
  'Supply Chain':                       ['nuwan.rajapaksa@dimolanka.com'],
  'IT Department':                      ['ranjan.gunaw@dimolanka.com'],
};

const ROLE_LABEL: Record<string, string> = { BUM: 'BUM', FBP: 'FBP', CLUSTER_HEAD: 'Cluster Head' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapLoStage(dbStage: string): LOStage {
  if (dbStage === 'ACTIVE')           return 'ACTIVE';
  if (dbStage === 'POST_GM_APPROVAL') return 'POST_GM_APPROVAL';
  if (dbStage === 'REASSIGNED')       return 'REASSIGNED';
  return 'PENDING_GM';
}

function ReadField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      <div className={`w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 ${multiline ? 'whitespace-pre-wrap leading-relaxed' : ''}`}>
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

function DocStatusIcon({ status }: { status: DocStatus }) {
  if (status === 'OK')        return <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center"><CheckCircle2 className="w-2.5 h-2.5 text-white" /></span>;
  if (status === 'ATTENTION') return <span className="w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center"><AlertCircle className="w-2.5 h-2.5 text-white" /></span>;
  if (status === 'RESUBMIT')  return <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center"><XCircle className="w-2.5 h-2.5 text-white" /></span>;
  return null;
}

// ─── Attachment Preview Sub-Screen ───────────────────────────────────────────

function AttachmentPreviewPage({ doc, canAct, onSave, onBack }: {
  doc: RequiredDoc; canAct: boolean;
  onSave: (id: string, status: DocStatus, comment: string) => void;
  onBack: () => void;
}) {
  const [status, setStatus]   = useState<DocStatus>(doc.status);
  const [comment, setComment] = useState(doc.comment || '');

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');`}</style>
      <div className="flex-1 flex gap-5 p-5">
        {/* PDF Preview */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
            <button onClick={onBack} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
              <ArrowLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="text-sm font-bold text-[#17293E] flex-1 truncate">{doc.label}</span>
            {doc.status !== 'NONE' && <DocStatusIcon status={doc.status} />}
          </div>
          <div className="flex-1 overflow-hidden">
            {doc.fileUrl ? (
              <iframe src={doc.fileUrl} className="w-full h-full border-0" title={doc.label} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 bg-slate-50">
                <FileText className="w-16 h-16 text-slate-200" />
                <p className="text-sm font-medium text-slate-400">No file attached</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-[240px] flex-shrink-0 flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
              <span className="text-white font-bold text-sm">Attachments</span>
            </div>
            <div className="p-4">
              <p className="text-[11px] text-slate-500 italic text-center">Use the preview panel to view the file.</p>
            </div>
            {canAct && (
              <div className="px-4 pb-4">
                <div className="grid grid-cols-3 gap-2">
                  {(['OK', 'ATTENTION', 'RESUBMIT'] as DocStatus[]).map((s) => (
                    <button key={s} onClick={() => setStatus(s)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-xl border-2 transition-all
                        ${status === s
                          ? s === 'OK' ? 'bg-emerald-50 border-emerald-400'
                            : s === 'ATTENTION' ? 'bg-yellow-50 border-yellow-400'
                            : 'bg-red-50 border-red-400'
                          : 'bg-slate-50 border-slate-200'}`}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center
                        ${s === 'OK' ? 'bg-emerald-500' : s === 'ATTENTION' ? 'bg-yellow-400' : 'bg-red-500'}`}>
                        {s === 'OK'        && <CheckCircle2 className="w-4 h-4 text-white" />}
                        {s === 'ATTENTION' && <AlertCircle className="w-4 h-4 text-white" />}
                        {s === 'RESUBMIT'  && <XCircle className="w-4 h-4 text-white" />}
                      </span>
                      <span className={`text-[10px] font-bold ${s === 'OK' ? 'text-emerald-700' : s === 'ATTENTION' ? 'text-yellow-700' : 'text-red-700'}`}>
                        {s === 'OK' ? 'OK' : s === 'ATTENTION' ? 'Attention' : 'Resubmit'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
              <span className="text-white font-bold text-sm">Comments</span>
            </div>
            <div className="p-3">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                disabled={!canAct} placeholder="Post your comment here" rows={4}
                className="w-full text-xs text-slate-600 bg-transparent placeholder:text-slate-400 resize-none focus:outline-none" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={onBack}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-[#17293E] text-[#17293E] hover:bg-[#17293E] hover:text-white transition-all">
              Back
            </button>
            {canAct && (
              <button onClick={() => { onSave(doc.id, status, comment); onBack(); }}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function SuccessModal({ title, message, submissionNo, onClose }: {
  title: string; message: string; submissionNo?: string; onClose: () => void;
}) {
  const isSuccess = !title.toLowerCase().includes('cancel') && !title.toLowerCase().includes('reject');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-5 shadow-lg ${isSuccess ? 'bg-emerald-100 shadow-emerald-500/20' : 'bg-red-100 shadow-red-500/20'}`}>
          {isSuccess ? <CheckCircle2 className="w-10 h-10 text-emerald-500" /> : <XCircle className="w-10 h-10 text-red-500" />}
        </div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">{title}</h2>
        <p className="text-slate-500 text-sm mb-2 leading-relaxed">{message}</p>
        {submissionNo && <p className="text-[#1A438A] font-bold text-sm font-mono mb-6">Submission ID : #{submissionNo.split('_').pop()}</p>}
        <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>OK</button>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, confirmColor, requireComment = false, loading = false, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; confirmColor: string;
  requireComment?: boolean; loading?: boolean;
  onConfirm: (comment: string) => void; onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5 text-center">
          <h3 className="text-[#17293E] font-bold text-base mb-1">{title}</h3>
          <p className="text-slate-500 text-xs leading-relaxed">{message}</p>
          {requireComment && (
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
              placeholder="Please provide a reason..."
              className="mt-3 w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A] text-left" />
          )}
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} disabled={loading} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">Cancel</button>
          <button disabled={(requireComment && !comment.trim()) || loading} onClick={() => onConfirm(comment)}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            style={{ background: confirmColor }}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestMoreDocsModal({ onClose }: { onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState('');
  if (sent) return <SuccessModal title="Request Sent!" message="The initiator has been notified to upload additional documents." onClose={onClose} />;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
          <span className="text-white font-bold">Request More Documents</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
            placeholder="e.g. Please upload the latest Form 20..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A]" />
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
          <button disabled={!note.trim()} onClick={() => setSent(true)}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>Send Request</button>
        </div>
      </div>
    </div>
  );
}

function SpecialApprovalsModal({ existing, onSave, onClose }: {
  existing: SpecialApprover[]; onSave: (a: SpecialApprover[]) => void; onClose: () => void;
}) {
  const [approvers, setApprovers] = useState<SpecialApprover[]>(existing);
  const [showAdd, setShowAdd]     = useState(false);
  const [newDept, setNewDept]     = useState('');
  const [newEmail, setNewEmail]   = useState('');

  const toggle = (dept: string) => {
    if (approvers.find((a) => a.department === dept)) {
      setApprovers((prev) => prev.filter((a) => a.department !== dept));
    } else {
      setApprovers((prev) => [...prev, { id: Date.now().toString(), department: dept, email: DEPT_APPROVERS[dept]?.[0] || '' }]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
          <span className="text-white font-bold">Special Approvals</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
          {DEPARTMENTS.map((dept) => {
            const sel = approvers.find((a) => a.department === dept);
            return (
              <div key={dept} className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 border transition-all ${sel ? 'bg-[#EEF3F8] border-[#1A438A]/30' : 'bg-slate-50 border-slate-200'}`}>
                <input type="checkbox" checked={!!sel} onChange={() => toggle(dept)} className="w-4 h-4 accent-[#1A438A]" />
                <span className="text-sm font-medium text-slate-700 flex-1">{dept}</span>
                {sel && (
                  <select value={sel.email}
                    onChange={(e) => setApprovers((prev) => prev.map((a) => a.department === dept ? { ...a, email: e.target.value } : a))}
                    className="text-xs bg-white border border-[#1A438A]/30 rounded-lg px-2 py-1.5 text-[#1A438A] focus:outline-none appearance-none max-w-[180px]">
                    {(DEPT_APPROVERS[dept] || []).map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                )}
              </div>
            );
          })}
          {showAdd && (
            <div className="border border-[#1A438A]/20 rounded-xl p-3 bg-[#EEF3F8]/50 space-y-2">
              <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="Department name"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none" />
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="approver@dimolanka.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none" />
              <button onClick={() => { if (newDept && newEmail) { setApprovers((p) => [...p, { id: Date.now().toString(), department: newDept, email: newEmail }]); setNewDept(''); setNewEmail(''); setShowAdd(false); }}}
                className="w-full py-2 rounded-lg text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
                Add Approver
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={() => setShowAdd(true)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-[#1A438A] text-[#1A438A] hover:bg-[#EEF3F8] flex items-center justify-center gap-1.5">
            <Plus className="w-4 h-4" /> Add New Approver
          </button>
          <button onClick={() => { onSave(approvers); onClose(); }} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}


function AddDocumentModal({ onAdd, onClose }: { onAdd: (name: string, type: 'initial' | 'final') => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'initial' | 'final'>('initial');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
          <span className="text-white font-bold">Add Document</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Document Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Initial Draft"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#1A438A]" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Type</label>
            <div className="flex gap-2">
              {(['initial', 'final'] as const).map((t) => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold capitalize border-2 transition-all ${type === t ? 'border-[#1A438A] bg-[#EEF3F8] text-[#1A438A]' : 'border-slate-200 text-slate-500'}`}>
                  {t} Draft
                </button>
              ))}
            </div>
          </div>
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-[#1A438A]/40 transition-colors cursor-pointer">
            <Upload className="w-6 h-6 mx-auto mb-2 text-slate-300" />
            <p className="text-xs text-slate-400">Click to upload PDF</p>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600">Cancel</button>
          <button disabled={!name.trim()} onClick={() => { onAdd(name, type); onClose(); }}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>ADD</button>
        </div>
      </div>
    </div>
  );
}

function OfficialUseModal({ submissionNo, onClose, onComplete }: {
  submissionNo: string; onClose: () => void; onComplete: () => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({ dateOfExpiration: 'indefinite' });
  const [modal, setModal]   = useState<'saveConfirm' | 'jobConfirm' | 'saveSuccess' | 'jobSuccess' | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setFields((p) => ({ ...p, [k]: v }));

  if (modal === 'saveConfirm') return (
    <ConfirmModal title="Save without completing the job?" message="" confirmLabel="Yes"
      confirmColor="linear-gradient(135deg, #1A438A, #1e5aad)"
      onConfirm={() => setModal('saveSuccess')} onClose={() => setModal(null)} loading={loading} />
  );
  if (modal === 'jobConfirm') return (
    <ConfirmModal title="Complete this request?" message="Initiator will be notified. This action cannot be undone."
      confirmLabel="Yes, Complete" confirmColor="linear-gradient(135deg, #22c55e, #16a34a)"
      onConfirm={async () => { setLoading(true); await onComplete(); setLoading(false); setModal('jobSuccess'); }}
      onClose={() => setModal(null)} loading={loading} />
  );
  if (modal === 'saveSuccess') return (
    <SuccessModal title="Saved!" message="Your progress has been saved successfully." onClose={() => { setModal(null); onClose(); }} />
  );
  if (modal === 'jobSuccess') return (
    <SuccessModal title="Completed!" message="The contract review has been completed." submissionNo={submissionNo} onClose={() => { setModal(null); onClose(); }} />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="px-6 py-4 text-white font-bold text-sm" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
          Official Use Only (Legal Officer should enter)
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center gap-3 py-2 border-b border-slate-100">
            <input type="checkbox" id="lrc" checked={!!fields.legalReviewCompleted}
              onChange={(e) => set('legalReviewCompleted', e.target.checked ? 'true' : '')}
              className="w-4 h-4 accent-[#1A438A]" />
            <label htmlFor="lrc" className="text-sm font-medium text-slate-700">Legal review Completed</label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Registered Date */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Registered Date</label>
              <div className="relative">
                <input type="date" value={fields.registeredDate || ''} onChange={(e) => set('registeredDate', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-[#1A438A] pr-10" />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            {/* Legal dept ref */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Legal dept reference number</label>
              <input value={fields.legalRefNumber || ''} onChange={(e) => set('legalRefNumber', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-[#1A438A]" />
            </div>
            {/* Date of execution */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Date of execution</label>
              <div className="relative">
                <input type="date" value={fields.dateOfExecution || ''} onChange={(e) => set('dateOfExecution', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-[#1A438A] pr-10" />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            {/* Date of expiration */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Date of expiration</label>
              <div className="flex items-center gap-2 mb-2">
                <input type="radio" id="indefinite" name="expiry" checked={fields.dateOfExpiration === 'indefinite'} onChange={() => set('dateOfExpiration', 'indefinite')} className="accent-[#1A438A]" />
                <label htmlFor="indefinite" className="text-sm text-slate-600">Indefinite</label>
                <input type="radio" id="expiry-date" name="expiry" checked={fields.dateOfExpiration !== 'indefinite'} onChange={() => set('dateOfExpiration', '')} className="accent-[#1A438A] ml-2" />
              </div>
              {fields.dateOfExpiration !== 'indefinite' && (
                <div className="relative">
                  <input type="date" value={fields.dateOfExpiration || ''} onChange={(e) => set('dateOfExpiration', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-[#1A438A] pr-10" />
                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              )}
            </div>
            {/* Directors executed */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Directors executed</label>
              <div className="space-y-1.5">
                {['directorsExecuted1', 'directorsExecuted2'].map((k) => (
                  <div key={k} className="relative">
                    <select value={fields[k] || ''} onChange={(e) => set(k, e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none appearance-none pr-8 text-slate-600">
                      <option value="">Select...</option>
                      <option>Dilhan Perera</option>
                      <option>Ranjith Silva</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                ))}
              </div>
            </div>
            {/* Consideration */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Consideration</label>
              <div className="relative">
                <input type="date" value={fields.consideration || ''} onChange={(e) => set('consideration', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-[#1A438A] pr-10" />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            {/* Reviewed by */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Reviewed for registration by</label>
              <div className="relative">
                <select value={fields.reviewedBy || ''} onChange={(e) => set('reviewedBy', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none appearance-none pr-8 text-slate-600">
                  <option value="">Select...</option>
                  <option>Sandalie Gomes</option>
                  <option>Damayanthi Muhandiram</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            {/* Registered by */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Registered by</label>
              <div className="relative">
                <select value={fields.registeredBy || ''} onChange={(e) => set('registeredBy', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none appearance-none pr-8 text-slate-600">
                  <option value="">Select...</option>
                  <option>Sandalie Gomes</option>
                  <option>Tharanga Punchihewa</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            {/* Signed Supplier Code */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Signed Supplier Code of conduct</label>
              <input value={fields.signedSupplierCode || ''} onChange={(e) => set('signedSupplierCode', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-[#1A438A]" />
            </div>
            {/* Remarks */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Remarks</label>
              <input value={fields.remarks || ''} onChange={(e) => set('remarks', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-[#1A438A]" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-[#17293E] text-[#17293E] hover:bg-[#17293E] hover:text-white transition-all">Back</button>
          <button onClick={() => setModal('saveConfirm')} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>Save and Close</button>
          <button onClick={() => setModal('jobConfirm')} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all" style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>Job Completion</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function LegalOfficerPageContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('id');

  // ── Data state ──
  const [submission, setSubmission]   = useState<Submission | null>(null);
  const [isLoading, setIsLoading]     = useState(true);
  const [loadError, setLoadError]     = useState('');
  const [isActing, setIsActing]       = useState(false);
  const [apiError, setApiError]       = useState('');

  // ── Local doc state (overlays DB docs with LO's status markings) ──
  const [docs, setDocs]               = useState<RequiredDoc[]>([]);
  const [preparedDocs, setPreparedDocs] = useState<PreparedDoc[]>([]);
  const [specialApprovers, setSpecialApprovers] = useState<SpecialApprover[]>([]);
  const [showSpecial, setShowSpecial] = useState(false);
  const [comments, setComments]       = useState<CommentEntry[]>([]);
  const [commentInput, setCommentInput] = useState('');

  // ── UI state ──
  const [viewingDoc, setViewingDoc]   = useState<RequiredDoc | null>(null);
  const [showMoreDocs, setShowMoreDocs] = useState(false);
  const [showAddDoc, setShowAddDoc]   = useState(false);
  const [showOfficialUse, setShowOfficialUse] = useState(false);
  const [confirmModal, setConfirmModal] = useState<'cancel' | 'submit' | 'reassign' | 'special' | null>(null);
  const [specialEmail, setSpecialEmail] = useState('');
  const [specialName, setSpecialName] = useState('');
  const [successModal, setSuccessModal] = useState<'sent' | 'cancelled' | 'accepted' | null>(null);

  // ── Load submission ──
  const loadSubmission = useCallback(async () => {
    if (!submissionId) { setLoadError('No submission ID in URL.'); setIsLoading(false); return; }
    try {
      const res = await fetch(`/api/submissions/${submissionId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load');
      const s: Submission = data.data;
      setSubmission(s);

      // Map DB documents → local RequiredDoc shape
      const partyTypes = s.parties.map((p: Party) => p.type);
      const filteredDocs = s.documents.filter((d) =>
        partyTypes.includes(d.type) || (d.type === 'Common' && partyTypes.some((t: string) => t !== 'Individual'))
      );
      setDocs(filteredDocs.map((d) => ({
        id: d.id,
        label: d.label,
        status: 'NONE' as DocStatus,
        hasFile: !!d.fileUrl,
        fileUrl: d.fileUrl ?? null,
      })));

      // Seed initiator comment if present
      if (s.initiatorComments) {
        setComments([{
          id: 1, author: 'Initiator', role: 'Initiator', avatar: 'I',
          text: s.initiatorComments, time: '', side: 'left',
        }]);
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [submissionId]);

  useEffect(() => { loadSubmission(); }, [loadSubmission]);

  // ── API call ──
  const callApproveAPI = async (action: 'SUBMIT_TO_LEGAL_GM' | 'COMPLETED' | 'CANCELLED', comment?: string) => {
    if (!submissionId) return;
    setIsActing(true);
    setApiError('');
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'LEGAL_OFFICER',
          action,
          comment: comment || null,
          approverName: session?.user?.name || submission?.assignedLegalOfficer || '',
          approverEmail: session?.user?.email || '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Action failed');
      setSubmission(data.data);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Action failed. Please try again.');
      throw err;
    } finally {
      setIsActing(false);
    }
  };

  // ── Handlers ──
  const handleSubmitToGM = async (comment: string) => {
    try { await callApproveAPI('SUBMIT_TO_LEGAL_GM', comment); setConfirmModal(null); setSuccessModal('sent'); }
    catch { /* apiError set inside */ }
  };

  const handleCancel = async (comment: string) => {
    try { await callApproveAPI('CANCELLED', comment); setConfirmModal(null); setSuccessModal('cancelled'); }
    catch { /* apiError set inside */ }
  };

  const handleSendToSpecialApprover = async (email: string, name: string) => {
    if (!submissionId) return;
    setIsActing(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'LEGAL_OFFICER', action: 'ASSIGN_SPECIAL_APPROVER', specialApproverEmail: email, specialApproverName: name, approverName: session?.user?.name || '', approverEmail: session?.user?.email || '' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
      setSubmission(data.data);
      setConfirmModal(null);
      setSuccessModal('sent');
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setIsActing(false);
    }
  };

  const handleComplete = async () => {
    await callApproveAPI('COMPLETED');
  };

  const updateDocStatus = (id: string, status: DocStatus, comment: string) => {
    setDocs((prev) => prev.map((d) => d.id === id ? { ...d, status, comment } : d));
  };

  const postCommentToAPI = async (text: string) => {
    if (!submissionId) return;
    fetch(`/api/submissions/${submissionId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorName: submission?.assignedLegalOfficer || "Legal Officer", authorRole: "LEGAL_OFFICER", text }) });
  };

  const postComment = () => {
    if (!commentInput.trim()) return;
    setComments((prev) => [...prev, { id: Date.now(), author: 'Me', role: submission?.assignedLegalOfficer || 'Legal Officer', avatar: 'S', text: commentInput.trim(), time: 'Just now', side: 'right' }]);
    setCommentInput('');
  };

  // ── Derived ──
  const loStage: LOStage = mapLoStage(submission?.loStage || '');
  const canAct = loStage === 'ACTIVE' || loStage === 'POST_GM_APPROVAL';

  const stageLabel = {
    PENDING_GM:       'Awaiting Legal GM Approval',
    REASSIGNED:       'Reassignment Pending Acknowledgement',
    ACTIVE:           'In Progress',
    POST_GM_APPROVAL: 'Legal GM Approved — Finalization',
  }[loStage];

  const stageColor = {
    PENDING_GM:       'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
    REASSIGNED:       'bg-orange-500/20 text-orange-300 border-orange-500/40',
    ACTIVE:           'bg-blue-500/20 text-blue-300 border-blue-500/40',
    POST_GM_APPROVAL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  }[loStage];

  // ── If viewing attachment sub-screen ──
  if (viewingDoc) return (
    <AttachmentPreviewPage doc={viewingDoc} canAct={canAct}
      onSave={updateDocStatus} onBack={() => setViewingDoc(null)} />
  );

  // ── Loading / Error ──
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-[#1A438A] animate-spin" />
        <p className="text-slate-500 text-sm font-medium">Loading submission...</p>
      </div>
    </div>
  );

  if (loadError || !submission) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]">
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-[#17293E] font-bold text-base mb-2">Could not load submission</h3>
        <p className="text-slate-500 text-sm mb-4">{loadError}</p>
        <button onClick={() => router.push(ROUTES.HOME)}
          className="w-full py-2.5 rounded-xl font-bold text-white text-sm"
          style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Return to Home</button>
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
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">
            {(session?.user?.name || 'S').charAt(0)}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]" />
        </div>
        <div className="text-center">
          <p className="text-white text-[10px] font-semibold">{(session?.user?.name || 'Legal Officer').split(' ')[0]}</p>
          <p className="text-white/40 text-[9px]">{(session?.user?.name || '').split(' ')[1] || ''}</p>
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
                  <h1 className="text-white font-bold text-base">Contract Review Form</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono">16/FM/1641/07/01</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border ${stageColor}`}>{stageLabel}</span>
                <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl">Form 1</div>
              </div>
            </div>
          </div>

          {/* API Error Banner */}
          {apiError && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">{apiError}</p>
              <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Stage banners */}
          {loStage === 'PENDING_GM' && (
            <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-2xl px-5 py-3">
              <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0" />
              <p className="text-sm font-medium text-yellow-700">
                You can review documents and add comments, but cannot proceed until the <strong>Legal GM approves</strong> the request.
              </p>
            </div>
          )}
          {loStage === 'REASSIGNED' && (
            <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3">
              <RotateCcw className="w-5 h-5 text-orange-500 flex-shrink-0" />
              <p className="text-sm font-medium text-orange-700">
                The Legal GM has <strong>reassigned this request</strong>. Please acknowledge and hand over all physical documents to the newly assigned officer.
              </p>
            </div>
          )}

          {/* Form Body */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Submission Details</span>
            </div>
            <div className="px-6 py-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Company Code" value={submission.companyCode} />
                <ReadField label="Title" value={submission.title} />
              </div>
              <SectionDivider>Parties to the Agreement</SectionDivider>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-2 gap-0 bg-slate-50 border-b border-slate-200">
                  <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Type</div>
                  <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-l border-slate-200">Name of the Party</div>
                </div>
                {submission.parties.map((p, i) => (
                  <div key={i} className={`grid grid-cols-2 ${i < submission.parties.length - 1 ? 'border-b border-slate-100' : ''}`}>
                    <div className="px-3.5 py-2.5 text-sm text-slate-700">{p.type}</div>
                    <div className="px-3.5 py-2.5 text-sm text-slate-700 border-l border-slate-100 font-medium">{p.name}</div>
                  </div>
                ))}
              </div>
              <SectionDivider>Agreement Details</SectionDivider>
              <ReadField label="SAP Cost Center" value={submission.sapCostCenter} />
              <ReadField label="Scope of Agreement" value={submission.scopeOfAgreement} multiline />
              <ReadField label="Term" value={submission.term} multiline />
              <div className="grid grid-cols-2 gap-4">
                <ReadField label="Value (LKR)" value={submission.value} />
                <ReadField label="Remarks" value={submission.remarks || ''} />
              </div>
              <ReadField label="Initiator Comments" value={submission.initiatorComments || ''} />
            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-[296px] flex-shrink-0 flex flex-col gap-4">

          {/* Submission No */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-4 py-3 flex items-center justify-between">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Submission No.</p>
            <p className="text-[#1A438A] font-bold text-sm font-mono">{submission.submissionNo}</p>
          </div>

          {/* Required Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
              <button onClick={() => canAct && setShowMoreDocs(true)} disabled={!canAct}
                className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                Request More Docs
              </button>
            </div>
            <div className="p-3 space-y-1.5">
              {docs.map((doc, i) => (
                <button key={doc.id} onClick={() => setViewingDoc(doc)}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 border transition-all text-left hover:shadow-sm
                    ${doc.status === 'ATTENTION' ? 'bg-yellow-50 border-yellow-300'
                    : doc.status === 'RESUBMIT'  ? 'bg-red-50 border-red-200'
                    : doc.status === 'OK'         ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-slate-50 border-slate-100 hover:border-[#1A438A]/20'}`}>
                  <span className={`text-[11px] flex-1 mr-2 leading-tight
                    ${doc.status === 'ATTENTION' ? 'text-yellow-800 font-semibold'
                    : doc.status === 'RESUBMIT' ? 'text-red-700 font-semibold' : 'text-slate-600'}`}>
                    <span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{doc.label}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {doc.hasFile && <FileText className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-blue-500" onClick={() => setViewingDoc(docs.find(d => d.id === doc.id) ?? null)} />}
                    {doc.status !== 'NONE' ? <DocStatusIcon status={doc.status} /> : <Paperclip className="w-3.5 h-3.5 text-slate-300" />}
                  </div>
                </button>
              ))}
            </div>

            {/* Documents Prepared by Legal Dept */}
            <div className="border-t border-slate-100">
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                <span className="text-white text-xs font-semibold">Documents Prepared by Legal Dept.</span>
                {canAct && (
                  <button onClick={() => setShowAddDoc(true)}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white border border-white/30 hover:bg-white/15 transition-all">
                    ADD
                  </button>
                )}
              </div>
              <div className="p-3 space-y-1.5">
                {preparedDocs.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic px-1">No documents added yet</p>
                ) : (
                  preparedDocs.map((pd) => (
                    <div key={pd.id} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-[#EEF3F8] border border-[#1A438A]/20">
                      <FileText className="w-3.5 h-3.5 text-[#1A438A]" />
                      <span className="text-[11px] font-semibold text-[#1A438A] flex-1 truncate">{pd.name}</span>
                      <span className="text-[9px] uppercase font-bold text-[#4686B7] bg-[#1A438A]/10 px-1.5 py-0.5 rounded">{pd.type}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Approvals */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Approvals</span>
              </div>
              {canAct && (
                <button onClick={() => setShowSpecial(true)}
                  className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                  Special Approvals {specialApprovers.length > 0 && `(${specialApprovers.length})`}
                </button>
              )}
            </div>
            <div className="px-4 py-3 divide-y divide-slate-100">
              {submission.approvals.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-slate-600 w-20 flex-shrink-0">{ROLE_LABEL[a.role] ?? a.role}</span>
                    <span className="text-[11px] text-slate-500 truncate">{a.approverName || a.approverEmail}</span>
                  </div>
                  {a.status === 'APPROVED' && <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 ml-2"><CheckCircle2 className="w-3 h-3 text-white" /></span>}
                  {a.status === 'PENDING'  && <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0 ml-2"><Clock className="w-3 h-3 text-white" /></span>}
                </div>
              ))}
              {specialApprovers.length > 0 && (
                <div className="pt-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#AC9C2F] mb-2">Special Approvers</p>
                  {specialApprovers.map((sa) => (
                    <div key={sa.id} className="flex items-center justify-between py-1.5">
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="text-[11px] font-bold text-slate-600">{sa.department}</p>
                        <p className="text-[11px] text-slate-400 truncate">{sa.email}</p>
                      </div>
                      <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0"><Clock className="w-3 h-3 text-white" /></span>
                    </div>
                  ))}
                </div>
              )}
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
                <div className="mb-3 space-y-2 max-h-40 overflow-y-auto">
                  {comments.map((c) => (
                    <div key={c.id} className={`flex gap-2 ${c.side === 'right' ? 'flex-row-reverse' : ''}`}>
                      <div className="w-7 h-7 rounded-full bg-[#1A438A]/15 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-[#1A438A]">{c.avatar}</div>
                      <div className={`flex-1 min-w-0 ${c.side === 'right' ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div className={`rounded-xl px-3 py-2 max-w-[90%] ${c.side === 'right' ? 'bg-[#1A438A] text-white' : 'bg-slate-100 text-slate-700'}`}>
                          <p className="text-[11px] leading-relaxed">{c.text}</p>
                        </div>
                        <span className="text-[9px] text-slate-400 mt-0.5 px-1">{c.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${commentInput ? 'border-[#1A438A] bg-white ring-2 ring-[#1A438A]/10' : 'border-slate-200 bg-slate-50/80'}`}>
                <input type="text" value={commentInput} onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && postComment()}
                  placeholder="Post your comment here"
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />
                <button onClick={postComment} disabled={!commentInput.trim()}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Action Buttons ── */}
          <div className="flex flex-col gap-2">

            {loStage === 'PENDING_GM' && (
              <div className="flex gap-2">
                <button onClick={() => router.push(ROUTES.HOME)}
                  className="flex items-center gap-1.5 py-3 px-4 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button disabled className="flex-1 py-3 rounded-xl font-bold text-sm bg-slate-200 text-slate-400 cursor-not-allowed">Cancel</button>
                <button disabled className="flex-1 py-3 rounded-xl font-bold text-sm bg-slate-200 text-slate-400 cursor-not-allowed">Complete</button>
              </div>
            )}

            {loStage === 'REASSIGNED' && (
              <div className="flex gap-2">
                <button onClick={() => router.push(ROUTES.HOME)}
                  className="flex items-center gap-1.5 py-3 px-4 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={() => setConfirmModal('reassign')} disabled={isActing}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70"
                  style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                  Accept Reassign
                </button>
              </div>
            )}

           {loStage === 'ACTIVE' && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button onClick={() => router.push(ROUTES.HOME)} disabled={isActing}
                    className="flex-1 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button onClick={() => setConfirmModal('cancel')} disabled={isActing}
                    className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70"
                    style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                    Cancel
                  </button>
                </div>
                <button onClick={() => setConfirmModal('submit')} disabled={isActing}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-1"
                    style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                    {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit to GM'}
                  </button>
              </div>
            )}

            {loStage === 'POST_GM_APPROVAL' && (
              <>
                <div className="flex gap-2">
                  <button onClick={() => router.push(ROUTES.HOME)} disabled={isActing}
                    className="flex-1 py-3 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all disabled:opacity-50">
                    Back
                  </button>
                  <button onClick={() => setShowOfficialUse(true)} disabled={isActing}
                    className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 shadow-lg shadow-emerald-500/20 disabled:opacity-70"
                    style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                    Next
                  </button>
                </div>
                <button onClick={() => setShowMoreDocs(true)} disabled={isActing}
                  className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70"
                  style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
                  Request Clarifications
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showMoreDocs && <RequestMoreDocsModal onClose={() => setShowMoreDocs(false)} />}
      {showSpecial  && <SpecialApprovalsModal existing={specialApprovers} onSave={setSpecialApprovers} onClose={() => setShowSpecial(false)} />}
      {showAddDoc   && <AddDocumentModal onAdd={(name, type) => setPreparedDocs((p) => [...p, { id: Date.now().toString(), name, type }])} onClose={() => setShowAddDoc(false)} />}
      {showOfficialUse && <OfficialUseModal submissionNo={submission.submissionNo} onClose={() => setShowOfficialUse(false)} onComplete={handleComplete} />}

      {confirmModal === 'cancel' && (
        <ConfirmModal title="Cancel this request?" message="The request will be cancelled and the initiator will be notified."
          confirmLabel="Yes, Cancel" confirmColor="linear-gradient(135deg, #ef4444, #dc2626)" requireComment loading={isActing}
          onConfirm={handleCancel} onClose={() => setConfirmModal(null)} />
      )}
      {confirmModal === 'submit' && (
        <ConfirmModal title="Submit to Legal GM?" message="The request will be sent to Legal GM for final review and approval."
          confirmLabel="Yes, Submit" confirmColor="linear-gradient(135deg, #22c55e, #16a34a)" loading={isActing}
          onConfirm={handleSubmitToGM} onClose={() => setConfirmModal(null)} />
      )}
      {confirmModal === 'special' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
              <span className="text-white font-bold">Send to Special Approver</span>
              <button onClick={() => setConfirmModal(null)} className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Select Approver</label>
              {[{ name: 'Nimal Perera', email: 'special.approver@testdimo.com' }].map((u) => (
                <div key={u.email}
                  onClick={() => { setSpecialName(u.name); setSpecialEmail(u.email); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${specialEmail === u.email ? 'border-[#1A438A] bg-[#EEF3F8]' : 'border-slate-200 hover:border-[#1A438A]/40'}`}>
                  <div className="w-9 h-9 rounded-full bg-[#1A438A] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {u.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#17293E]">{u.name}</p>
                    <p className="text-[11px] text-slate-400">{u.email}</p>
                  </div>
                  {specialEmail === u.email && <CheckCircle2 className="w-5 h-5 text-[#1A438A] ml-auto" />}
                </div>
              ))}
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button onClick={() => setConfirmModal(null)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600">Cancel</button>
              <button
                disabled={!specialEmail.trim() || isActing}
                onClick={() => handleSendToSpecialApprover(specialEmail, specialName)}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmModal === 'reassign' && (
        <ConfirmModal title="Accept Reassignment?" message="By accepting, you confirm that you will hand over all physical documents to the newly assigned Legal Officer."
          confirmLabel="Accept" confirmColor="linear-gradient(135deg, #AC9C2F, #c9b535)" loading={isActing}
          onConfirm={() => { setConfirmModal(null); setSuccessModal('accepted'); }} onClose={() => setConfirmModal(null)} />
      )}

      {successModal === 'sent'      && <SuccessModal title="Successfully sent!" message="Form has been sent for Legal GM's Approval." submissionNo={submission.submissionNo} onClose={() => { setSuccessModal(null); router.push(ROUTES.HOME); }} />}
      {successModal === 'cancelled' && <SuccessModal title="Cancelled!" message="The request has been cancelled." submissionNo={submission.submissionNo} onClose={() => { setSuccessModal(null); router.push(ROUTES.HOME); }} />}
      {successModal === 'accepted'  && <SuccessModal title="Accepted!" message="Please make sure all the documents have been handed over to the assigned Legal Officer." onClose={() => { setSuccessModal(null); router.push(ROUTES.HOME); }} />}
    </div>
  );
}
export default function LegalOfficerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <LegalOfficerPageContent />
    </Suspense>
  );
}
