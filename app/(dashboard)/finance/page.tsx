'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Home, LogOut, Loader2, AlertCircle, ChevronRight,
  Search, Eye, EyeOff, FileText, Users, CheckCircle2,
  Paperclip, X, User, Settings,
} from 'lucide-react';

type Submission = {
  id: string; submissionNo: string; title: string; status: string;
  companyCode: string; sapCostCenter: string; scopeOfAgreement: string;
  term: string; value: string; remarks: string;
  createdAt: string; updatedAt: string;
  financeViewedAt: string | null;
  parties:   { type: string; name: string }[];
  approvals: { role: string; approverName: string; status: string; comment: string | null; actionDate: string | null }[];
  documents: { id: string; label: string; fileUrl: string | null; type: string }[];
  comments:  { authorName: string; authorRole: string; text: string; createdAt: string }[];
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtCurrency(v: string) {
  return v ? 'LKR ' + Number(v).toLocaleString('en-LK') : '—';
}

// ─── Sidebar (matches form1 style) ───────────────────────────────────────────
function Sidebar({ userName, onSignOut, onHome }: { userName: string; onSignOut: () => void; onHome: () => void }) {
  return (
    <aside className="w-[68px] flex flex-col items-center py-5 gap-4 flex-shrink-0 sticky top-0 h-screen"
      style={{ background: 'linear-gradient(180deg, #1A438A 0%, #17293E 100%)' }}>
      <div className="relative mb-1">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-black/30">
          {userName.charAt(0)}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1A438A]" />
      </div>
      <div className="text-center">
        <p className="text-white text-[10px] font-semibold">{userName.split(' ')[0]}</p>
        <p className="text-white/40 text-[9px]">{userName.split(' ').slice(1).join(' ')}</p>
      </div>
      <div className="w-8 h-px bg-white/10" />
      <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
        <button onClick={onHome} className="relative w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all" title="Home">
          <Home className="w-[18px] h-[18px]" />
        </button>
      </nav>
      <div className="flex flex-col items-center gap-1 w-full px-2 mb-2">
        <button onClick={onSignOut} className="w-full h-10 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all" title="Sign Out">
          <LogOut className="w-[18px] h-[18px]" />
        </button>
      </div>
    </aside>
  );
}

// ─── Finance Home (list view) ─────────────────────────────────────────────────
function FinanceHomePage({ currentUserName }: { currentUserName: string }) {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'unviewed' | 'viewed'>('all');
  const [marking, setMarking] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/submissions?status=COMPLETED')
      .then(r => r.json())
      .then(d => { if (d.success) setSubmissions(d.data); })
      .finally(() => setLoading(false));
  }, []);

  async function markViewed(e: React.MouseEvent, sub: Submission) {
    e.stopPropagation();
    if (sub.financeViewedAt) return;
    setMarking(sub.id);
    await fetch(`/api/submissions/${sub.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ financeViewedAt: new Date().toISOString() }),
    });
    setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, financeViewedAt: new Date().toISOString() } : s));
    setMarking(null);
  }

  const filtered = submissions.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.submissionNo.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) || s.companyCode.toLowerCase().includes(q);
    const matchTab = tab === 'all' ? true : tab === 'unviewed' ? !s.financeViewedAt : !!s.financeViewedAt;
    return matchSearch && matchTab;
  });

  const tabs = [
    { key: 'all',      label: 'All',          count: submissions.length },
    { key: 'unviewed', label: 'Need to View',  count: submissions.filter(s => !s.financeViewedAt).length },
    { key: 'viewed',   label: 'Marked Viewed', count: submissions.filter(s => !!s.financeViewedAt).length },
  ] as const;

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>

      <Sidebar
        userName={currentUserName}
        onHome={() => router.push('/finance')}
        onSignOut={() => signOut({ callbackUrl: '/login' })}
      />

      <div className="flex-1 flex flex-col p-5 gap-4 overflow-auto min-w-0">

        {/* Header banner */}
        <div className="rounded-2xl overflow-hidden shadow-sm"
          style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-base leading-tight">Finance Dashboard</h1>
                <p className="text-white/50 text-[11px] mt-0.5">DIMO Legal Help Desk — Read Only</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold px-3 py-1 rounded-full border bg-teal-500/20 text-teal-200 border-teal-400/30">
                Finance Team
              </span>
              <div className="bg-white text-[#1A438A] font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-black/10">
                {submissions.filter(s => !s.financeViewedAt).length} Unviewed
              </div>
            </div>
          </div>
        </div>

        {/* Search + Tabs row */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by submission no., title, or company..."
              className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 shadow-sm text-sm text-[#17293E] placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#1A438A]/20 focus:border-[#1A438A] transition-all"
            />
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  tab === t.key
                    ? 'bg-[#1A438A] text-white border-[#1A438A] shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-[#1A438A]/40'
                }`}
              >
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  tab === t.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex-1 flex justify-center items-center py-24">
            <Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-14 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">No submissions found.</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your search or filter.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(sub => (
              <div
                key={sub.id}
                onClick={() => router.push(`/finance?id=${sub.id}`)}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-4 cursor-pointer hover:shadow-md hover:border-[#1A438A]/30 transition-all group"
              >
                <div className="flex items-center gap-4">

                  {/* Status stripe */}
                  <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${sub.financeViewedAt ? 'bg-emerald-400' : 'bg-amber-400'}`} />

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-sm font-bold text-[#1A438A]">{sub.submissionNo}</span>
                      {sub.financeViewedAt ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Eye className="w-3 h-3" /> Viewed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          <EyeOff className="w-3 h-3" /> Not Viewed
                        </span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                        Completed
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#17293E] truncate">{sub.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 font-medium">
                      <span className="font-semibold text-slate-500">{sub.companyCode}</span>
                      <span>·</span>
                      <span className="font-mono font-semibold text-[#1A438A]">{fmtCurrency(sub.value)}</span>
                      <span>·</span>
                      <span>Completed {fmtDate(sub.updatedAt)}</span>
                      {sub.financeViewedAt && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-600">Viewed {fmtDate(sub.financeViewedAt)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {!sub.financeViewedAt && (
                      <button
                        onClick={e => markViewed(e, sub)}
                        disabled={marking === sub.id}
                        className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #AC9C2F15, #AC9C2F25)', borderColor: '#AC9C2F50', color: '#8a7a22' }}
                      >
                        {marking === sub.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                        Mark Viewed
                      </button>
                    )}
                    <span className="flex items-center gap-1 text-[#1A438A] font-bold text-sm group-hover:gap-2 transition-all">
                      View <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Finance Detail ───────────────────────────────────────────────────────────
function FinanceDetailPage({ submissionId, currentUserName }: { submissionId: string; currentUserName: string }) {
  const router = useRouter();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    fetch(`/api/submissions/${submissionId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setSubmission(d.data); else setError('Failed to load.'); })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false));
  }, [submissionId]);

  async function markViewed() {
    if (!submission || submission.financeViewedAt) return;
    setMarking(true);
    await fetch(`/api/submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ financeViewedAt: new Date().toISOString() }),
    });
    setSubmission(prev => prev ? { ...prev, financeViewedAt: new Date().toISOString() } : prev);
    setMarking(false);
  }

  if (loading) return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <Sidebar userName={currentUserName} onHome={() => router.push('/finance')} onSignOut={() => signOut({ callbackUrl: '/login' })} />
      <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" /></div>
    </div>
  );

  if (error || !submission) return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <Sidebar userName={currentUserName} onHome={() => router.push('/finance')} onSignOut={() => signOut({ callbackUrl: '/login' })} />
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-[#17293E] font-bold">{error || 'Not found.'}</p>
        </div>
      </div>
    </div>
  );

  const initiatorDocs = submission.documents?.filter(d => !d.type?.startsWith('LO_PREPARED') && d.type !== 'LO_REQUESTED') || [];
  const loDocs = submission.documents?.filter(d => d.type?.startsWith('LO_PREPARED')) || [];

  return (
    <div className="min-h-screen flex bg-[#f0f4f9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`}</style>

      <Sidebar
        userName={currentUserName}
        onHome={() => router.push('/finance')}
        onSignOut={() => signOut({ callbackUrl: '/login' })}
      />

      <div className="flex-1 flex gap-5 p-5 overflow-auto min-w-0">

        {/* ── Left: Main detail ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Header banner */}
          <div className="rounded-2xl overflow-hidden shadow-sm"
            style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/finance')}
                  className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-all"
                  title="Back to list"
                >
                  ←
                </button>
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-white font-bold text-base leading-tight">{submission.title}</h1>
                  <p className="text-white/50 text-[11px] mt-0.5 font-mono">{submission.submissionNo}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold px-3 py-1 rounded-full border bg-emerald-500/20 text-emerald-200 border-emerald-400/30">
                  Completed
                </span>
                {submission.financeViewedAt ? (
                  <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-400/30 rounded-xl px-3 py-2">
                    <Eye className="w-3.5 h-3.5 text-emerald-300" />
                    <div>
                      <p className="text-[9px] text-emerald-300/70 font-semibold uppercase tracking-wider">Viewed</p>
                      <p className="text-[11px] text-emerald-200 font-bold">{fmtDate(submission.financeViewedAt)}</p>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={markViewed}
                    disabled={marking}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-60 shadow-lg shadow-black/20"
                    style={{ background: 'linear-gradient(135deg, #AC9C2F 0%, #c9b535 100%)' }}
                  >
                    {marking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    Mark as Viewed
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Submission Details */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-3 px-6 py-3.5 border-b border-slate-100">
              <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Submission Details</span>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-x-8 gap-y-4">
              {[
                { label: 'Company Code', value: submission.companyCode },
                { label: 'SAP Cost Center', value: submission.sapCostCenter },
                { label: 'Contract Value', value: fmtCurrency(submission.value) },
                { label: 'Term', value: submission.term },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
                  <p className="text-sm text-[#17293E] font-semibold">{value || '—'}</p>
                </div>
              ))}
              <div className="col-span-2">
                {(() => {
                  let meta: Record<string, any> = {};
                  try { meta = JSON.parse(submission.scopeOfAgreement || '{}'); } catch {}
                  const isForm2 = Object.keys(meta).length > 0 && 'monthlyRental' in meta;
                  if (!isForm2) return (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Scope of Agreement</p>
                      <p className="text-sm text-[#17293E] leading-relaxed">{submission.scopeOfAgreement || '—'}</p>
                    </>
                  );
                  return (
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Agreement Details</p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          ['Contact Person', meta.contactPerson],
                          ['Contact No', meta.contactNo],
                          ['Dept. SAP Code', meta.deptSapCode],
                          ['Purpose of Lease', meta.purposeOfLease],
                          ['NIC No', meta.nicNo],
                          ['VAT Reg. No.', meta.vatRegNo],
                          ['Contact (Lessor)', meta.lessorContact],
                          ['Name of Lessee/Tenant', meta.leaseName],
                          ['Premises Asst. No', meta.premisesAssetNo],
                          ['Period of Lease', meta.periodOfLease],
                          ['Commencing From', meta.commencingFrom],
                          ['Ending On', meta.endingOn],
                          ['Monthly Rental Rs.', meta.monthlyRental],
                          ['Advance Payment Rs.', meta.advancePayment],
                          ['Deductible Rate Rs.', meta.deductibleRate],
                          ['Deductible Period', meta.deductiblePeriod],
                          ['Refundable Deposit Rs.', meta.refundableDeposit],
                          ['Electricity/Water/Phone', meta.electricityWaterPhone],
                          ['Previous Agreement No', meta.previousAgreementNo],
                          ['Date of Principal Agreement', meta.dateOfPrincipalAgreement],
                        ].filter(([,v]) => v).map(([label, value]) => (
                          <div key={label as string}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label as string}</p>
                            <p className="text-sm text-[#17293E] font-semibold">{value as string}</p>
                          </div>
                        ))}
                      </div>
                      {(meta.assetHouse || meta.assetLand || meta.assetBuilding) && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Asset Type</p>
                          <div className="flex gap-2">
                            {meta.assetHouse && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">House</span>}
                            {meta.assetLand && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">Land</span>}
                            {meta.assetBuilding && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">Building</span>}
                            {meta.assetExtent && <span className="text-xs text-slate-500 ml-1">Extent: {meta.assetExtent}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              {submission.remarks && (
                <div className="col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Remarks</p>
                  <p className="text-sm text-[#17293E]">{submission.remarks}</p>
                </div>
              )}
              <div className="col-span-2 pt-1 flex items-center gap-6 text-[11px] text-slate-400 border-t border-slate-100">
                <span>Created <span className="text-slate-600 font-semibold">{fmtDateTime(submission.createdAt)}</span></span>
                <span>·</span>
                <span>Completed <span className="text-slate-600 font-semibold">{fmtDateTime(submission.updatedAt)}</span></span>
              </div>
            </div>
          </div>

          {/* Parties */}
          {submission.parties?.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
              <div className="flex items-center gap-3 px-6 py-3.5 border-b border-slate-100">
                <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Parties to the Agreement</span>
              </div>
              <div className="divide-y divide-slate-50">
                {submission.parties.map((p, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 w-28 flex-shrink-0">{p.type}</span>
                    <span className="text-sm font-semibold text-[#17293E]">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          {initiatorDocs.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
              <div className="flex items-center gap-3 px-6 py-3.5 border-b border-slate-100">
                <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Initiator Documents</span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-2">
                {initiatorDocs.map((d, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${d.fileUrl ? 'bg-[#EEF3F8] border-[#1A438A]/20' : 'bg-slate-50 border-slate-100'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${d.fileUrl ? 'bg-[#1A438A]/10' : 'bg-slate-200'}`}>
                      <FileText className={`w-4 h-4 ${d.fileUrl ? 'text-[#1A438A]' : 'text-slate-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-[#17293E] truncate">{d.label}</p>
                      {d.fileUrl
                        ? <p className="text-[10px] text-emerald-600 font-bold">Uploaded</p>
                        : <p className="text-[10px] text-slate-400">Not uploaded</p>}
                    </div>
                    {d.fileUrl && (
                      <button onClick={() => window.open(d.fileUrl!, '_blank')}
                        className="w-7 h-7 rounded-lg hover:bg-[#1A438A]/10 flex items-center justify-center text-[#1A438A] transition-colors flex-shrink-0">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legal Dept Documents */}
          {loDocs.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
              <div className="flex items-center gap-3 px-6 py-3.5 border-b border-slate-100">
                <div className="w-0.5 h-4 rounded-full bg-[#AC9C2F]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Documents by Legal Dept.</span>
              </div>
              <div className="p-4 space-y-2">
                {loDocs.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[#EEF3F8] border border-[#1A438A]/20">
                    <div className="w-8 h-8 rounded-lg bg-[#1A438A]/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-[#1A438A]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1A438A] truncate">{d.label}</p>
                    </div>
                    <span className="text-[9px] uppercase font-bold text-[#4686B7] bg-[#1A438A]/10 px-1.5 py-0.5 rounded">
                      {d.type === 'LO_PREPARED_FINAL' ? 'Final' : 'Initial'}
                    </span>
                    {d.fileUrl && (
                      <button onClick={() => window.open(d.fileUrl!, '_blank')}
                        className="w-7 h-7 rounded-lg hover:bg-[#1A438A]/10 flex items-center justify-center text-[#1A438A] transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Read-only notice */}
          <div className="bg-teal-50 border border-teal-200 rounded-2xl px-5 py-3.5 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <p className="text-sm text-teal-700 font-medium">Read-only view for Finance Team. No actions are required.</p>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-[280px] flex-shrink-0 flex flex-col gap-4">

          {/* Approval Trail */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100"
              style={{ background: 'linear-gradient(135deg, #1A438A 0%, #1e5aad 100%)' }}>
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-white">Approval Trail</span>
            </div>
            <div className="p-3">
              {!submission.approvals?.length ? (
                <p className="text-slate-400 text-xs text-center py-4">No records.</p>
              ) : (
                <div className="space-y-2">
                  {submission.approvals.map((a, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0
                        ${a.status==='APPROVED'?'bg-emerald-500':a.status==='PENDING'?'bg-yellow-400':'bg-red-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[11px] font-bold text-[#17293E] truncate">{a.approverName || a.role}</p>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0
                            ${a.status==='APPROVED'?'bg-emerald-100 text-emerald-700':a.status==='PENDING'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>
                            {a.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">{a.role}{a.actionDate?` · ${fmtDate(a.actionDate)}`:''}</p>
                        {a.comment && <p className="text-[10px] text-slate-500 mt-1 italic truncate">"{a.comment}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Comments */}
          {submission.comments?.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <div className="w-0.5 h-4 rounded-full bg-[#1A438A]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#17293E]">Comments</span>
              </div>
              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {submission.comments.map((c, i) => (
                  <div key={i} className="flex gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#1A438A]/10 flex items-center justify-center text-[#1A438A] font-bold text-[10px] flex-shrink-0">
                      {c.authorName.charAt(0)}
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-bold text-[#17293E]">{c.authorName}</span>
                        <span className="text-[9px] text-slate-400">{fmtDate(c.createdAt)}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View Only badge */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mx-auto mb-2">
              <Eye className="w-5 h-5 text-teal-500" />
            </div>
            <p className="text-[11px] font-bold text-[#17293E] mb-0.5">Read Only Access</p>
            <p className="text-[10px] text-slate-400 leading-relaxed">Finance can view all completed submissions. No actions required.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function FinancePageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('id');
  const currentUserName = session?.user?.name ?? 'Finance Team';

  if (status === 'loading') return null;
  if (status === 'authenticated' && session?.user?.role !== 'FINANCE') {
    router.replace('/');
    return null;
  }
  if (submissionId) return <FinanceDetailPage submissionId={submissionId} currentUserName={currentUserName} />;
  return <FinanceHomePage currentUserName={currentUserName} />;
}

export default function FinancePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f0f4f9] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#1A438A] animate-spin" />
      </div>
    }>
      <FinancePageContent />
    </Suspense>
  );
}
