'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NotificationBell from '@/components/shared/NotificationBell';
import { ROUTES } from '@/lib/routes';
import {
  X, Home, Lightbulb, Search, Settings, User,
  ArrowLeft, CheckCircle2, FileText, Clock, XCircle,
  RotateCcw, ChevronDown, Send, Eye, Paperclip,
  AlertCircle, Loader2, Plus,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'SENT_BACK' | 'CANCELLED';
type LegalGMStage = 'INITIAL_REVIEW' | 'FINAL_APPROVAL';

type SpecialApprover = { id: string; department: string; email: string };
type LogEntry = { id: number; actor: string; role: string; action: string; comment?: string; timestamp: string };
type CommentEntry = { id: number; author: string; role: string; text: string; time: string };

type Party = { type: string; name: string };
type ApproverRecord = { id: string; role: string; label: string; approverName: string; approverEmail: string; status: ApprovalStatus; comment?: string | null; actionDate?: string | null };

type Submission = {
  id: string;
  submissionNo: string;
  status: string;
  legalGmStage: string;
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

const LEGAL_OFFICERS = [
  { name: 'Sandalie Gomes',      email: 'sandalie.gomes@dimolanka.com' },
  { name: 'Ashan Fernando',      email: 'ashan.fernando@dimolanka.com' },
  { name: 'Priya Jayasuriya',    email: 'priya.jayasuriya@dimolanka.com' },
  { name: 'Dimuthu Bandara',     email: 'dimuthu.bandara@dimolanka.com' },
  { name: 'Sachini Perera',      email: 'sachini.perera@dimolanka.com' },
  { name: 'Nuwan Silva',         email: 'nuwan.silva@dimolanka.com' },
];

const DEPARTMENTS = [
  'Corp Comm', 'HRD', 'Finance Department',
  'Group Internal Audit & Compliance', 'Facilities Department',
  'Supply Chain', 'IT Department',
];

const DEPT_APPROVERS: Record<string, string[]> = {
  'Corp Comm':                         ['nimal.perera@dimolanka.com', 'sumudu.silva@dimolanka.com'],
  'HRD':                               ['dilrukshi.kurukulasuriya@dimolanka.com', 'kasun.weerasinghe@dimolanka.com'],
  'Finance Department':                ['malini.jayasekera@dimolanka.com', 'rohan.dissanayake@dimolanka.com'],
  'Group Internal Audit & Compliance': ['tharanga.bandara@dimolanka.com', 'ishara.rathnayake@dimolanka.com'],
  'Facilities Department':             ['pradeep.senanayake@dimolanka.com', 'amali.wijesinghe@dimolanka.com'],
  'Supply Chain':                      ['nuwan.rajapaksa@dimolanka.com', 'chaminda.perera@dimolanka.com'],
  'IT Department':                     ['ranjan.gunaw@dimolanka.com', 'dinesh.lakmal@dimolanka.com'],
};

const ROLE_LABEL: Record<string, string> = { BUM: 'BUM', FBP: 'FBP', CLUSTER_HEAD: 'Cluster Head' };

const WORKFLOW_STEPS_INITIAL = [
  { label: 'Form\nSubmission' }, { label: 'Approvals' }, { label: 'Legal GM\nReview' },
  { label: 'In\nProgress' },    { label: 'Legal GM\nApproval' }, { label: 'Ready\nto Collect' },
];
const WORKFLOW_STEPS_FINAL = [
  { label: 'Form\nSubmission' }, { label: 'BUM\nApproved' }, { label: 'FBP\nApproved' },
  { label: 'Other\napprovals' }, { label: 'Legal GM\nApproval' }, { label: 'In\nProgress' }, { label: 'Ready\nto Collect' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

function PanelSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ApproverRow({ label, name, status }: { label: string; name: string; status: ApprovalStatus }) {
  return (
    <div className="flex items-center justify-between py-2 px-1">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-[11px] font-bold text-slate-600 w-20 flex-shrink-0">{label}</span>
        <span className="text-[11px] text-slate-500 truncate">{name || '—'}</span>
      </div>
      {status === 'APPROVED'  && <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 ml-2"><CheckCircle2 className="w-3 h-3 text-white" /></span>}
      {status === 'CANCELLED' && <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 ml-2"><XCircle className="w-3 h-3 text-white" /></span>}
      {status === 'SENT_BACK' && <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0 ml-2"><RotateCcw className="w-3 h-3 text-white" /></span>}
      {status === 'PENDING'   && <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0 ml-2"><Clock className="w-3 h-3 text-white" /></span>}
    </div>
  );
}

function WorkflowStepper({ steps, activeStep }: { steps: { label: string }[]; activeStep: number }) {
  return (
    <div className="relative flex justify-between items-start">
      <div className="absolute top-[9px] left-[9px] right-[9px] h-px bg-slate-200" />
      <div className="absolute top-[9px] left-[9px] h-px bg-[#1A438A] transition-all"
        style={{ width: `${activeStep === 0 ? 0 : (activeStep / (steps.length - 1)) * 100}%` }} />
      {steps.map((step, i) => (
        <div key={i} className="relative flex flex-col items-center z-10" style={{ width: `${100 / steps.length}%` }}>
          <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all shadow-sm
            ${i < activeStep  ? 'bg-[#1A438A] border-[#1A438A]'
            : i === activeStep ? 'bg-[#1A438A] border-[#1A438A] ring-4 ring-[#1A438A]/15'
            : 'bg-white border-slate-300'}`}>
            {i < activeStep   && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
            {i === activeStep && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
          <p className="text-[9px] text-center leading-tight whitespace-pre-line mt-1.5 text-slate-500 font-medium px-0.5">{step.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ViewLogModal({ log, onClose }: { log: LogEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <span className="text-white font-bold text-base">View Log</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {log.map((entry, i) => (
            <div key={entry.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-[#EEF3F8] border-2 border-[#1A438A]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-[#1A438A]">{i + 1}</span>
                </div>
                {i < log.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-bold text-[#17293E]">{entry.actor}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{entry.timestamp}</span>
                </div>
                <span className="text-[11px] text-[#4686B7] font-semibold">{entry.role}</span>
                <p className="text-sm text-slate-600 mt-0.5">{entry.action}</p>
                {entry.comment && <p className="text-xs text-slate-500 mt-1 italic bg-slate-50 rounded-lg px-2 py-1">&quot;{entry.comment}&quot;</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReassignModal({ currentOfficer, onSave, onClose }: {
  currentOfficer: string; onSave: (name: string, email: string) => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [step, setStep] = useState<'select' | 'success'>('select');
  const officer = LEGAL_OFFICERS.find((o) => o.name === selected);

  if (step === 'success') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center mb-5 shadow-lg shadow-blue-500/20">
          <CheckCircle2 className="w-10 h-10 text-blue-500" />
        </div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Job has been Reassigned!</h2>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
          The request has been reassigned to <span className="font-bold text-[#1A438A]">{selected}</span>.
        </p>
        <button onClick={() => { onSave(officer!.name, officer!.email); onClose(); }}
          className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>OK</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <span className="text-white font-bold">Select Legal Officer</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Select Legal Officer</label>
            <div className="relative">
              <select value={selected} onChange={(e) => setSelected(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white text-slate-700 focus:outline-none focus:border-[#1A438A] appearance-none pr-8">
                <option value="">Choose an officer...</option>
                {LEGAL_OFFICERS.filter((o) => o.name !== currentOfficer).map((o) => (
                  <option key={o.email} value={o.name}>{o.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {selected && (
            <div className="bg-[#EEF3F8] rounded-lg px-3.5 py-2.5">
              <p className="text-[11px] text-slate-500">Email</p>
              <p className="text-sm font-semibold text-[#1A438A]">{LEGAL_OFFICERS.find((o) => o.name === selected)?.email}</p>
            </div>
          )}
          <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
            ⚠ The previously assigned officer will be notified and must hand over physical documents before the new officer can proceed.
          </p>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
          <button disabled={!selected} onClick={() => setStep('success')}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function RequestMoreDocsModal({ onClose }: { onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState('');
  if (sent) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-emerald-100 flex items-center justify-center mb-5"><CheckCircle2 className="w-10 h-10 text-emerald-500" /></div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">Request Sent!</h2>
        <p className="text-slate-500 text-sm mb-6">The initiator has been notified to upload additional documents.</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>OK</button>
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <span className="text-white font-bold">Request More Documents</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">Specify which documents are needed from the initiator.</p>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Note to Initiator <span className="text-red-400">*</span></label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
              placeholder="e.g. Please upload the latest Form 20 and Certificate of Conformity..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10" />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
          <button disabled={!note.trim()} onClick={() => setSent(true)}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>Send Request</button>
        </div>
      </div>
    </div>
  );
}

function SpecialApprovalsModal({ existing, onSave, onClose }: {
  existing: SpecialApprover[]; onSave: (approvers: SpecialApprover[]) => void; onClose: () => void;
}) {
  const [approvers, setApprovers] = useState<SpecialApprover[]>(existing);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDept, setNewDept] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const toggle = (dept: string, email: string) => {
    const exists = approvers.find((a) => a.department === dept);
    if (exists) setApprovers((prev) => prev.filter((a) => a.department !== dept));
    else setApprovers((prev) => [...prev, { id: Date.now().toString(), department: dept, email }]);
  };

  const handleAddNew = () => {
    if (!newDept || !newEmail) return;
    setApprovers((prev) => [...prev, { id: Date.now().toString(), department: newDept, email: newEmail }]);
    setNewDept(''); setNewEmail(''); setShowAddForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <span className="text-white font-bold">Special Approvals</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">
          <div className="space-y-2 mb-4">
            {DEPARTMENTS.map((dept) => {
              const selected = approvers.find((a) => a.department === dept);
              const emails = DEPT_APPROVERS[dept] || [];
              return (
                <div key={dept} className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 border transition-all
                  ${selected ? 'bg-[#EEF3F8] border-[#1A438A]/30' : 'bg-slate-50 border-slate-200'}`}>
                  <input type="checkbox" checked={!!selected}
                    onChange={() => toggle(dept, selected?.email || emails[0] || '')}
                    className="w-4 h-4 accent-[#1A438A] flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700 flex-1">{dept}</span>
                  {selected && (
                    <div className="relative">
                      <select value={selected.email}
                        onChange={(e) => setApprovers((prev) => prev.map((a) => a.department === dept ? { ...a, email: e.target.value } : a))}
                        className="text-xs bg-white border border-[#1A438A]/30 rounded-lg px-2 py-1.5 text-[#1A438A] font-medium focus:outline-none appearance-none pr-6 max-w-[200px]">
                        {emails.map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#1A438A] pointer-events-none" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {showAddForm && (
            <div className="border border-[#1A438A]/20 rounded-xl p-4 mb-4 bg-[#EEF3F8]/50 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#1A438A]">Add New Approver</p>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Department</label>
                <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="Department name..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#1A438A]" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Approver Email</label>
                <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="approver@dimolanka.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#1A438A]" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAddForm(false)} className="flex-1 py-2 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={handleAddNew} disabled={!newDept || !newEmail}
                  className="flex-1 py-2 rounded-lg text-sm text-white font-bold disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>Add Approver</button>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setShowAddForm(true)}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-[#1A438A] text-[#1A438A] hover:bg-[#EEF3F8] transition-all flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /> Add New Approver
            </button>
            <button onClick={() => { onSave(approvers); onClose(); }}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)' }}>OK</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuccessModal({ title, message, submissionNo, onClose }: {
  title: string; message: string; submissionNo: string; onClose: () => void;
}) {
  const isApprove = title.toLowerCase().includes('approv');
  const isCancel  = title.toLowerCase().includes('reject') || title.toLowerCase().includes('cancel');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center">
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-5 shadow-lg
          ${isApprove ? 'bg-emerald-100 shadow-emerald-500/20' : isCancel ? 'bg-red-100 shadow-red-500/20' : 'bg-orange-100 shadow-orange-500/20'}`}>
          {isApprove && <CheckCircle2 className="w-10 h-10 text-emerald-500" />}
          {isCancel  && <XCircle className="w-10 h-10 text-red-500" />}
          {!isApprove && !isCancel && <RotateCcw className="w-10 h-10 text-orange-500" />}
        </div>
        <h2 className="text-[#17293E] text-xl font-bold mb-2">{title}</h2>
        <p className="text-slate-500 text-sm mb-1 leading-relaxed">{message}</p>
        <p className="text-[#1A438A] font-bold text-sm font-mono mb-6">Submission ID : #{submissionNo.split('_').pop()}</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>OK</button>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, confirmColor, onConfirm, onClose, requireComment = false, loading = false }: {
  title: string; message: string; confirmLabel: string; confirmColor: string;
  onConfirm: (comment: string) => void; onClose: () => void; requireComment?: boolean; loading?: boolean;
}) {
  const [comment, setComment] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5">
          <h3 className="text-[#17293E] font-bold text-base text-center mb-1">{title}</h3>
          <p className="text-slate-500 text-xs text-center mb-4 leading-relaxed">{message}</p>
          {requireComment && (
            <div className="mb-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Comment <span className="text-red-400">*</span>
              </label>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
                placeholder="Please provide a reason..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-[#1A438A] focus:ring-2 focus:ring-[#1A438A]/10" />
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} disabled={loading} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
            Cancel
          </button>
          <button disabled={(requireComment && !comment.trim()) || loading} onClick={() => onConfirm(comment)}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: confirmColor }}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function LegalGMPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('id');

  // ── Data state ──
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [apiError, setApiError] = useState('');

  // ── UI state ──
  const [assignedOfficer, setAssignedOfficer] = useState({ name: '', email: '' });
  const [specialApprovers, setSpecialApprovers] = useState<SpecialApprover[]>([]);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showLog,           setShowLog]           = useState(false);
  const [showReassign,      setShowReassign]      = useState(false);
  const [showMoreDocs,      setShowMoreDocs]      = useState(false);
  const [showSpecial,       setShowSpecial]       = useState(false);
  const [showConfirmAction, setShowConfirmAction] = useState<'approve' | 'sendback' | 'cancel' | null>(null);
  const [showSuccess,       setShowSuccess]       = useState<'approve' | 'sendback' | 'cancel' | null>(null);

  // ── Load submission ──
  const loadSubmission = useCallback(async () => {
    if (!submissionId) { setLoadError('No submission ID in URL.'); setIsLoading(false); return; }
    try {
      const res = await fetch(`/api/submissions/${submissionId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load');
      const s = data.data;
      setSubmission(s);
      const officerName = s.legalOfficerName || s.assignedLegalOfficer || '';
      setAssignedOfficer({ name: officerName, email: '' });

      // Seed log from approvals
      const seedLog: LogEntry[] = [
        { id: 0, actor: 'System', role: 'System', action: 'Submission created', timestamp: fmtDate(s.createdAt) },
        ...s.approvals
          .filter((a: ApproverRecord) => a.actionDate)
          .map((a: ApproverRecord, i: number) => ({
            id: i + 1,
            actor: a.approverName || a.role,
            role: ROLE_LABEL[a.role] ?? a.role,
            action: a.status === 'APPROVED' ? 'Approved' : a.status === 'SENT_BACK' ? 'Sent Back' : 'Cancelled',
            comment: a.comment ?? undefined,
            timestamp: fmtDate(a.actionDate),
          })),
      ];
      setLog(seedLog);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [submissionId]);

  useEffect(() => { loadSubmission(); }, [loadSubmission]);

  // ── API action ──
  const callApproveAPI = async (action: 'APPROVED' | 'SENT_BACK' | 'CANCELLED', comment?: string) => {
    if (!submissionId) return;
    setIsActing(true);
    setApiError('');
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'LEGAL_GM',
          action,
          comment: comment || null,
          approverName: 'Dinali Gurusinghe',
          approverEmail: 'dinali.gurusinghe@dimolanka.com',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Action failed');
      setSubmission(data.data);
      setLog((prev) => [...prev, {
        id: Date.now(), actor: 'Dinali Gurusinghe', role: 'Legal GM',
        action: action === 'APPROVED' ? 'Approved — OK to Proceed' : action === 'SENT_BACK' ? 'Sent Back to Initiator' : 'Cancelled and Rejected',
        comment, timestamp: new Date().toLocaleString('en-GB'),
      }]);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Action failed. Please try again.');
      throw err; // re-throw so we don't show success modal
    } finally {
      setIsActing(false);
    }
  };

  const handleAction = async (type: 'approve' | 'sendback' | 'cancel', comment: string) => {
    const actionMap = { approve: 'APPROVED', sendback: 'SENT_BACK', cancel: 'CANCELLED' } as const;
    try {
      await callApproveAPI(actionMap[type], comment);
      setShowConfirmAction(null);
      setShowSuccess(type);
    } catch {
      // apiError is set inside callApproveAPI, modal stays open
    }
  };

  const postCommentToAPI = async (text: string) => {
    if (!submissionId) return;
    fetch(`/api/submissions/${submissionId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorName: "Dinali Gurusinghe", authorRole: "LEGAL_GM", text }) });
  };

  const handlePostComment = () => {
    if (!commentInput.trim()) return;
    setComments((prev) => [...prev, { id: Date.now(), author: 'Dinali Gurusinghe', role: 'Legal GM', text: commentInput.trim(), time: 'Just now' }]);
    setCommentInput('');
  };

  // ── Derived ──
  const stage: LegalGMStage = (submission?.status === 'PENDING_LEGAL_GM_FINAL' || submission?.legalGmStage === 'FINAL_APPROVAL') ? 'FINAL_APPROVAL' : 'INITIAL_REVIEW';
  const isInitial = stage === 'INITIAL_REVIEW';
  const activeStep = isInitial ? 2 : 4;
  const steps = isInitial ? WORKFLOW_STEPS_INITIAL : WORKFLOW_STEPS_FINAL;

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
        <p className="text-xs text-slate-400 mb-4 font-mono">ID: {submissionId || 'none'}</p>
        <button onClick={() => router.push(ROUTES.LEGAL_GM_HOME)}
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
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">D</div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]" />
        </div>
        <div className="text-center">
          <p className="text-white text-[10px] font-semibold">Dinali</p>
          <p className="text-white/40 text-[9px]">GM Legal</p>
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
                <span className="text-[11px] font-semibold px-3 py-1 rounded-full border bg-purple-500/20 text-purple-200 border-purple-400/30">
                  Legal GM {isInitial ? 'Review' : 'Final Approval'}
                </span>
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

          {/* Workflow */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-5">
              <button onClick={() => setShowLog(true)} className="text-[11px] font-semibold text-[#1A438A] hover:underline">View Log</button>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Submission No.</p>
                <p className="text-[#1A438A] font-bold text-sm font-mono">{submission.submissionNo}</p>
              </div>
            </div>
            <WorkflowStepper steps={steps} activeStep={activeStep} />
          </div>

          {/* Required Documents */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <span className="text-white text-sm font-semibold">Required Documents</span>
              <button onClick={() => setShowMoreDocs(true)}
                className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                Request More Docs
              </button>
            </div>
            <div className="p-3 space-y-1.5">
            {submission.documents.filter(doc => submission.parties.map(p => p.type).includes(doc.type) || (doc.type === 'Common' && submission.parties.some(p => p.type !== 'Individual'))).map((doc, i) => (
                <div key={doc.id}
                  onClick={() => doc.fileUrl && window.open(doc.fileUrl, '_blank')}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all
                  ${doc.fileUrl ? 'bg-emerald-50 border-emerald-200 cursor-pointer hover:bg-emerald-100' : 'bg-slate-50 border-slate-100 cursor-default'}`}>
                  <span className="text-[11px] text-slate-600 flex-1 mr-2 leading-tight">
                    <span className="font-bold text-slate-300 mr-1">{i + 1}.</span>{doc.label}
                  </span>
                  {doc.fileUrl
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    : <Paperclip className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100">
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
                <span className="text-white text-xs font-semibold">Documents Prepared by Legal Dept.</span>
              </div>
              {stage === 'FINAL_APPROVAL' ? (
                <div className="p-3">
                  <button className="flex items-center gap-2 w-full rounded-lg px-3 py-2.5 bg-[#EEF3F8] border border-[#1A438A]/20 hover:bg-[#dce8f3] transition-colors">
                    <Eye className="w-4 h-4 text-[#1A438A]" />
                    <span className="text-sm font-semibold text-[#1A438A]">Draft Agreement</span>
                  </button>
                </div>
              ) : (
                <div className="px-4 py-3">
                  <p className="text-[11px] text-slate-400 italic">Not applicable at this stage</p>
                </div>
              )}
            </div>
          </div>

          {/* Approvals */}
          <PanelSection title="Approvals"
            action={
              <button onClick={() => setShowSpecial(true)}
                className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #AC9C2F, #c9b535)' }}>
                Special Approvals {specialApprovers.length > 0 && `(${specialApprovers.length})`}
              </button>
            }>
            <div className="px-4 py-3 divide-y divide-slate-100">
              {submission.approvals.map((a) => (
                <ApproverRow key={a.role} label={ROLE_LABEL[a.role] ?? a.role} name={a.approverName} status={a.status} />
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
                      <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-3 h-3 text-white" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PanelSection>

          {/* Comments */}
          <PanelSection title="Comments">
            <div className="p-3">
              {comments.length > 0 && (
                <div className="mb-3 space-y-2 max-h-36 overflow-y-auto">
                  {comments.map((c) => (
                    <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[11px] font-bold text-[#1A438A]">{c.author}</span>
                        <span className="text-[10px] text-slate-400">{c.time}</span>
                      </div>
                      <p className="text-[10px] text-[#4686B7] font-semibold mb-1">{c.role}</p>
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
                  placeholder="Post your comment here"
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />
                <button onClick={handlePostComment} disabled={!commentInput.trim()}
                  className="w-7 h-7 rounded-lg bg-[#1A438A] disabled:bg-slate-200 flex items-center justify-center transition-all hover:bg-[#1e5aad] active:scale-95">
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </PanelSection>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {/* Back + Assigned Legal Officer */}
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => router.push(ROUTES.LEGAL_GM_HOME)} disabled={isActing}
                className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl border-2 border-[#17293E] text-[#17293E] font-bold text-sm hover:bg-[#17293E] hover:text-white transition-all disabled:opacity-50">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 flex-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider">Assigned Legal Officer</p>
                  <p className="text-xs font-bold text-[#17293E] truncate">{assignedOfficer.name || '—'}</p>
                </div>
                {isInitial && (
                  <button onClick={() => setShowReassign(true)} disabled={isActing}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg text-white flex-shrink-0 transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #1A438A, #1e5aad)' }}>
                    Reassign
                  </button>
                )}
              </div>
            </div>

            {/* Main action buttons */}
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmAction('cancel')} disabled={isActing}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 shadow-lg shadow-red-500/20 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                Cancel
              </button>
              <button onClick={() => setShowConfirmAction('sendback')} disabled={isActing}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 shadow-lg shadow-orange-500/20 disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                Send Back
              </button>
              <button onClick={() => setShowConfirmAction('approve')} disabled={isActing}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 shadow-lg shadow-emerald-500/20 disabled:opacity-70 flex items-center justify-center gap-1"
                style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : isInitial ? 'OK to Proceed' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showLog      && <ViewLogModal log={log} onClose={() => setShowLog(false)} />}
      {showReassign && <ReassignModal currentOfficer={assignedOfficer.name} onSave={async (n, e) => {
  setAssignedOfficer({ name: n, email: e });
  if (submissionId) {
    await fetch(`/api/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedLegalOfficer: n }),
    });
  }
}} onClose={() => setShowReassign(false)} />}
      {showMoreDocs && <RequestMoreDocsModal onClose={() => setShowMoreDocs(false)} />}
      {showSpecial  && <SpecialApprovalsModal existing={specialApprovers} onSave={setSpecialApprovers} onClose={() => setShowSpecial(false)} />}

      {showConfirmAction === 'approve' && (
        <ConfirmModal
          title={isInitial ? 'OK to Proceed?' : 'Approve this request?'}
          message={isInitial
            ? specialApprovers.length > 0
              ? `The request will be routed through ${specialApprovers.length} special approver(s) before going to the Legal Officer.`
              : 'The request will be sent directly to the assigned Legal Officer.'
            : 'This will complete the Legal GM approval and move the request forward.'}
          confirmLabel={isInitial ? 'Yes, Proceed' : 'Yes, Approve'}
          confirmColor="linear-gradient(135deg, #22c55e, #16a34a)"
          onConfirm={(c) => handleAction('approve', c)}
          onClose={() => setShowConfirmAction(null)}
          loading={isActing}
        />
      )}
      {showConfirmAction === 'sendback' && (
        <ConfirmModal
          title="Send Back the request?"
          message="The request will be returned to the Initiator for corrections and resubmission."
          confirmLabel="Yes, Send Back"
          confirmColor="linear-gradient(135deg, #f97316, #ea580c)"
          requireComment onConfirm={(c) => handleAction('sendback', c)}
          onClose={() => setShowConfirmAction(null)}
          loading={isActing}
        />
      )}
      {showConfirmAction === 'cancel' && (
        <ConfirmModal
          title="Reject & Cancel the request?"
          message="This action is irreversible. The request will be permanently cancelled."
          confirmLabel="Yes, Cancel"
          confirmColor="linear-gradient(135deg, #ef4444, #dc2626)"
          requireComment onConfirm={(c) => handleAction('cancel', c)}
          onClose={() => setShowConfirmAction(null)}
          loading={isActing}
        />
      )}

      {showSuccess === 'approve' && <SuccessModal title={stage === 'FINAL_APPROVAL' ? 'Completed!' : 'Approved!'} message={stage === 'FINAL_APPROVAL' ? 'The contract has been fully approved and completed.' : 'Request has been sent to the Legal Officer.'} submissionNo={submission.submissionNo} onClose={() => { setShowSuccess(null); router.push(ROUTES.LEGAL_GM_HOME); }} />}
      {showSuccess === 'sendback' && <SuccessModal title="Sent Back!" message="Contract review form has been sent back." submissionNo={submission.submissionNo} onClose={() => { setShowSuccess(null); router.push(ROUTES.LEGAL_GM_HOME); }} />}
      {showSuccess === 'cancel'   && <SuccessModal title="Rejected!" message="Contract review form has been rejected and cancelled." submissionNo={submission.submissionNo} onClose={() => { setShowSuccess(null); router.push(ROUTES.LEGAL_GM_HOME); }} />}
    </div>
  );
}
export default function LegalGMPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <LegalGMPageContent />
    </Suspense>
  );
}
