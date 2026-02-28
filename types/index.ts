// User Roles - Flexible for future additions
export type UserRole = string; // Allows any role to be added dynamically

// Core roles used in the system
export const CORE_ROLES = {
  INITIATOR: 'INITIATOR',
  BUM: 'BUM',
  FBP: 'FBP',
  CLUSTER_HEAD: 'CLUSTER_HEAD',
  LEGAL_GM: 'LEGAL_GM',
  LEGAL_OFFICER: 'LEGAL_OFFICER',
  SPECIAL_APPROVER: 'SPECIAL_APPROVER',
  FINANCE: 'FINANCE',
  ADMIN: 'ADMIN',
} as const;

// Helper to check if a role is valid
export const isValidRole = (role: string): boolean => {
  return Object.values(CORE_ROLES).includes(role as any);
};

// Request Status
export type RequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SENT_BACK'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

// Approval Status
export type ApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SENT_BACK'
  | 'CANCELLED';

// Party Types
export type PartyType =
  | 'Company'
  | 'Partnership'
  | 'Sole Proprietorship'
  | 'Individual';

// Document Review Status
export type DocumentReviewStatus =
  | 'PENDING'
  | 'OK'
  | 'ATTENTION_NEEDED'
  | 'RESUBMIT';

// SLA Status
export type SLAStatus =
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'OVERDUE';

// User type
export interface User {
  id: string;
  email: string;
  name: string | null;
  department: string | null;
  role: UserRole;
  isActive: boolean;
}