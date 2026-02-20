'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  FileText, LogOut, X, Search, ChevronRight, Clock,
  CheckCircle2, XCircle, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskFilter = 'PENDING' | 'APPROVED' | 'CANCELLED' | 'ALL';

type TaskItem = {
  id: string;
  requestNo: string;
  formTitle: string;   // the agreement title e.g. "Service Agreement"
  formType: string;    // the form name e.g. "Contract Review Form"
  submittedBy: string;
  submittedDate: string;
  status: TaskFilter;
  route: string;
};

const FILTER_CONFIG: Record<TaskFilter, { label: string; color: string }> = {
  PENDING:   { label: 'Pending',   color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  APPROVED:  { label: 'Approved',  color: 'bg-green-500/20 text-green-300 border-green-500/40'   },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-500/20 text-red-300 border-red-500/40'         },
  ALL:       { label: 'All',       color: 'bg-white/10 text-white border-white/20'               },
};

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getUTCDate()).padStart(2,'0')} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function StatusBadge({ status }: { status: TaskFilter }) {
  const config = FILTER_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${config.color}`}>
      {status === 'PENDING'   && <Clock        className="w-3 h-3" />}
      {status === 'APPROVED'  && <CheckCircle2 className="w-3 h-3" />}
      {status === 'CANCELLED' && <XCircle      className="w-3 h-3" />}
      {config.label}
    </span>
  );
}

// ─── Tasks Panel ─────────────────────────────────────────────────────────────

function TasksPanel({ items, loading, onClose, onNavigate }: {
  items: TaskItem[]; loading: boolean; onClose: () => void; onNavigate: (r: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('PENDING');
  const [search, setSearch] = useState('');
  const FILTERS: TaskFilter[] = ['PENDING', 'APPROVED', 'CANCELLED', 'ALL'];

  const filtered = items.filter((item) => {
    const matchFilter = activeFilter === 'ALL' || item.status === activeFilter;
    const matchSearch = search === '' ||
      item.requestNo.toLowerCase().includes(search.toLowerCase()) ||
      item.formTitle.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#17293E] border border-[#1183B7]/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1183B7]/30 bg-[#1A3A5C]">
          <div>
            <h2 className="text-white text-lg font-bold">My Special Approvals</h2>
            <p className="text-[#91ADC5] text-xs mt-0.5">Requests assigned to you for special approval</p>
          </div>
          <button onClick={onClose} className="text-[#91ADC5] hover:text-white rounded-lg p-1 hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-[#1183B7]/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#91ADC5]" />
            <input type="text" placeholder="Search by request no or title..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#1A438A]/40 border border-[#1183B7]/30 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder:text-[#91ADC5]/60 focus:outline-none focus:border-[#1183B7]" />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 px-6 py-3 border-b border-[#1183B7]/20 overflow-x-auto flex-shrink-0">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${activeFilter === f ? 'bg-[#1183B7] text-white' : 'bg-[#1A438A]/40 text-[#91ADC5] hover:bg-[#1A438A]/70 hover:text-white'}`}>
              {FILTER_CONFIG[f].label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${activeFilter === f ? 'bg-white/20' : 'bg-white/10'}`}>
                {f === 'ALL' ? items.length : items.filter(i => i.status === f).length}
              </span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#1183B7]/20">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[#91ADC5]">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#91ADC5]">
              <CheckCircle2 className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No requests found</p>
            </div>
          ) : filtered.map((item) => (
            <button key={item.id} onClick={() => { onClose(); onNavigate(item.route); }}
              className="w-full text-left px-6 py-4 hover:bg-[#1183B7]/10 transition-colors group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#91ADC5] text-xs font-mono">{item.requestNo}</span>
                    <span className="text-[#AC9C2F] text-xs font-semibold">{item.formType}</span>
                  </div>
                  <p className="text-white text-sm font-semibold truncate mb-1.5">{item.formTitle}</p>
                  <div className="flex items-center gap-3 text-xs text-[#91ADC5]">
                    <span>By {item.submittedBy}</span><span>•</span><span>Submitted {item.submittedDate}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <StatusBadge status={item.status} />
                  <ChevronRight className="w-4 h-4 text-[#91ADC5] group-hover:text-white transition-all" />
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-[#1183B7]/20 bg-[#17293E]/80 text-center">
          <p className="text-[#91ADC5] text-xs">
            {items.filter(i => i.status === 'PENDING').length} pending · {filtered.length} of {items.length} shown
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SpecialApproverHomePage() {
  const { data: session } = useSession();
  const currentUserName  = session?.user?.name  ?? 'Special Approver';
  const currentUserEmail = session?.user?.email ?? '';
  const router = useRouter();

  const [tasks,     setTasks]     = useState<TaskItem[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res  = await fetch('/api/submissions');
        const json = await res.json();
        if (!json.success) return;

        // FIX: use sa.approverEmail (not sa.email — that field doesn't exist in the API response)
        const mine = (json.data as any[]).filter((s) =>
          s.specialApprovers?.some((sa: any) =>
            sa.approverEmail?.toLowerCase() === currentUserEmail.toLowerCase()
          )
        );

        setTasks(mine.map((s: any) => {
          // FIX: match on sa.approverEmail not sa.email
          const mySA = s.specialApprovers?.find((sa: any) =>
            sa.approverEmail?.toLowerCase() === currentUserEmail.toLowerCase()
          );
          const saStatus = mySA?.status ?? 'PENDING';
          const status: TaskFilter =
            saStatus === 'APPROVED'  ? 'APPROVED'  :
            saStatus === 'CANCELLED' ? 'CANCELLED' : 'PENDING';

          return {
            id:            s.id,
            requestNo:     s.submissionNo,
            formTitle:     s.title      || s.formName || '—',  // FIX: use s.title (agreement title), not s.formName
            formType:      s.formName   || `Form ${s.formId}`, // FIX: use s.formName as the form type label
            submittedBy:   s.initiatorName || s.initiatorId,
            submittedDate: formatDate(s.createdAt),
            status,
            route: `/form${s.formId}/special-approver?id=${s.id}`,
          };
        }));
      } catch (err) {
        console.error('Failed to load special approver data:', err);
      } finally {
        setLoading(false);
      }
    }
    if (currentUserEmail) loadData();
  }, [currentUserEmail]);

  const pendingCount = tasks.filter(t => t.status === 'PENDING').length;
  const firstName = currentUserName.split(' ')[0];

  const FORMS = [
    { id: 1,  title: 'FORM 1',  description: 'Contract Review Form',                      color: 'bg-orange-500' },
    { id: 2,  title: 'FORM 2',  description: 'Lease Agreement',                            color: 'bg-orange-400' },
    { id: 3,  title: 'FORM 3',  description: 'Instruction For Litigation',                 color: 'bg-red-400'    },
    { id: 4,  title: 'FORM 4',  description: 'Vehicle Rent Agreement',                     color: 'bg-pink-400'   },
    { id: 5,  title: 'FORM 5',  description: 'Request for Power of Attorney',              color: 'bg-purple-500' },
    { id: 6,  title: 'FORM 6',  description: 'Registration of a Trademark',                color: 'bg-yellow-500' },
    { id: 7,  title: 'FORM 7',  description: 'Termination of agreements/lease agreements', color: 'bg-yellow-400' },
    { id: 8,  title: 'FORM 8',  description: 'Handing over of the leased premises',        color: 'bg-lime-500'   },
    { id: 9,  title: 'FORM 9',  description: 'Approval for Purchasing of a Premises',      color: 'bg-green-500'  },
    { id: 10, title: 'FORM 10', description: 'Instruction to Issue Letter of Demand',      color: 'bg-teal-500'   },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden relative"
      style={{ background: 'linear-gradient(160deg, #0f2240 0%, #1A438A 50%, #0f2240 100%)' }}>

      {/* Top Nav */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2 flex-shrink-0">
        <div className="flex gap-6">
          <button onClick={() => setShowPanel(!showPanel)}
            className={`relative text-white font-medium pb-2 transition-all text-sm
              ${showPanel ? 'border-b-2 border-white' : 'opacity-70 hover:opacity-100'}`}>
            My Approvals
            {pendingCount > 0 && (
              <span className="absolute -top-2 -right-5 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold px-3 py-1 rounded-full border border-white/20 text-white/70 bg-white/10">
            Special Approver
          </span>
          <Button variant="ghost" className="text-white hover:bg-white/10 text-sm" onClick={() => router.push('/login')}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </div>

      {/* Welcome */}
      <div className="text-center py-3 flex-shrink-0">
        <div className="w-20 h-20 mx-auto mb-2 rounded-full bg-pink-500 border-4 border-pink-400 flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-black/30">
          {firstName.charAt(0)}
        </div>
        <h1 className="text-white text-xl font-medium mb-1">Welcome, {firstName}!</h1>
        <h2 className="text-[#AC9C2F] text-3xl font-bold">DIMO Legal Help Desk</h2>
        {pendingCount > 0 && (
          <p className="text-white/60 text-sm mt-1">
            You have <span className="text-yellow-400 font-bold">{pendingCount}</span> pending approval{pendingCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Forms Grid */}
      <div className="flex-1 px-6 pb-4 overflow-hidden">
        <div className="h-full max-w-7xl mx-auto">
          <div className="grid h-full" style={{ gridTemplateColumns: '1fr 12px 1fr', gridAutoRows: '1fr' }}>

            {/* Left column */}
            <div className="grid gap-2" style={{ gridTemplateRows: 'repeat(5, 1fr)' }}>
              {FORMS.filter((_, i) => i % 2 === 0).map((form) => (
                <div key={form.id}
                  className="group relative backdrop-blur-sm border rounded-xl p-3 flex items-center min-h-0"
                  style={{ background: 'rgba(15, 34, 64, 0.55)', borderColor: 'rgba(17, 131, 183, 0.35)' }}>
                  <div className={`w-11 h-11 ${form.color} rounded-full flex items-center justify-center flex-shrink-0 shadow-lg`}>
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left flex-1 ml-3 min-w-0">
                    <h3 className="text-white text-sm font-bold mb-0.5 truncate">{form.title}</h3>
                    <p className="text-[#91ADC5] text-xs leading-tight line-clamp-2">{form.description}</p>
                  </div>
                  {tasks.filter(t => t.formType === form.description && t.status === 'PENDING').length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0 ml-2 text-[10px] font-bold text-white">
                      {tasks.filter(t => t.formType === form.description && t.status === 'PENDING').length}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="flex flex-col items-center justify-center gap-1 py-2">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="w-px h-2 rounded-full" style={{ background: 'rgba(17,131,183,0.25)' }} />
              ))}
            </div>

            {/* Right column */}
            <div className="grid gap-2" style={{ gridTemplateRows: 'repeat(5, 1fr)' }}>
              {FORMS.filter((_, i) => i % 2 !== 0).map((form) => (
                <div key={form.id}
                  className="group relative backdrop-blur-sm border rounded-xl p-3 flex items-center min-h-0"
                  style={{ background: 'rgba(15, 34, 64, 0.55)', borderColor: 'rgba(17, 131, 183, 0.35)' }}>
                  <div className={`w-11 h-11 ${form.color} rounded-full flex items-center justify-center flex-shrink-0 shadow-lg`}>
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left flex-1 ml-3 min-w-0">
                    <h3 className="text-white text-sm font-bold mb-0.5 truncate">{form.title}</h3>
                    <p className="text-[#91ADC5] text-xs leading-tight line-clamp-2">{form.description}</p>
                  </div>
                  {tasks.filter(t => t.formType === form.description && t.status === 'PENDING').length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0 ml-2 text-[10px] font-bold text-white">
                      {tasks.filter(t => t.formType === form.description && t.status === 'PENDING').length}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tasks Panel */}
      {showPanel && (
        <TasksPanel
          items={tasks}
          loading={loading}
          onClose={() => setShowPanel(false)}
          onNavigate={(r) => router.push(r)}
        />
      )}
    </div>
  );
}