'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, FileText, Users, LogOut, Loader2, AlertCircle, ChevronRight } from 'lucide-react';

type Submission = {
  id: string; submissionNo: string; title: string; status: string;
  companyCode: string; sapCostCenter: string; scopeOfAgreement: string;
  term: string; value: string; remarks: string;
  createdAt: string; updatedAt: string;
  parties:   { type: string; name: string }[];
  approvals: { role: string; approverName: string; status: string; comment: string | null; actionDate: string | null }[];
  documents: { label: string; fileUrl: string | null }[];
  comments:  { authorName: string; authorRole: string; text: string; createdAt: string }[];
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className="text-sm text-[#17293E] font-medium">{value || '—'}</p>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
        <Icon className="w-4 h-4 text-[#1A438A]" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#1A438A]">{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function FinancePageContent() {
  const { data: session } = useSession();
  const searchParams      = useSearchParams();
  const router            = useRouter();
  const submissionId      = searchParams.get('id');
  const currentUserName   = session?.user?.name ?? 'Finance Team';

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (!submissionId) { setError('No submission ID provided.'); setLoading(false); return; }
    fetch(`/api/submissions/${submissionId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setSubmission(d.data); else setError('Failed to load submission.'); })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false));
  }, [submissionId]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]">
      <Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" />
    </div>
  );

  if (error || !submission) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f9]">
      <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-[#17293E] font-bold mb-2">{error || 'Submission not found.'}</p>
        <p className="text-slate-400 text-sm">Open this page from a submission link, e.g. /finance?id=...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      {/* Nav */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-sm">
              {currentUserName.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold text-[#17293E] leading-tight">{currentUserName}</p>
              <p className="text-[11px] text-[#4686B7] font-semibold">Finance Team</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">DIMO Legal Help Desk</p>
            <p className="text-sm font-black text-[#1A438A]">Submission Review</p>
          </div>
          <button onClick={() => router.push('/login')} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm font-medium">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">

        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Submission No.</p>
            <p className="text-xl font-black text-[#1A438A] font-mono">{submission.submissionNo}</p>
            <p className="text-sm font-semibold text-[#17293E] mt-1">{submission.title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Created {fmtDate(submission.createdAt)} · Updated {fmtDate(submission.updatedAt)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold border bg-emerald-100 text-emerald-700 border-emerald-200">
              {submission.status === 'COMPLETED' ? 'Completed' : submission.status.replace(/_/g,' ')}
            </span>
            <span className="text-[10px] bg-teal-50 border border-teal-200 text-teal-700 px-2 py-0.5 rounded-full font-bold">👁 View Only</span>
          </div>
        </div>

        {/* Details */}
        <SectionCard title="Submission Details" icon={FileText}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company Code"    value={submission.companyCode} />
            <Field label="SAP Cost Center" value={submission.sapCostCenter} />
            <Field label="Contract Value (LKR)" value={submission.value ? Number(submission.value).toLocaleString() : '—'} />
            <Field label="Term"            value={submission.term} />
            <div className="col-span-2"><Field label="Scope of Agreement" value={submission.scopeOfAgreement} /></div>
            {submission.remarks && <div className="col-span-2"><Field label="Remarks" value={submission.remarks} /></div>}
          </div>
        </SectionCard>

        {/* Parties */}
        {submission.parties?.length > 0 && (
          <SectionCard title="Parties to the Agreement" icon={Users}>
            <div className="divide-y divide-slate-100">
              {submission.parties.map((p, i) => (
                <div key={i} className="flex items-center gap-4 py-2.5 first:pt-0 last:pb-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 w-24 flex-shrink-0">{p.type}</span>
                  <span className="text-sm font-semibold text-[#17293E]">{p.name}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Approval trail */}
        <SectionCard title="Approval Trail" icon={CheckCircle2}>
          {submission.approvals?.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">No approval records.</p>
          ) : (
            <div className="space-y-2">
              {submission.approvals?.map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.status==='APPROVED'?'bg-emerald-500':a.status==='PENDING'?'bg-yellow-400':'bg-red-500'}`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-[#17293E]">{a.approverName || a.role}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.status==='APPROVED'?'bg-emerald-100 text-emerald-700':a.status==='PENDING'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{a.status}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{a.role}{a.actionDate?` · ${fmtDate(a.actionDate)}`:''}</p>
                    {a.comment && <p className="text-[11px] text-slate-500 mt-1 italic">"{a.comment}"</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Documents */}
        {submission.documents?.length > 0 && (
          <SectionCard title="Documents" icon={FileText}>
            <div className="space-y-2">
              {submission.documents.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-[#17293E] font-medium">{d.label}</span>
                  </div>
                  {d.fileUrl
                    ? <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-[#1A438A] hover:underline flex items-center gap-1">View <ChevronRight className="w-3 h-3" /></a>
                    : <span className="text-[11px] text-slate-400">Not uploaded</span>}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Comments */}
        {submission.comments?.length > 0 && (
          <SectionCard title="Comments" icon={FileText}>
            <div className="space-y-3">
              {submission.comments.map((c, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#1A438A]/10 flex items-center justify-center text-[#1A438A] font-bold text-xs flex-shrink-0">{c.authorName.charAt(0)}</div>
                  <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-[#17293E]">{c.authorName}</span>
                      <span className="text-[10px] text-slate-400">{c.authorRole} · {fmtDate(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-600">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Footer */}
        <div className="bg-teal-50 border border-teal-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
          <p className="text-sm text-teal-700 font-medium">Read-only view for Finance Team. No actions required on this page.</p>
        </div>

      </div>
    </div>
  );
}

export default function FinancePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>}>
      <FinancePageContent />
    </Suspense>
  );
}
