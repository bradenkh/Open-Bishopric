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

// ── Meetings & agendas ─────────────────────────────────────────────────────────

export type MeetingType = "bishopric" | "sacrament_meeting" | "ward_council";

export type MeetingStatus = "upcoming" | "completed" | "cancelled";

/** A single line item on a meeting agenda. */
export interface AgendaItem {
  id: string;
  title: string;
  /** Who is presenting / responsible for the item. */
  presenter?: string;
  /** Estimated minutes for the item. */
  durationMins?: number;
  notes?: string;
  /** Checked off during/after the meeting. */
  done?: boolean;
}

// ── Sacrament meeting program ────────────────────────────────────────────────

/** The kind of a single step in a sacrament meeting program. */
export type ProgramItemKind =
  | "hymn"
  | "prayer"
  | "sacrament"
  | "testimony"
  | "business"
  | "announcements"
  | "speaker"
  | "musical_number"
  | "other";

export const PROGRAM_KIND_LABELS: Record<ProgramItemKind, string> = {
  hymn:           "Hymn",
  prayer:         "Prayer",
  sacrament:      "Sacrament",
  testimony:      "Testimonies",
  business:       "Ward Business",
  announcements:  "Announcements",
  speaker:        "Speaker",
  musical_number: "Musical Number",
  other:          "Other",
};

/** A single ordered step in a sacrament meeting program. */
export interface ProgramItem {
  id: string;
  kind: ProgramItemKind;
  /** Position/role label, e.g. "Opening Hymn", "Invocation", "Youth Speaker". */
  label?: string;
  /** Person responsible: speaker, prayer giver, performer. */
  person?: string;
  /** Hymn number (hymn items). */
  hymnNumber?: string;
  /** Secondary text: hymn title, speaker topic, musical-number title. */
  topic?: string;
  notes?: string;
  /** For announcement items: the running announcements pulled into this meeting. */
  announcementIds?: string[];
  /** Checked off during the meeting. */
  done?: boolean;
}

/** The structured order of service for a sacrament meeting. */
export interface SacramentProgram {
  presiding?: string;
  conducting?: string;
  chorister?: string;
  organist?: string;
  /** Spiritual thought / quote printed on the bulletin. */
  quote?: string;
  /** Attribution for the quote, e.g. "President Oaks". */
  quoteBy?: string;
  items: ProgramItem[];
}

export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** 24-hour time string (HH:MM). */
  time?: string;
  location?: string;
  status: MeetingStatus;
  /** Free-form agenda — used by bishopric & ward council meetings. */
  agenda: AgendaItem[];
  /** Structured order of service — used by sacrament meetings. */
  program?: SacramentProgram;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  bishopric:         "Bishopric",
  sacrament_meeting: "Sacrament Meeting",
  ward_council:      "Ward Council",
};

export const MEETING_STATUS_COLORS: Record<MeetingStatus, string> = {
  upcoming:  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

// ── Announcements ────────────────────────────────────────────────────────────

/**
 * A reusable ward announcement. Lives in a running list and is read at the
 * pulpit during sacrament meeting. Recurring announcements stay on the list
 * week to week until archived or expired.
 */
export interface Announcement {
  id: string;
  title: string;
  details?: string;
  /** Optional date the announcement first becomes relevant (YYYY-MM-DD). */
  startDate?: string;
  /** Optional date after which it drops off the active list (YYYY-MM-DD). */
  expiresOn?: string;
  /** Manually retired regardless of expiry. */
  archived?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Ward identity (bulletin letterhead) ──────────────────────────────────────

export interface WardLeader {
  name: string;
  role: string;
  phone?: string;
}

/** Standing ward details printed on every sacrament meeting bulletin. */
export interface WardInfo {
  wardName: string;
  churchName: string;
  stake: string;
  address: string;
  /** Heading for the meeting, e.g. "Schenectady Sacrament Meeting". */
  meetingTitle: string;
  /** Display time, e.g. "9 a.m.". */
  meetingTime: string;
  /** What happens in the second hour, e.g. "Sunday School". */
  secondHour: string;
  leadership: WardLeader[];
  /** Free-text note about appointments / submitting announcements. */
  submissionNote: string;
}

// ── Interviews ─────────────────────────────────────────────────────────────────

export type InterviewType =
  | "temple_recommend"
  | "temple_recommend_youth"
  | "calling"
  | "ministering"
  | "tithing_settlement"
  | "youth"
  | "worthiness"
  | "other";

export type InterviewStatus = "needs_scheduling" | "scheduled" | "completed" | "cancelled";

export interface Interview {
  id: string;
  memberName: string;
  memberId?: string;
  type: InterviewType;
  status: InterviewStatus;
  /** Bishopric member conducting the interview. */
  interviewer?: string;
  /** ISO date string (YYYY-MM-DD) — present once scheduled. */
  scheduledDate?: string;
  /** 24-hour time string (HH:MM) — present once scheduled. */
  scheduledTime?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  temple_recommend:       "Temple Recommend",
  temple_recommend_youth: "Youth Temple Recommend",
  calling:                "Calling",
  ministering:            "Ministering",
  tithing_settlement:     "Tithing Settlement",
  youth:                  "Youth Interview",
  worthiness:             "Worthiness",
  other:                  "Other",
};

export const INTERVIEW_STATUS_COLORS: Record<InterviewStatus, string> = {
  needs_scheduling: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  scheduled:        "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed:        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled:        "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

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
