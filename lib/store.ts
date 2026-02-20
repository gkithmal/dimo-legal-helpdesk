import { create } from 'zustand';

export type UserRole =
  | 'INITIATOR'
  | 'APPROVER_BUM'
  | 'APPROVER_FBP'
  | 'APPROVER_CLUSTER_HEAD'
  | 'LEGAL_GM'
  | 'LEGAL_OFFICER'
  | 'SPECIAL_APPROVER';

export type LegalGMStage = 'INITIAL_REVIEW' | 'FINAL_APPROVAL';
export type LOStage = 'PENDING_GM' | 'REASSIGNED' | 'ACTIVE' | 'POST_GM_APPROVAL';

export type Submission = {
  id: string;
  submissionNo: string;
  formId: number;
  formName: string;
  status: string;
  formData: Record<string, any>;
  assignedLegalOfficer: { name: string; email: string } | null;
  legalOfficerStarted: boolean;
  specialApprovers: { id: string; department: string; email: string }[];
  createdAt: string;
  updatedAt: string;
};

type AppState = {
  currentRole: UserRole;
  currentUser: { name: string; email: string; department?: string };
  activeSubmission: Submission | null;
  legalGMStage: LegalGMStage;
  loStage: LOStage;
  submissions: Submission[];
  setCurrentRole: (role: UserRole) => void;
  setCurrentUser: (user: { name: string; email: string; department?: string }) => void;
  setActiveSubmission: (s: Submission | null) => void;
  setLegalGMStage: (stage: LegalGMStage) => void;
  setLOStage: (stage: LOStage) => void;
  updateSubmissionStatus: (id: string, status: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  currentRole: 'INITIATOR',
  currentUser: { name: 'Oliva Perera', email: 'oliva.perera@dimolanka.com' },
  activeSubmission: null,
  legalGMStage: 'INITIAL_REVIEW',
  loStage: 'PENDING_GM',
  submissions: [],
  setCurrentRole: (role) => set({ currentRole: role }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setActiveSubmission: (s) => set({ activeSubmission: s }),
  setLegalGMStage: (stage) => set({ legalGMStage: stage }),
  setLOStage: (stage) => set({ loStage: stage }),
  updateSubmissionStatus: (id, status) =>
    set((state) => ({
      submissions: state.submissions.map((s) =>
        s.id === id ? { ...s, status } : s
      ),
    })),
}));
