export type UserRole = "bishop" | "counselor" | "clerk" | "exec-secretary";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;
}

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  householdId?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskType =
  | "interview"
  | "follow_up"
  | "contact"
  | "todo"
  | "calling"
  | "agenda_item"
  | "announcement"
  | "general";

export type TaskStatus = "active" | "in_progress" | "waiting" | "completed" | "cancelled";

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  assigneeId?: string;
  assigneeName?: string;
  memberId?: string;
  memberName?: string;
  dueDate?: string;
  context?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Calling lifecycle ────────────────────────────────────────────────────────

/**
 * The ordered pipeline every calling moves through.
 *
 *   vacant → discussing → approved → extending → accepted
 *     → sustaining → sustained → set_apart → lcr_updated → recorded
 *
 * "declined" is not a stage; a decline resets to vacant/discussing.
 */
export type CallingStage =
  | "vacant"      // Position open, no candidate yet
  | "discussing"  // Bishopric discussing / selecting a candidate
  | "approved"    // Candidate approved by bishopric
  | "extending"   // Bishopric member reaching out to extend
  | "accepted"    // Person accepted the calling
  | "sustaining"  // Scheduled for sustaining vote
  | "sustained"   // Sustained in sacrament meeting or class
  | "set_apart"   // Set apart by priesthood leader
  | "lcr_updated" // Updated in Leader & Clerk Resources
  | "recorded";   // Fully complete / archived

export type SustainedVenue = "sacrament_meeting" | "class";

/** Ordered list used for pipeline display and progress math. */
export const CALLING_PIPELINE: CallingStage[] = [
  "vacant",
  "discussing",
  "approved",
  "extending",
  "accepted",
  "sustaining",
  "sustained",
  "set_apart",
  "lcr_updated",
  "recorded",
];

export const CALLING_STAGES: { stage: CallingStage; label: string }[] = [
  { stage: "vacant",      label: "Vacant" },
  { stage: "discussing",  label: "Discussing" },
  { stage: "approved",    label: "Approved" },
  { stage: "extending",   label: "Extending" },
  { stage: "accepted",    label: "Accepted" },
  { stage: "sustaining",  label: "To Be Sustained" },
  { stage: "sustained",   label: "Sustained" },
  { stage: "set_apart",   label: "Set Apart" },
  { stage: "lcr_updated", label: "LCR Updated" },
  { stage: "recorded",    label: "Complete" },
];

export interface Calling {
  id: string;
  /** Absent for vacant callings. */
  memberId?: string;
  /** Absent for vacant callings. */
  memberName?: string;
  position: string;
  organization?: string;
  stage: CallingStage;
  notes?: string;

  // ── Approval
  approvedBy?: string;
  approvedAt?: string;

  // ── Extension
  extendedBy?: string;
  extendedAt?: string;

  // ── Decline metadata (stored on calling even when stage resets)
  declineReason?: string;
  declinedAt?: string;

  // ── Sustaining
  sustainedIn?: SustainedVenue;
  sustainedDate?: string;
  /** True once this has been added to the sacrament-meeting business-items doc. */
  businessItemAdded?: boolean;

  // ── Set apart
  setApartBy?: string;
  setApartDate?: string;

  // ── LCR
  lcrUpdated?: boolean;
  lcrUpdatedAt?: string;
  lcrUpdatedBy?: string;

  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Misc constants ───────────────────────────────────────────────────────────

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  interview:    "Interview",
  follow_up:    "Follow Up",
  contact:      "Contact",
  todo:         "To Do",
  calling:      "Calling",
  agenda_item:  "Agenda Item",
  announcement: "Announcement",
  general:      "General",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  active:     "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress:"bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  waiting:    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  completed:  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled:  "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};
