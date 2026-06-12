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
 *   needs_calling → needs_release → extending
 *     → sustaining → set_apart → lcr_update → recorded
 *
 * Candidates are suggested during needs_calling / needs_release; once one is
 * chosen a counselor is assigned to extend. When the person accepts, the card
 * jumps straight to sustaining and is added to the sacrament-meeting business
 * items. A decline resets the position to needs_calling.
 */
export type CallingStage =
  | "needs_calling" // Open position / person who needs a calling — suggest a candidate, then extend
  | "needs_release" // Current holder needs to be released (creates the vacancy)
  | "extending"   // Bishopric member reaching out to extend
  | "sustaining"  // Accepted — to be sustained in sacrament meeting (auto-added to business items)
  | "set_apart"   // Sustained — awaiting a bishopric member to confirm the setting apart
  | "lcr_update"  // Set apart — awaiting the ward clerk to update Leader & Clerk Resources
  | "recorded";   // Updated in LCR — fully complete / archived

export type SustainedVenue = "sacrament_meeting" | "class";

/** Ordered list used for pipeline display and progress math. */
export const CALLING_PIPELINE: CallingStage[] = [
  "needs_calling",
  "needs_release",
  "extending",
  "sustaining",
  "set_apart",
  "lcr_update",
  "recorded",
];

export const CALLING_STAGES: { stage: CallingStage; label: string }[] = [
  { stage: "needs_calling", label: "Needs Calling" },
  { stage: "needs_release", label: "Needs Release" },
  { stage: "extending",   label: "Extending" },
  { stage: "sustaining",  label: "To Be Sustained" },
  { stage: "set_apart",   label: "Set Apart" },
  { stage: "lcr_update",  label: "Update LCR" },
  { stage: "recorded",    label: "Sustained in LCR" },
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
  /** Bishopric member assigned to inform the outgoing holder of their release. */
  releasedBy?: string;

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

/** What happened to an agenda item when the meeting was run (meeting mode). */
export type AgendaOutcome = "completed" | "carried";

/** A single line item on a meeting agenda. */
export interface AgendaItem {
  id: string;
  title: string;
  /** Who is presenting / responsible for the item. */
  presenter?: string;
  /** Estimated minutes for the item. */
  durationMins?: number;
  notes?: string;
  /** Checked off during/after the meeting (build-mode quick toggle). */
  done?: boolean;
  /** The section heading this item lives under (see AGENDA_SECTIONS). */
  section?: string;
  /**
   * Meeting-mode disposition: "completed" (handled this meeting) or "carried"
   * (carry forward to the next meeting of the same type).
   */
  outcome?: AgendaOutcome;
  /**
   * Where the item came from — an organization name, a leader's name, or
   * "carried" when it was carried forward from a previous meeting.
   */
  source?: string;
  /** Id of the meeting this item was carried into (prevents double-carry). */
  carriedInto?: string;
}

// ── Sacrament meeting program (bulletin JSON) ────────────────────────────────

/**
 * One row of the bulletin's order-of-service table. Intentionally generic so
 * a meeting can be anything (4 talks, an all-music program, etc.) and so an
 * AI agent can emit arbitrary rows.
 *
 *   - `value` empty  → the row prints full-width and centered (e.g. the
 *                       sacrament anchor, "Bearing of Testimonies").
 *   - `value` set    → two columns: `label` on the left, `value` on the right
 *                       (e.g. "Opening Hymn" → "#139, 'In Fasting We Approach Thee'").
 */
export interface BulletinRow {
  id: string;
  label: string;
  value?: string;
  /** The Administration of the Sacrament anchor — fixed, cannot be deleted. */
  anchor?: boolean;
}

/**
 * The bulletin data for a single sacrament meeting (everything except
 * announcements). This is the JSON persisted in the DB and the shape the
 * future AI agent produces — see `parseBulletin` in `lib/bulletin.ts`.
 */
export interface SacramentProgram {
  presiding?: string;
  conducting?: string;
  chorister?: string;
  organist?: string;
  /** What happens in the second hour, e.g. "Sunday School". Optional. */
  secondHour?: string;
  /** Spiritual thought / quote printed on the bulletin. */
  quote?: string;
  /** Attribution for the quote, e.g. "President Oaks". */
  quoteBy?: string;
  rows: BulletinRow[];
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
  /**
   * Ordered section headings for the agenda (bishopric & ward council). Seeded
   * from AGENDA_SECTIONS when the meeting is created; items reference these via
   * AgendaItem.section.
   */
  sections?: string[];
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

// ── Pre-meeting agenda collection ─────────────────────────────────────────────

export type SolicitationStatus = "draft" | "sent" | "replied";

/**
 * A request to an organization leader to review their items before a meeting —
 * they keep or dismiss last meeting's items and add new ones. One row per
 * (meeting, organization). The assistant parses replies into agenda items.
 *
 * NOTE: live email send + inbound reply parsing are not wired yet — sending is a
 * manual action (mailto/copy) and replies are pasted into the AI assistant. See
 * the "deferred" seams in collect-items.tsx / agent tools.
 */
export interface AgendaSolicitation {
  id: string;
  /** The meeting being prepared. */
  meetingId: string;
  /** Organization / role label, e.g. "Relief Society". */
  org: string;
  leaderName: string;
  leaderEmail?: string;
  status: SolicitationStatus;
  /** Prior items offered to the leader to keep or dismiss. */
  carriedItems: AgendaItem[];
  /** The composed message body (editable before sending). */
  message?: string;
  /** Raw reply text (pasted in, or future inbound email). */
  replyText?: string;
  sentAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Announcements ────────────────────────────────────────────────────────────

/**
 * A ward announcement, stored as its own DB row. It is automatically included
 * on the bulletin until its event `date` has passed; announcements with no
 * date are standing and stay until archived.
 */
export interface Announcement {
  id: string;
  title: string;
  description?: string;
  /** Event date (YYYY-MM-DD). The announcement auto-drops once this is past. */
  date?: string;
  /** Event time (HH:MM). */
  time?: string;
  location?: string;
  /** Manually retired regardless of date. */
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

/**
 * The pipeline an interview moves through.
 *
 *   schedule_any | schedule_bishop → pending_confirmation → scheduled
 *     → date_passed → completed
 *
 * An interview starts in one of the two "schedule" columns — chosen when it's
 * created — depending on whether anyone in the bishopric can conduct it or it
 * must be the bishop. Once a slot is booked it sits in `pending_confirmation`
 * until both the attendee and the bishopric member have confirmed, then it
 * becomes `scheduled`. After the date passes it drops into `date_passed` so the
 * bishopric can confirm it happened or send it back to be rescheduled.
 */
export type InterviewStage =
  | "schedule_any"         // Needs scheduling — any bishopric member may conduct
  | "schedule_bishop"      // Needs scheduling — must be with the bishop
  | "pending_confirmation" // Slot booked — awaiting confirmation from both sides
  | "scheduled"            // Confirmed by both; still upcoming
  | "date_passed"          // Scheduled date has passed — confirm it happened or reschedule
  | "completed";           // Interview held

/** Ordered list used for the kanban board and progress math. */
export const INTERVIEW_PIPELINE: InterviewStage[] = [
  "schedule_any",
  "schedule_bishop",
  "pending_confirmation",
  "scheduled",
  "date_passed",
  "completed",
];

export const INTERVIEW_STAGES: { stage: InterviewStage; label: string }[] = [
  { stage: "schedule_any",         label: "Schedule" },
  { stage: "schedule_bishop",      label: "Schedule w/ Bishop" },
  { stage: "pending_confirmation", label: "Pending Confirmation" },
  { stage: "scheduled",            label: "Scheduled" },
  { stage: "date_passed",          label: "Date Passed" },
  { stage: "completed",            label: "Completed" },
];

export interface Interview {
  id: string;
  memberName: string;
  memberId?: string;
  type: InterviewType;
  stage: InterviewStage;
  /**
   * True when this interview must be conducted by the bishop. Chosen when the
   * interview is created (which "schedule" column it starts in) and preserved
   * so a cancelled / rescheduled interview returns to the right column.
   */
  requiresBishop?: boolean;
  /** Bishopric member conducting the interview. */
  interviewer?: string;
  /** Confirmation from the member being interviewed (pending_confirmation stage). */
  attendeeConfirmed?: boolean;
  /** Confirmation from the bishopric member conducting it (pending_confirmation stage). */
  interviewerConfirmed?: boolean;
  /** ISO date string (YYYY-MM-DD) — present once scheduled. */
  scheduledDate?: string;
  /** 24-hour time string (HH:MM) — present once scheduled. */
  scheduledTime?: string;
  /** Length of the appointment in minutes (defaults to the type's length). */
  durationMins?: number;
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

export const INTERVIEW_STAGE_COLORS: Record<InterviewStage, string> = {
  schedule_any:         "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  schedule_bishop:      "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200",
  pending_confirmation: "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200",
  scheduled:            "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200",
  date_passed:          "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200",
  completed:            "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200",
};

/** Default appointment length per interview type, in minutes. */
export const INTERVIEW_DURATION_MINS: Record<InterviewType, number> = {
  temple_recommend:       15,
  temple_recommend_youth: 10,
  calling:                10,
  ministering:            10,
  tithing_settlement:     10,
  youth:                  15,
  worthiness:             30,
  other:                  15,
};

// ── Interview availability ─────────────────────────────────────────────────────

export const WEEKDAY_LABELS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

/**
 * A recurring weekly window when a bishopric member can hold interviews —
 * e.g. "Bishop Anderson, Tuesdays 18:00–19:00". Sliced into bookable slots
 * sized to each interview's length.
 */
export interface AvailabilityBlock {
  id: string;
  memberId: string;
  memberName: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** 24-hour "HH:MM". */
  startTime: string;
  endTime: string;
}

/**
 * A date range when a member is unavailable (out of town, etc.), overriding
 * their recurring availability. Both endpoints inclusive (ISO YYYY-MM-DD).
 */
export interface AvailabilityException {
  id: string;
  memberId: string;
  memberName: string;
  startDate: string;
  endDate: string;
  reason?: string;
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
  /** Hidden from the Chart view via calling settings. Still kept in the roster. */
  hidden?: boolean;
}

export interface RosterGroup {
  /** DB row id. Present on persisted rosters; absent for in-memory mock data. */
  id?: string;
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
