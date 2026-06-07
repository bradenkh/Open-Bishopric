export type UserRole = "bishop" | "counselor" | "clerk" | "exec-secretary";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;
}

// ── Bishopric roster ─────────────────────────────────────────────────────────

export type BishopricRole = "bishop" | "counselor" | "clerk" | "exec_secretary";

export interface BishopricMember {
  id: string;
  name: string;
  role: BishopricRole;
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
  /**
   * Extra metadata. For calling tasks:
   *   callingId    — links back to the Calling record
   *   taskType     — "extend" | "set_apart" | "lcr_update"
   *   position     — calling position name
   *   setApartDate — ISO date string (set_apart tasks only)
   *   setApartBy   — who set them apart (set_apart tasks only)
   */
  context?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Calling lifecycle ────────────────────────────────────────────────────────

/**
 * The ordered pipeline every calling moves through.
 *
 *   needs_release → vacant → extending → accepted
 *     → sustaining → sustained → set_apart → lcr_updated → recorded
 *
 * Candidates are suggested during needs_release / vacant; once one is chosen a
 * counselor is assigned to extend. A decline resets the position to vacant.
 */
export type CallingStage =
  | "needs_release" // Current holder needs to be released (creates the vacancy)
  | "vacant"      // Position open — suggest candidates, then extend
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
  "needs_release",
  "vacant",
  "extending",
  "accepted",
  "sustaining",
  "sustained",
  "set_apart",
  "lcr_updated",
  "recorded",
];

export const CALLING_STAGES: { stage: CallingStage; label: string }[] = [
  { stage: "needs_release", label: "Needs Release" },
  { stage: "vacant",      label: "Vacant" },
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

  // ── Release (needs_release stage)
  /** Names suggested to replace the current holder. */
  suggestedReplacements?: string[];
  /** The suggested replacement chosen to fill the position once released. */
  replacementName?: string;
  /** The person who held the calling before this one (set when released). */
  releasedName?: string;

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

// ── Calling roster (full org chart) ───────────────────────────────────────────

/**
 * A single position in the ward's standing roster (as shown in LCR's
 * "Organizations and Callings" report). Used by the Chart view to give the
 * bishopric an at-a-glance picture of who holds what and where the holes are.
 */
export interface RosterEntry {
  position: string;
  /** Omitted = vacant. Stored "Last, First" exactly as LCR displays it. */
  member?: string;
  /** Sustained date string, shown verbatim (e.g. "2 Mar 2025"). */
  sustained?: string;
  /** True when set apart (the ✓ column in LCR). */
  setApart?: boolean;
  /** True for ward-defined custom callings (marked * in LCR). */
  custom?: boolean;
}

export interface RosterGroup {
  /** Top-level organization, e.g. "Elders Quorum". */
  org: string;
  /** Optional sub-section within the organization, e.g. "Presidency". */
  subOrg?: string;
  entries: RosterEntry[];
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
