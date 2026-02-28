'use client';
import { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCircle2, Clock, RotateCcw, AlertCircle, ChevronRight } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

type Notif = {
  id: string;
  title: string;
  subtitle: string;
  type: 'approval' | 'resubmit' | 'info';
  route: string;
  time: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const role = session?.user?.role ?? '';
  const userId = session?.user?.id ?? '';

  useEffect(() => {
    if (!role) return;
    const fetchNotifs = () => fetch('/api/submissions')
      .then(r => r.json())
      .then(data => {
        if (!data.success) return;
        const items: Notif[] = [];
        for (const s of data.data ?? []) {
          // Approvers: show pending approvals assigned to them
          if (['BUM','FBP','CLUSTER_HEAD'].includes(role)) {
            const myApproval = s.approvals?.find((a: any) => a.role === role && a.status === 'PENDING');
            if (myApproval && s.status === 'PENDING_APPROVAL') {
              items.push({
                id: s.id,
                title: 'Approval Required',
                subtitle: `${s.submissionNo} — ${s.title}`,
                type: 'approval',
                route: `/form${s.formId || 1}/approval?id=${s.id}`,
                time: s.updatedAt,
              });
            }
          }
          // Initiator: resubmission needed
          if (role === 'INITIATOR' && s.initiatorId === userId && s.status === 'SENT_BACK') {
            items.push({
              id: s.id,
              title: 'Resubmission Required',
              subtitle: `${s.submissionNo} was sent back`,
              type: 'resubmit',
              route: `/form${s.formId || 1}?mode=resubmit&id=${s.id}`,
              time: s.updatedAt,
            });
          }
          // Legal GM: pending initial review
          if (role === 'LEGAL_GM' && s.status === 'PENDING_LEGAL_GM') {
            items.push({
              id: s.id,
              title: 'Pending Your Review',
              subtitle: `${s.submissionNo} — Initial Review`,
              type: 'approval',
              route: `/form${s.formId || 1}/legal-gm?id=${s.id}`,
              time: s.updatedAt,
            });
          }
          if (role === 'LEGAL_GM' && s.status === 'PENDING_LEGAL_GM_FINAL') {
            items.push({
              id: s.id,
              title: 'Pending Final Approval',
              subtitle: `${s.submissionNo} — Final Sign-off`,
              type: 'approval',
              route: `/form${s.formId || 1}/legal-gm?id=${s.id}`,
              time: s.updatedAt,
            });
          }
          // CEO: pending approval
          if (role === 'CEO' && s.status === 'PENDING_CEO') {
            items.push({
              id: s.id,
              title: 'CEO Approval Required',
              subtitle: `${s.submissionNo} — ${s.formName || 'Lease Agreement'}`,
              type: 'approval',
              route: `/form${s.formId || 2}/ceo?id=${s.id}`,
              time: s.updatedAt,
            });
          }
          // Finance: completed submissions to view
          if (role === 'FINANCE' && s.status === 'PENDING_LEGAL_GM_FINAL') {
            items.push({
              id: s.id,
              title: 'New Submission',
              subtitle: `${s.submissionNo} — Available for review`,
              type: 'info',
              route: `/finance?id=${s.id}`,
              time: s.updatedAt,
            });
          }
          // Court Officer: assigned submissions
          if (role === 'COURT_OFFICER' && s.status === 'PENDING_COURT_OFFICER' && s.courtOfficerId === session?.user?.id) {
            items.push({
              id: s.id,
              title: 'Action Required',
              subtitle: `${s.submissionNo} — Court Action Needed`,
              type: 'approval',
              route: `/form${s.formId || 3}/court-officer?id=${s.id}`,
              time: s.updatedAt,
            });
          }
          // Legal Officer: active submissions
          if (role === 'LEGAL_OFFICER' && s.status === 'PENDING_LEGAL_OFFICER' && s.assignedLegalOfficer === session?.user?.email) {
            items.push({
              id: s.id,
              title: 'Action Required',
              subtitle: `${s.submissionNo} — In Progress`,
              type: 'info',
              route: `/form${s.formId || 1}/legal-officer?stage=ACTIVE&id=${s.id}`,
              time: s.updatedAt,
            });
          }
          // Special Approver
          if (role === 'SPECIAL_APPROVER' && s.status === 'PENDING_SPECIAL_APPROVER') {
            const mine = s.specialApprovers?.find((a: any) => a.approverEmail === session?.user?.email && a.status === 'PENDING');
            if (mine) {
              items.push({
                id: s.id,
                title: 'Special Approval Needed',
                subtitle: `${s.submissionNo} — ${s.title}`,
                type: 'approval',
                route: `/form${s.formId || 1}/special-approver?id=${s.id}`,
                time: s.updatedAt,
              });
            }
          }
        }
        setNotifs(items);
      })
      .catch(() => {});
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [role, userId, session?.user?.email]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const iconColor = (type: Notif['type']) =>
    type === 'approval' ? 'bg-yellow-400' : type === 'resubmit' ? 'bg-orange-400' : 'bg-blue-400';

  const Icon = (type: Notif['type']) =>
    type === 'approval' ? <Clock className="w-3 h-3 text-white" /> :
    type === 'resubmit' ? <RotateCcw className="w-3 h-3 text-white" /> :
    <AlertCircle className="w-3 h-3 text-white" />;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-full h-10 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"
      >
        <Bell className="w-[18px] h-[18px]" />
        {notifs.length > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] flex items-center justify-center text-white font-bold">
            {notifs.length > 9 ? '9+' : notifs.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-[84px] top-4 w-72 rounded-2xl shadow-2xl overflow-hidden z-[9999] border border-white/10"
          style={{ background: 'linear-gradient(160deg, #0f2240 0%, #17293E 100%)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-white/70" />
              <span className="text-white font-bold text-sm">Notifications</span>
              {notifs.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{notifs.length}</span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="w-8 h-8 text-white/20" />
                <p className="text-white/40 text-xs font-medium">All caught up!</p>
              </div>
            ) : (
              notifs.map((n) => (
                <button key={n.id} onClick={() => { setOpen(false); router.push(n.route); }}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 text-left group">
                  <div className={`w-6 h-6 rounded-full ${iconColor(n.type)} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    {Icon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[12px] font-semibold leading-tight">{n.title}</p>
                    <p className="text-white/50 text-[11px] truncate mt-0.5">{n.subtitle}</p>
                    <p className="text-white/30 text-[10px] mt-1 font-mono">{timeAgo(n.time)}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/60 flex-shrink-0 mt-1 transition-colors" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
