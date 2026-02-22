export const ROUTES = {
  LOGIN: '/login',
  HOME: '/home',
  LEGAL_GM_HOME: '/legal-gm-home',
  SETTINGS: '/settings',
  FINANCE: '/finance',
  FORM1: {
    INITIATOR: '/form1',
    APPROVAL: '/form1/approval',
    LEGAL_GM_INITIAL: '/form1/legal-gm?stage=INITIAL_REVIEW',
    LEGAL_GM_FINAL: '/form1/legal-gm?stage=FINAL_APPROVAL',
    LEGAL_OFFICER_PENDING: '/form1/legal-officer?stage=PENDING_GM',
    LEGAL_OFFICER_REASSIGNED: '/form1/legal-officer?stage=REASSIGNED',
    LEGAL_OFFICER_ACTIVE: '/form1/legal-officer?stage=ACTIVE',
    LEGAL_OFFICER_POST: '/form1/legal-officer?stage=POST_GM_APPROVAL',
    SPECIAL_APPROVER: '/special-approver-home',
  },
} as const;

export function getHomeRoute(role: string): string {
  if (role === 'LEGAL_GM') return ROUTES.LEGAL_GM_HOME;
  if (role === 'FINANCE') return ROUTES.FINANCE;
  if (role === 'SPECIAL_APPROVER') return ROUTES.FORM1.SPECIAL_APPROVER;
  return ROUTES.HOME;
}
