/**
 * Static mock data used in place of Firebase while the backend is stripped out.
 * All IDs are deterministic strings so they survive HMR refreshes.
 */
import type { BishopricMember, Calling, Task, Member, Meeting, Interview, Announcement, RosterEntry, RosterGroup, AvailabilityBlock, AvailabilityException } from "@/types";

// ── Bishopric roster ──────────────────────────────────────────────────────────

export const MOCK_BISHOPRIC_MEMBERS: BishopricMember[] = [
  { id: "bm1", name: "Bishop Anderson",     role: "bishop" },
  { id: "bm2", name: "Counselor Hughes",    role: "counselor" },
  { id: "bm3", name: "Counselor Davis",     role: "counselor" },
  { id: "bm4", name: "Mark Williams",       role: "clerk" },       // ward clerk
  { id: "bm5", name: "Bro. Peterson",       role: "exec_secretary" },
];

// ── Members ───────────────────────────────────────────────────────────────────

export const MOCK_MEMBERS: Member[] = [
  { id: "m01", firstName: "James",    lastName: "Anderson",  email: "james.anderson@email.com",  phone: "801-555-0101", address: "142 Maple St",   isActive: true, notes: "",                         createdAt: "2025-09-01T00:00:00Z", updatedAt: "2025-09-01T00:00:00Z" },
  { id: "m02", firstName: "Sarah",    lastName: "Mitchell",  email: "sarah.mitchell@email.com",   phone: "801-555-0102", address: "87 Oak Ave",     isActive: true, notes: "",                         createdAt: "2025-09-01T00:00:00Z", updatedAt: "2025-09-01T00:00:00Z" },
  { id: "m03", firstName: "Thomas",   lastName: "Hughes",    email: "thomas.hughes@email.com",    phone: "801-555-0103", address: "214 Pine Rd",    isActive: true, notes: "",                         createdAt: "2025-09-01T00:00:00Z", updatedAt: "2025-09-01T00:00:00Z" },
  { id: "m04", firstName: "Rebecca",  lastName: "Torres",    email: "rebecca.torres@email.com",   phone: "801-555-0104", address: "33 Cedar Ln",    isActive: true, notes: "Recently moved in",        createdAt: "2025-10-15T00:00:00Z", updatedAt: "2025-10-15T00:00:00Z" },
  { id: "m05", firstName: "David",    lastName: "Park",      email: "david.park@email.com",       phone: "801-555-0105", address: "519 Birch Blvd", isActive: true, notes: "",                         createdAt: "2025-09-01T00:00:00Z", updatedAt: "2025-09-01T00:00:00Z" },
  { id: "m06", firstName: "Anna",     lastName: "Martinez",  email: "anna.martinez@email.com",    phone: "801-555-0106", address: "8 Elm Court",    isActive: true, notes: "",                         createdAt: "2025-09-01T00:00:00Z", updatedAt: "2025-09-01T00:00:00Z" },
  { id: "m07", firstName: "Mark",     lastName: "Williams",  email: "mark.williams@email.com",    phone: "801-555-0107", address: "77 Aspen Way",   isActive: true, notes: "",                         createdAt: "2025-09-01T00:00:00Z", updatedAt: "2025-09-01T00:00:00Z" },
  { id: "m08", firstName: "Jennifer", lastName: "Kim",       email: "jennifer.kim@email.com",     phone: "801-555-0108", address: "302 Willow Dr",  isActive: true, notes: "",                         createdAt: "2025-09-01T00:00:00Z", updatedAt: "2025-09-01T00:00:00Z" },
  { id: "m09", firstName: "Robert",   lastName: "Johnson",   email: "robert.johnson@email.com",   phone: "801-555-0109", address: "91 Spruce St",   isActive: true, notes: "",                         createdAt: "2025-09-01T00:00:00Z", updatedAt: "2025-09-01T00:00:00Z" },
  { id: "m10", firstName: "Emily",    lastName: "Chen",      email: "emily.chen@email.com",       phone: "801-555-0110", address: "445 Fir Ave",    isActive: true, notes: "",                         createdAt: "2025-11-01T00:00:00Z", updatedAt: "2025-11-01T00:00:00Z" },
  { id: "m11", firstName: "Michael",  lastName: "Davis",     email: "michael.davis@email.com",    phone: "801-555-0111", address: "18 Poplar Ct",   isActive: true, notes: "Ward mission leader candidate", createdAt: "2025-09-01T00:00:00Z", updatedAt: "2025-09-01T00:00:00Z" },
  { id: "m12", firstName: "Linda",    lastName: "Brown",     email: "linda.brown@email.com",      phone: "801-555-0112", address: "629 Sequoia Ln", isActive: true, notes: "",                         createdAt: "2025-09-01T00:00:00Z", updatedAt: "2026-01-10T00:00:00Z" },
];

// ── Callings ──────────────────────────────────────────────────────────────────
// Spread across all lifecycle stages so every kanban column has something.
// Thomas Hughes (c07) is in "sustaining" for sacrament meeting without
// businessItemAdded — this deliberately triggers the business-items banner.

export const MOCK_CALLINGS: Calling[] = [
  // ── Needs release (current holder being moved out) ──────────────────────────
  {
    id: "c00a",
    memberId: "m04",
    memberName: "Andrew Olson",
    position: "Elders Quorum Secretary",
    organization: "Elders Quorum",
    stage: "needs_release",
    suggestedReplacements: ["David Park", "Thomas Hughes"],
    notes: "Moving out of the ward this summer.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "c00b",
    memberId: "m08",
    memberName: "Richard Gagne",
    position: "Sunday School Teacher",
    organization: "Sunday School",
    stage: "needs_release",
    suggestedReplacements: ["Michael Davis", "James Anderson"],
    replacementName: "Michael Davis",
    notes: "Has served faithfully for 3 years — ready for a change.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-28T00:00:00Z",
    updatedAt: "2026-05-28T00:00:00Z",
  },

  // ── Vacant positions ──────────────────────────────────────────────────────
  {
    id: "c01",
    position: "Primary President",
    organization: "Primary",
    stage: "vacant",
    notes: "Previous president moved out of ward last month",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-10T00:00:00Z",
    updatedAt: "2026-05-10T00:00:00Z",
  },
  {
    id: "c02",
    position: "Young Women President",
    organization: "Young Women",
    stage: "vacant",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-20T00:00:00Z",
    updatedAt: "2026-05-20T00:00:00Z",
  },

  // ── Vacant with suggested candidates ──────────────────────────────────────
  {
    id: "c03",
    memberId: "",
    memberName: "",
    position: "Sunday School Teacher",
    organization: "Sunday School",
    stage: "vacant",
    suggestedReplacements: ["Sarah Mitchell", "Anna Martinez"],
    notes: "Sarah has teaching experience, available Sundays",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-18T00:00:00Z",
    updatedAt: "2026-05-18T00:00:00Z",
  },

  // ── Extending ─────────────────────────────────────────────────────────────
  {
    id: "c05",
    memberId: "m04",
    memberName: "Rebecca Torres",
    position: "Relief Society Secretary",
    organization: "Relief Society",
    stage: "extending",
    extendedBy: "Counselor Hughes",
    extendedAt: "2026-05-21T14:00:00Z",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-14T00:00:00Z",
    updatedAt: "2026-05-21T14:00:00Z",
  },

  // ── Accepted ──────────────────────────────────────────────────────────────
  {
    id: "c06",
    memberId: "m05",
    memberName: "David Park",
    position: "Young Men Advisor",
    organization: "Young Men",
    stage: "accepted",
    extendedBy: "Bishop Anderson",
    extendedAt: "2026-05-14T00:00:00Z",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-10T00:00:00Z",
    updatedAt: "2026-05-14T00:00:00Z",
  },

  // ── Sustaining (sacrament meeting — NO business item yet → triggers banner)
  {
    id: "c07",
    memberId: "m03",
    memberName: "Thomas Hughes",
    position: "Ward Mission Leader",
    organization: "Ward Mission",
    stage: "sustaining",
    extendedBy: "Bishop Anderson",
    extendedAt: "2026-05-08T00:00:00Z",
    sustainedIn: "sacrament_meeting",
    sustainedDate: "2026-06-01",
    businessItemAdded: false,           // ← deliberate: triggers the banner
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
  },

  // ── Sustained ─────────────────────────────────────────────────────────────
  {
    id: "c08",
    memberId: "m06",
    memberName: "Anna Martinez",
    position: "Young Women Advisor",
    organization: "Young Women",
    stage: "sustained",
    extendedBy: "Counselor Davis",
    extendedAt: "2026-04-22T00:00:00Z",
    sustainedIn: "class",
    sustainedDate: "2026-05-11",
    businessItemAdded: true,
    createdBy: "mock-bishop-001",
    createdAt: "2026-04-18T00:00:00Z",
    updatedAt: "2026-05-11T00:00:00Z",
  },

  // ── Set Apart (LCR not updated yet) ───────────────────────────────────────
  {
    id: "c09",
    memberId: "m07",
    memberName: "Mark Williams",
    position: "Ward Clerk",
    organization: "Ward Clerk",
    stage: "set_apart",
    extendedBy: "Bishop Anderson",
    extendedAt: "2026-04-13T00:00:00Z",
    sustainedIn: "sacrament_meeting",
    sustainedDate: "2026-04-20",
    businessItemAdded: true,
    setApartBy: "Bishop Anderson",
    setApartDate: "2026-04-20",
    createdBy: "mock-bishop-001",
    createdAt: "2026-04-08T00:00:00Z",
    updatedAt: "2026-04-20T00:00:00Z",
  },

  // ── LCR Updated (just needs to be archived) ───────────────────────────────
  {
    id: "c10",
    memberId: "m08",
    memberName: "Jennifer Kim",
    position: "Relief Society Teacher",
    organization: "Relief Society",
    stage: "lcr_updated",
    extendedBy: "Counselor Hughes",
    extendedAt: "2026-03-27T00:00:00Z",
    sustainedIn: "class",
    sustainedDate: "2026-04-06",
    businessItemAdded: true,
    setApartBy: "Counselor Hughes",
    setApartDate: "2026-04-06",
    lcrUpdated: true,
    lcrUpdatedBy: "Ward Clerk",
    lcrUpdatedAt: "2026-04-07T00:00:00Z",
    createdBy: "mock-bishop-001",
    createdAt: "2026-03-20T00:00:00Z",
    updatedAt: "2026-04-07T00:00:00Z",
  },

  // ── Complete / Recorded ───────────────────────────────────────────────────
  {
    id: "c11",
    memberId: "m09",
    memberName: "Robert Johnson",
    position: "Elders Quorum President",
    organization: "Elders Quorum",
    stage: "recorded",
    extendedBy: "Bishop Anderson",
    extendedAt: "2026-02-13T00:00:00Z",
    sustainedIn: "sacrament_meeting",
    sustainedDate: "2026-02-23",
    businessItemAdded: true,
    setApartBy: "Stake President",
    setApartDate: "2026-02-23",
    lcrUpdated: true,
    lcrUpdatedBy: "Ward Clerk",
    lcrUpdatedAt: "2026-02-24T00:00:00Z",
    createdBy: "mock-bishop-001",
    createdAt: "2026-02-05T00:00:00Z",
    updatedAt: "2026-02-24T00:00:00Z",
  },
];

// ── Meetings & agendas ──────────────────────────────────────────────────────────
// "Today" in this mock world is 2026-06-08.

export const MOCK_MEETINGS: Meeting[] = [
  {
    id: "mtg01",
    title: "Bishopric Meeting",
    type: "bishopric",
    date: "2026-06-14",
    time: "07:00",
    location: "Bishop's Office",
    status: "upcoming",
    agenda: [
      { id: "ai-01", title: "Opening prayer", presenter: "Counselor Davis", durationMins: 2, section: "Opening" },
      { id: "ai-02", title: "Review callings in progress", presenter: "Bishop Anderson", durationMins: 15, section: "Leadership & Callings" },
      { id: "ai-03", title: "Sacrament meeting business items", presenter: "Bro. Peterson", durationMins: 5, notes: "Thomas Hughes — Ward Mission Leader", section: "Upcoming Ordinances & Meetings" },
      { id: "ai-04", title: "Temple recommend interviews this week", presenter: "Counselor Hughes", durationMins: 10, section: "People" },
      { id: "ai-05", title: "Welfare needs", presenter: "Bishop Anderson", durationMins: 10, section: "People" },
    ],
    notes: "",
    createdBy: "mock-bishop-001",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "mtg02",
    title: "Ward Council",
    type: "ward_council",
    date: "2026-06-14",
    time: "08:00",
    location: "Relief Society Room",
    status: "upcoming",
    agenda: [
      { id: "ai-06", title: "Opening prayer & spiritual thought", presenter: "Counselor Hughes", durationMins: 5, section: "Opening" },
      { id: "ai-07", title: "Ministering report", presenter: "Relief Society President", durationMins: 10, section: "Ministering & Member Needs", source: "Relief Society" },
      { id: "ai-08", title: "Upcoming ward activity", presenter: "Activities Committee", durationMins: 15, section: "Upcoming Events & Calendar Coordination" },
      { id: "ai-09", title: "Primary summer activity budget", presenter: "Primary Presidency", durationMins: 10, notes: "Needs bishopric sign-off before June 10", section: "Organization Updates", source: "Primary" },
    ],
    notes: "",
    createdBy: "mock-bishop-001",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "mtg03",
    title: "Sacrament Meeting",
    type: "sacrament_meeting",
    date: "2026-06-14",
    time: "09:00",
    location: "Chapel",
    status: "upcoming",
    agenda: [],
    program: {
      presiding:  "Bishop Anderson",
      conducting: "Counselor Hughes",
      chorister:  "Sarah Mitchell",
      organist:   "Linda Brown",
      secondHour: "Sunday School",
      quote:      "The Lord did not make it easy, but he did make it possible.",
      quoteBy:    "President Oaks",
      rows: [
        { id: "r-01", label: "Opening Hymn",       value: "#19, 'We Thank Thee, O God, for a Prophet'" },
        { id: "r-02", label: "Invocation",         value: "David Park" },
        { id: "r-03", label: "Sacrament Hymn",     value: "#169, 'As Now We Take the Sacrament'" },
        { id: "r-04", label: "Administration of the Sacrament", anchor: true },
        { id: "r-05", label: "Youth Speaker",      value: "Emma Wilson" },
        { id: "r-06", label: "Musical Number",     value: "Primary Children, 'I Am a Child of God'" },
        { id: "r-07", label: "Concluding Speaker", value: "Michael Davis" },
        { id: "r-08", label: "Closing Hymn",       value: "#152, 'God Be with You Till We Meet Again'" },
        { id: "r-09", label: "Benediction",        value: "Rebecca Torres" },
      ],
    },
    notes: "",
    createdBy: "mock-bishop-001",
    createdAt: "2026-06-02T00:00:00Z",
    updatedAt: "2026-06-02T00:00:00Z",
  },
  {
    id: "mtg05",
    title: "Sacrament Meeting",
    type: "sacrament_meeting",
    date: "2026-06-21",
    time: "09:00",
    location: "Chapel",
    status: "upcoming",
    agenda: [],
    program: {
      presiding:  "Bishop Anderson",
      conducting: "Counselor Davis",
      chorister:  "Sarah Mitchell",
      organist:   "Linda Brown",
      rows: [
        { id: "r-11", label: "Opening Hymn",   value: "#2, 'The Spirit of God'" },
        { id: "r-12", label: "Invocation",     value: "Anna Martinez" },
        { id: "r-13", label: "Sacrament Hymn", value: "#181, 'Jesus of Nazareth, Savior and King'" },
        { id: "r-14", label: "Administration of the Sacrament", anchor: true },
        { id: "r-15", label: "Speaker",        value: "Jennifer Kim" },
        { id: "r-16", label: "Speaker",        value: "Robert Johnson" },
        { id: "r-17", label: "Closing Hymn",   value: "#85, 'How Firm a Foundation'" },
        { id: "r-18", label: "Benediction",    value: "David Park" },
      ],
    },
    notes: "",
    createdBy: "mock-bishop-001",
    createdAt: "2026-06-09T00:00:00Z",
    updatedAt: "2026-06-09T00:00:00Z",
  },
  {
    id: "mtg04",
    title: "Bishopric Meeting",
    type: "bishopric",
    date: "2026-06-07",
    time: "07:00",
    location: "Bishop's Office",
    status: "completed",
    agenda: [
      { id: "ai-12", title: "Opening prayer", presenter: "Bishop Anderson", durationMins: 2, done: true, outcome: "completed", section: "Opening" },
      { id: "ai-13", title: "Approve Emily Chen — Elders Quorum Secretary", presenter: "Bishop Anderson", durationMins: 10, done: true, outcome: "completed", section: "Leadership & Callings" },
      { id: "ai-14", title: "Plan tithing settlement schedule", presenter: "Mark Williams", durationMins: 15, outcome: "carried", notes: "Carry over to next week", section: "Upcoming Ordinances & Meetings" },
    ],
    notes: "Tithing settlement scheduling carried to next meeting.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-31T00:00:00Z",
    updatedAt: "2026-06-07T00:00:00Z",
  },
];

// ── Announcements ───────────────────────────────────────────────────────────
// Standalone rows auto-included on the bulletin until their event date passes.
// (Today is 2026-06-08 per the mock clock.)

export const MOCK_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "ann01",
    title: "Ward Picnic",
    description: "Hawaiian luau themed — all are invited. Food provided; bring a Hawaiian side dish.",
    date: "2026-06-19",
    time: "18:00",
    location: "the church building",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-28T00:00:00Z",
    updatedAt: "2026-05-28T00:00:00Z",
  },
  {
    id: "ann02",
    title: "RS Temple Trip",
    description: "Endowment sessions — sisters are encouraged to sign up.",
    date: "2026-06-20",
    time: "10:00",
    location: "Hartford Connecticut Temple",
    createdBy: "mock-bishop-001",
    createdAt: "2026-06-02T00:00:00Z",
    updatedAt: "2026-06-02T00:00:00Z",
  },
  {
    id: "ann03",
    title: "Youth Standards Night",
    description: "All youth ages 12-18.",
    date: "2026-06-25",
    time: "19:00",
    location: "Young Women room",
    createdBy: "mock-bishop-001",
    createdAt: "2026-06-05T00:00:00Z",
    updatedAt: "2026-06-05T00:00:00Z",
  },
  {
    id: "ann04",
    title: "Ministering Interviews",
    description: "Companionships, please report to your assigned leader by the end of the month.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
  },
  {
    id: "ann05",
    title: "Spring Service Project",
    description: "Cleanup at the community park. Thank you to all who came!",
    date: "2026-05-17",
    createdBy: "mock-bishop-001",
    createdAt: "2026-04-25T00:00:00Z",
    updatedAt: "2026-05-18T00:00:00Z",
  },
];

// ── Interviews ────────────────────────────────────────────────────────────────

export const MOCK_INTERVIEWS: Interview[] = [
  {
    id: "int01",
    memberName: "David Park",
    memberId: "m05",
    type: "temple_recommend",
    stage: "scheduled",
    requiresBishop: true,
    interviewer: "Bishop Anderson",
    scheduledDate: "2026-06-08",
    scheduledTime: "12:30",
    notes: "Scheduled after sacrament meeting.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-22T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
  },
  {
    id: "int02",
    memberName: "Emma Wilson",
    type: "temple_recommend_youth",
    stage: "scheduled",
    requiresBishop: false,
    interviewer: "Counselor Hughes",
    scheduledDate: "2026-06-08",
    scheduledTime: "12:45",
    notes: "First limited-use recommend.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-24T00:00:00Z",
    updatedAt: "2026-05-24T00:00:00Z",
  },
  {
    id: "int03",
    memberName: "Emily Chen",
    memberId: "m10",
    type: "calling",
    stage: "schedule_any",
    requiresBishop: false,
    notes: "Approved as Elders Quorum Secretary — needs to be extended.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-19T00:00:00Z",
    updatedAt: "2026-05-19T00:00:00Z",
  },
  {
    id: "int04",
    memberName: "Robert Johnson",
    memberId: "m09",
    type: "temple_recommend",
    stage: "schedule_bishop",
    requiresBishop: true,
    notes: "Recommend expires end of June.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "int05",
    memberName: "Michael Davis",
    memberId: "m11",
    type: "ministering",
    stage: "schedule_any",
    requiresBishop: false,
    notes: "Quarterly ministering interview.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-06-03T00:00:00Z",
    updatedAt: "2026-06-03T00:00:00Z",
  },
  {
    id: "int06",
    memberName: "Sarah Mitchell",
    memberId: "m02",
    type: "calling",
    stage: "scheduled",
    requiresBishop: false,
    interviewer: "Counselor Davis",
    scheduledDate: "2026-06-15",
    scheduledTime: "19:00",
    notes: "Sunday School Teacher.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-18T00:00:00Z",
    updatedAt: "2026-05-18T00:00:00Z",
  },
  {
    id: "int09",
    memberName: "Anna Martinez",
    memberId: "m06",
    type: "calling",
    stage: "pending_confirmation",
    requiresBishop: false,
    interviewer: "Counselor Hughes",
    scheduledDate: "2026-06-18",
    scheduledTime: "18:30",
    attendeeConfirmed: true,
    interviewerConfirmed: false,
    notes: "Primary teacher — waiting on counselor to confirm the time.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-06-05T00:00:00Z",
    updatedAt: "2026-06-05T00:00:00Z",
  },
  {
    id: "int07",
    memberName: "Jennifer Kim",
    memberId: "m08",
    type: "temple_recommend",
    stage: "completed",
    requiresBishop: true,
    interviewer: "Bishop Anderson",
    scheduledDate: "2026-05-25",
    scheduledTime: "10:00",
    notes: "Renewed for two years.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-10T00:00:00Z",
    updatedAt: "2026-05-25T00:00:00Z",
  },
  {
    id: "int08",
    memberName: "Thomas Reed",
    memberId: "m07",
    type: "youth",
    stage: "scheduled",
    requiresBishop: true,
    interviewer: "Bishop Anderson",
    scheduledDate: "2026-06-01",
    scheduledTime: "18:30",
    notes: "Semiannual youth interview.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-15T00:00:00Z",
    updatedAt: "2026-05-15T00:00:00Z",
  },
];

// ── Interview availability ──────────────────────────────────────────────────────
// Recurring weekly windows when each bishopric member can hold interviews.
// 0 = Sunday … 6 = Saturday.

export const MOCK_AVAILABILITY: AvailabilityBlock[] = [
  // Bishop Anderson — Sundays after church + a couple weeknights.
  { id: "av1", memberId: "bm1", memberName: "Bishop Anderson",  weekday: 0, startTime: "12:00", endTime: "13:30" },
  { id: "av2", memberId: "bm1", memberName: "Bishop Anderson",  weekday: 2, startTime: "18:00", endTime: "19:30" },
  { id: "av3", memberId: "bm1", memberName: "Bishop Anderson",  weekday: 3, startTime: "19:00", endTime: "20:00" },
  // Counselor Hughes
  { id: "av4", memberId: "bm2", memberName: "Counselor Hughes", weekday: 0, startTime: "12:00", endTime: "13:00" },
  { id: "av5", memberId: "bm2", memberName: "Counselor Hughes", weekday: 4, startTime: "18:30", endTime: "20:00" },
  // Counselor Davis
  { id: "av6", memberId: "bm3", memberName: "Counselor Davis",  weekday: 0, startTime: "12:00", endTime: "13:00" },
  { id: "av7", memberId: "bm3", memberName: "Counselor Davis",  weekday: 3, startTime: "19:00", endTime: "20:30" },
];

// Time-off overrides — these date ranges remove the recurring availability above.
export const MOCK_AVAILABILITY_EXCEPTIONS: AvailabilityException[] = [
  { id: "ax1", memberId: "bm1", memberName: "Bishop Anderson",  startDate: "2026-06-14", endDate: "2026-06-20", reason: "Out of town" },
];

// ── Full ward roster (Chart view) ───────────────────────────────────────────────
// Transcribed from the LCR "Organizations and Callings" report for the chart /
// org-wide roster view. Filled vs. vacant is derived from `member`.

function filled(
  position: string,
  member: string,
  sustained?: string,
  setApart = false,
  custom = false,
): RosterEntry {
  return { position, member, sustained, setApart, custom };
}

function vacant(position: string, custom = false): RosterEntry {
  return { position, custom };
}

export const MOCK_ROSTER: RosterGroup[] = [
  // ── Bishopric ───────────────────────────────────────────────────────────────
  {
    org: "Bishopric",
    entries: [
      filled("Bishop", "Phillips, Jay Allan", "2 Mar 2025", true),
      filled("Bishopric First Counselor", "Bringhurst, Blaine", "2 Mar 2025", true),
      filled("Bishopric Second Counselor", "Davenport, Scott", "21 Feb 2026", true),
      filled("Ward Executive Secretary", "Hansen, Braden", "18 Jan 2026", true),
      vacant("Ward Assistant Executive Secretary"),
      vacant("Ward Assistant Executive Secretary"),
      filled("Ward Clerk", "Tricozzi, Jeremy", "12 Apr 2026", true),
      vacant("Ward Assistant Clerk"),
      filled("Ward Assistant Clerk--Membership", "Dalrymple, Scott", "3 May 2026", true),
      filled("Ward Assistant Clerk--Finance", "Selin, Eric", "16 Oct 2022", true),
    ],
  },

  // ── Elders Quorum ─────────────────────────────────────────────────────────────
  {
    org: "Elders Quorum",
    subOrg: "Elders Quorum Presidency",
    entries: [
      filled("Elders Quorum President", "Wilding, James", "12 Apr 2026", true),
      filled("Elders Quorum First Counselor", "Brooksby, Glen", "12 Apr 2026", true),
      filled("Elders Quorum Second Counselor", "Pack, Jed Douglas", "12 Apr 2026", true),
      filled("Elders Quorum Secretary", "Olson, Andrew", "13 Apr 2025", true),
      vacant("Elders Quorum Assistant Secretary"),
    ],
  },
  {
    org: "Elders Quorum",
    subOrg: "Teachers",
    entries: [
      filled("Elders Quorum Teacher", "Nielsen, John Merle", "5 Oct 2025", true),
      filled("Assistant EQ Instructor", "Brown, Michael Anthony", "13 Feb 2022", false, true),
      vacant("Assistant EQ Instructor", true),
      filled("EQ Instructor", "Carter, James", "23 Jun 2024", true, true),
    ],
  },
  {
    org: "Elders Quorum",
    subOrg: "Ministering",
    entries: [
      filled("Elders Quorum Ministering Secretary", "Brooksby, Glen", "3 May 2026", true),
    ],
  },
  {
    org: "Elders Quorum",
    subOrg: "Activities",
    entries: [
      vacant("Elders Quorum Activity Coordinator"),
      vacant("Elders Quorum Assistant Activity Coordinator"),
      filled("Elders Quorum Activity Committee Member", "Bishop, Wayne Emanuel Daniel", "14 Aug 2022"),
      filled("Elders Quorum Activity Committee Member", "Chang, Mark", "14 Aug 2022", true),
      filled("Elders Quorum Activity Committee Member", "Hoffman, Charles", "14 Aug 2022", true),
      filled("Elders Quorum Activity Committee Member", "Miller, Daniel William Jr.", "11 Aug 2024", true),
      filled("Elders Quorum Activity Committee Member", "Pearce, Brian", "27 Jul 2025", true),
    ],
  },
  {
    org: "Elders Quorum",
    subOrg: "Service",
    entries: [
      filled("Elders Quorum Service Coordinator", "Selin, Kevin", "13 Apr 2025", true),
      filled("Elders Quorum Assistant Service Coordinator", "Edmonds, Alberto", "9 Nov 2025"),
      vacant("Elders Quorum Service Committee Member"),
      filled("Elders Quorum Self-reliance Specialist", "Watson, Greg", "2 Apr 2023", true, true),
      filled("Ward Missionary", "Chang, Mark", "4 Feb 2024", true, true),
    ],
  },

  // ── Relief Society ──────────────────────────────────────────────────────────────
  {
    org: "Relief Society",
    subOrg: "Relief Society Presidency",
    entries: [
      filled("Relief Society President", "Durfee, Annette", "11 Jan 2026", true),
      filled("Relief Society First Counselor", "Fugal, Tabatha", "11 Jan 2026", true),
      filled("Relief Society Second Counselor", "Hustedt, Tyra", "11 Jan 2026", true),
      filled("Relief Society Secretary", "McKinlay, Morgan", "8 Feb 2026"),
      filled("Relief Society Assistant Secretary", "Caine, Laverne", "29 Mar 2026", true),
    ],
  },
  {
    org: "Relief Society",
    subOrg: "Teachers",
    entries: [
      filled("Relief Society Teacher", "Jung, Sariah", "13 Apr 2025", true),
      vacant("Relief Society Teacher"),
    ],
  },
  {
    org: "Relief Society",
    subOrg: "Ministering",
    entries: [
      vacant("Relief Society Ministering Secretary"),
      vacant("Letters", true),
    ],
  },
  {
    org: "Relief Society",
    subOrg: "Activities",
    entries: [
      filled("Relief Society Activity Coordinator", "Relyea, Jean", "29 Mar 2026", true),
      filled("Relief Society Assistant Activity Coordinator", "Stevenson, Denise", "1 Jun 2025", true),
      filled("Relief Society Activity Committee Member", "Baran, Basantie", "12 Apr 2026", true),
      filled("Relief Society Activity Committee Member", "Salada, Tanya Marie", "27 Mar 2022", true),
      filled("Relief Society Activity Committee Member", "Watson, Doreen", "1 Nov 2020"),
      vacant("Relief Society Activity Committee Member"),
      vacant("Relief Society Activity Committee Member"),
    ],
  },
  {
    org: "Relief Society",
    subOrg: "Music",
    entries: [
      vacant("Relief Society Music Leader"),
      filled("Relief Society Pianist", "Chan, Emily", "27 Jul 2008", true),
    ],
  },
  {
    org: "Relief Society",
    subOrg: "Service",
    entries: [
      filled("Relief Society Service Coordinator", "Chan, Stella", "10 Sep 2023", true),
      vacant("Relief Society Assistant Service Coordinator"),
      filled("Relief Society Service Committee Member", "Egan, Virginia", "12 Jun 2022", true),
      filled("Relief Society Service Committee Member", "Idahagbon, Omosede", "12 Apr 2026"),
      filled("Relief Society Service Committee Member", "Pearce, Diane Michelle", "16 Jun 2024"),
      filled("Relief Society Service Committee Member", "Wilson, Marilee", "29 Nov 2020", true),
      filled("Relief Society Greeter", "Jackson, Sharon", "3 Mar 2024", false, true),
    ],
  },

  // ── Aaronic Priesthood Quorums ──────────────────────────────────────────────────
  {
    org: "Aaronic Priesthood Quorums",
    subOrg: "Presidency of the Aaronic Priesthood",
    entries: [
      filled("Bishop", "Phillips, Jay Allan", "2 Mar 2025", true),
      filled("Bishopric First Counselor", "Bringhurst, Blaine", "2 Mar 2025", true),
      filled("Bishopric Second Counselor", "Davenport, Scott", "21 Feb 2026", true),
    ],
  },
  {
    org: "Aaronic Priesthood Quorums",
    subOrg: "Priests Quorum Presidency",
    entries: [
      filled("Priests Quorum President", "Phillips, Jay Allan", "2 Mar 2025", true),
      filled("Priests Quorum First Assistant", "Madsen, Will", "22 Jun 2025", true),
      filled("Priests Quorum Second Assistant", "Bringhurst, Bryson Richard", "22 Jun 2025", true),
      filled("Priests Quorum Secretary", "Phillips, Wesley Jay", "22 Jun 2025", true),
    ],
  },
  {
    org: "Aaronic Priesthood Quorums",
    subOrg: "Priests Quorum Adult Leaders",
    entries: [
      filled("Priests Quorum Adviser", "Preece, James", "1 Mar 2026"),
      vacant("Priests Quorum Specialist"),
    ],
  },
  {
    org: "Aaronic Priesthood Quorums",
    subOrg: "Teachers Quorum Presidency",
    entries: [
      filled("Teachers Quorum President", "Crosby, Byron", "8 Feb 2026", true),
      filled("Teachers Quorum First Counselor", "Pack, Kenton James", "8 Feb 2026", true),
      vacant("Teachers Quorum Second Counselor"),
      filled("Teachers Quorum Secretary", "Fugal, Liam", "23 Mar 2025", true),
    ],
  },
  {
    org: "Aaronic Priesthood Quorums",
    subOrg: "Teachers Quorum Adult Leaders",
    entries: [
      filled("Teachers Quorum Adviser", "Metzger, Ronald", "10 May 2026", true),
      vacant("Teachers Quorum Specialist"),
    ],
  },
  {
    org: "Aaronic Priesthood Quorums",
    subOrg: "Deacons Quorum Presidency",
    entries: [
      filled("Deacons Quorum President", "Preece, Jacob", "8 Feb 2026", true),
      filled("Deacons Quorum First Counselor", "Madsen, Jack Henry", "29 Mar 2026", true),
      vacant("Deacons Quorum Second Counselor"),
      vacant("Deacons Quorum Secretary"),
    ],
  },
  {
    org: "Aaronic Priesthood Quorums",
    subOrg: "Deacons Quorum Adult Leaders",
    entries: [
      filled("Deacons Quorum Adviser", "Selin, Kevin", "27 Jul 2025", true),
      vacant("Deacons Quorum Specialist"),
    ],
  },
  {
    org: "Aaronic Priesthood Quorums",
    subOrg: "Additional Aaronic Priesthood Quorums Callings",
    entries: [
      vacant("Aaronic Priesthood Quorums Specialist - Camp Director"),
      vacant("Aaronic Priesthood Quorums Specialist - Assistant Camp Director"),
      vacant("Young Men Stake Youth Committee Member"),
      vacant("Young Men Specialist - Sports"),
      vacant("Young Men Specialist - Sports Assistant"),
      filled("Aaronic Priesthood Quorums Specialist", "Markham, Steve", "8 Dec 2019"),
    ],
  },

  // ── Young Women ─────────────────────────────────────────────────────────────────
  {
    org: "Young Women",
    subOrg: "Young Women Presidency",
    entries: [
      filled("Young Women President", "Madsen, Jessy", "16 Nov 2025", true),
      filled("Young Women First Counselor", "Preece, Kirsten", "16 Nov 2025", true),
      filled("Young Women Second Counselor", "Olson, Lauren", "16 Nov 2025", true),
      filled("Young Women Secretary", "Chan, Sarah", "26 Apr 2026", true),
    ],
  },
  {
    org: "Young Women",
    subOrg: "Gatherers of Light Class Presidency",
    entries: [
      vacant("Gatherers of Light Class President"),
      vacant("Gatherers of Light Class First Counselor"),
      vacant("Gatherers of Light Class Second Counselor"),
      vacant("Gatherers of Light Class Secretary"),
    ],
  },
  {
    org: "Young Women",
    subOrg: "Gatherers of Light Class Adult Leaders",
    entries: [
      vacant("Gatherers of Light Class Adviser"),
      vacant("Gatherers of Light Specialist"),
    ],
  },
  {
    org: "Young Women",
    subOrg: "Messengers of Hope Class Presidency",
    entries: [
      vacant("Messengers of Hope Class President"),
      vacant("Messengers of Hope Class First Counselor"),
      vacant("Messengers of Hope Class Second Counselor"),
      vacant("Messengers of Hope Class Secretary"),
    ],
  },
  {
    org: "Young Women",
    subOrg: "Messengers of Hope Class Adult Leaders",
    entries: [
      vacant("Messengers of Hope Class Adviser"),
      vacant("Messengers of Hope Specialist"),
    ],
  },
  {
    org: "Young Women",
    subOrg: "Builders of Faith Class Presidency",
    entries: [
      vacant("Builders of Faith Class President"),
      vacant("Builders of Faith Class First Counselor"),
      vacant("Builders of Faith Class Second Counselor"),
      vacant("Builders of Faith Class Secretary"),
    ],
  },
  {
    org: "Young Women",
    subOrg: "Builders of Faith Class Adult Leaders",
    entries: [
      vacant("Builders of Faith Class Adviser"),
      vacant("Builders of Faith Specialist"),
    ],
  },
  {
    org: "Young Women",
    subOrg: "Additional Young Women Callings",
    entries: [
      vacant("Young Women Class Adviser"),
      vacant("Young Women Class Adviser"),
      vacant("Young Women Specialist"),
      vacant("Young Women Specialist"),
      vacant("Young Women Specialist"),
      vacant("Young Women Specialist - Activities"),
      vacant("Young Women Specialist - Camp Director"),
      vacant("Young Women Specialist - Assistant Camp Director"),
      vacant("Young Women Stake Youth Committee"),
      vacant("Young Women Specialist - Sports"),
      vacant("Young Women Specialist - Sports Assistant"),
    ],
  },

  // ── Sunday School ─────────────────────────────────────────────────────────────────
  {
    org: "Sunday School",
    subOrg: "Sunday School Presidency",
    entries: [
      filled("Sunday School President", "Nielsen, John Merle", "19 Oct 2025", true),
      filled("Sunday School First Counselor", "Brown, Zion", "30 Nov 2025", true),
      filled("Sunday School Second Counselor", "Phillips, Bill", "4 Jan 2026", true),
      vacant("Sunday School Secretary"),
    ],
  },
  {
    org: "Sunday School",
    subOrg: "Gospel Doctrine",
    entries: [
      filled("Sunday School Teacher", "Gagne, Richard", "8 Oct 2023", true),
      filled("Class President", "DiGiovannantonio, Tony", "28 Jul 2024", false, true),
    ],
  },
  {
    org: "Sunday School",
    subOrg: "Course 16, Course 17",
    entries: [
      filled("Sunday School Teacher", "Amar, Dharyl", "7 Sep 2025"),
      filled("Sunday School Teacher", "Chan, Benjamin Yue-Ming", "26 Apr 2026", true),
      filled("Sunday School Teacher", "Ravi", "26 Apr 2026", true),
    ],
  },
  {
    org: "Sunday School",
    subOrg: "Course 13, Course 14, Course 15",
    entries: [
      filled("Sunday School Teacher", "Metzger, Lisa", "30 Nov 2025", true),
      filled("Sunday School Teacher", "Selin, Diane", "11 Jan 2026", true),
      vacant("Sunday School Teacher"),
    ],
  },
  {
    org: "Sunday School",
    subOrg: "Course 11, Course 12",
    entries: [
      filled("Sunday School Teacher", "Dalrymple, Dawn", "15 Dec 2024", true),
      filled("Sunday School Teacher", "Selin, Amy", "30 Nov 2025"),
      vacant("Sunday School Teacher"),
    ],
  },
  {
    org: "Sunday School",
    subOrg: "Unassigned Teachers",
    entries: [
      vacant("Sunday School Teacher"),
      filled("Temple Preparation Teacher", "Obos, Christopher", "28 Dec 2025", false, true),
    ],
  },
  {
    org: "Sunday School",
    subOrg: "Resource Center",
    entries: [
      vacant("Resource Center Specialist"),
    ],
  },

  // ── Primary ─────────────────────────────────────────────────────────────────────
  {
    org: "Primary",
    subOrg: "Primary Presidency",
    entries: [
      filled("Primary President", "Phillips, Laura", "23 Nov 2025", true),
      filled("Primary First Counselor", "Dinkel, Jennifer", "23 Nov 2025", true),
      filled("Primary Second Counselor", "Wilding, Arla", "23 Nov 2025", true),
      filled("Primary Secretary", "Woodruff, Renee Lynn", "23 Nov 2025"),
    ],
  },
  {
    org: "Primary",
    subOrg: "Music",
    entries: [
      filled("Primary Pianist", "Wilding, Thomas", "26 Apr 2026"),
      vacant("Primary Music Leader"),
    ],
  },
  {
    org: "Primary",
    subOrg: "Valiant 7, Valiant 8, Valiant 9, Valiant 10",
    entries: [
      filled("Primary Teacher", "Reynolds, Chris", "20 Apr 2025"),
      vacant("Primary Teacher"),
    ],
  },
  {
    org: "Primary",
    subOrg: "CTR 5, CTR 6",
    entries: [
      filled("Primary Teacher", "Brooksby, Michelle", "10 May 2026"),
      filled("Primary Teacher", "Marco, Bergen", "23 Mar 2025"),
      filled("Primary Teacher", "Robertshaw, Kris", "23 Mar 2025"),
    ],
  },
  {
    org: "Primary",
    subOrg: "Sunbeam, CTR 4",
    entries: [
      filled("Primary Teacher", "Purcell, Iretta Ruth", "20 Apr 2025"),
      filled("Primary Teacher", "Tricozzi, Liz", "10 May 2026", true),
    ],
  },
  {
    org: "Primary",
    subOrg: "Nursery",
    entries: [
      vacant("Nursery Leader"),
      filled("Nursery worker", "Hoffman, Edith", "10 Aug 2025", false, true),
      filled("Nursery worker", "Amar, Mikki", "17 Aug 2025", false, true),
    ],
  },
  {
    org: "Primary",
    subOrg: "Unassigned Teachers",
    entries: [
      filled("Primary Teacher", "Davenport, Britany", "22 Feb 2026", true),
      filled("Primary Teacher", "Delaney, Rosa", "12 Oct 2025"),
      filled("Primary Teacher", "Hustedt, Caleb", "1 Jun 2025", true),
      filled("Primary Teacher", "Markham, Janet", "4 Jan 2026", true),
    ],
  },
  {
    org: "Primary",
    subOrg: "Primary Activities - Boys",
    entries: [
      filled("Valiant Activities Leader", "Purcell, Scott Thomas", "20 Apr 2025"),
    ],
  },
  {
    org: "Primary",
    subOrg: "Primary Activities - Girls",
    entries: [
      vacant("Valiant Activities Leader"),
      vacant("Valiant Activities Leader"),
      vacant("Primary Assistant Activities Leader", true),
    ],
  },

  // ── Ward Missionaries ─────────────────────────────────────────────────────────────
  {
    org: "Ward Missionaries",
    entries: [
      filled("Ward Mission Leader", "Pack, Jed Douglas", "8 Oct 2023", true),
      vacant("Assistant Ward Mission Leader"),
      filled("Ward Missionary", "Singh, Amargeet Jowahir", "10 Nov 2024"),
      filled("Ward Missionary", "Subick, Rishee", "22 Mar 2026"),
      filled("Ward Missionary", "Tyler, Lance Trent Nassir Jah'Rell", "8 Jun 2025", true),
      filled("Ward Missionary", "Woodruff, Adam", "29 Mar 2026"),
      vacant("Ward Missionary"),
    ],
  },

  // ── Temple and Family History ─────────────────────────────────────────────────────
  {
    org: "Temple and Family History",
    entries: [
      filled("Ward Temple and Family History Leader", "Smith, Brian", "26 Apr 2026"),
      filled("Ward Temple and Family History Consultant", "Chan, Dorothy Zina", "21 Jan 2024", true),
      filled("Ward Temple and Family History Consultant", "Hayes, Daveena", "29 Mar 2026", true),
      filled("Ward Temple and Family History Consultant", "Obos, Christopher", "20 Dec 2020"),
      filled("Ward Temple and Family History Consultant", "Obos, Lee Anna", "20 Feb 2022"),
      filled("Ward Temple and Family History Consultant", "Pack, Amelia Kathryn", "5 May 2024", true),
      filled("Ward Temple and Family History Consultant", "Thompson, Barbara", "13 Apr 2025"),
      vacant("Indexing Worker"),
    ],
  },

  // ── Young Single Adult ────────────────────────────────────────────────────────────
  {
    org: "Young Single Adult",
    entries: [
      vacant("Relief Society Adviser to Young Single Adult Sisters"),
      vacant("Young Single Adult Adviser"),
      vacant("Young Single Adult Adviser"),
      vacant("Young Single Adult Leader"),
      filled("Young Single Adult Committee Chair", "Hoffman, Sam", "20 Aug 2023"),
      vacant("Young Single Adult Committee Member"),
      vacant("Young Single Adult Assistant", true),
      vacant("Young Single Adult Representative", true),
    ],
  },

  // ── Other Callings ────────────────────────────────────────────────────────────────
  {
    org: "Other Callings",
    subOrg: "Church Magazines",
    entries: [
      vacant("Magazine Representative"),
    ],
  },
  {
    org: "Other Callings",
    subOrg: "Facilities",
    entries: [
      vacant("Building Representative"),
      vacant("Scheduler--Building 1"),
      vacant("Scheduler--Building 2"),
      vacant("Scheduler--Building 3"),
      vacant("Scheduler--Building 4"),
      vacant("Scheduler--Building 5"),
    ],
  },
  {
    org: "Other Callings",
    subOrg: "For the Strength of Youth",
    entries: [
      vacant("FSY Conferences Representative"),
    ],
  },
  {
    org: "Other Callings",
    subOrg: "History",
    entries: [
      vacant("History Specialist"),
      filled("Youth Ward Historian", "Markham, Adele Rose", "14 Apr 2024", false, true),
      filled("Youth Ward Historian", "Pack, Kenton James", "14 Apr 2024", false, true),
      vacant("Youth Ward Historian", true),
    ],
  },
  {
    org: "Other Callings",
    subOrg: "Music",
    entries: [
      vacant("Priesthood Pianist or Organist"),
      vacant("Priesthood Music Director"),
      vacant("Choir Accompanist"),
      vacant("Music Adviser"),
      filled("Choir Director", "Lehman, John S", "1 Jun 2025", true),
      filled("Accompanist", "Chan, David", "13 Jan 2019", true),
      filled("Accompanist", "Chan, Heather Yee-Mei", "6 Aug 2023"),
      filled("Accompanist", "Lehman, John S", "11 Sep 2022", true),
      filled("Accompanist", "Pack, Leslie", "16 Jul 2023"),
      filled("Music Leader", "Lehman, John S", "8 Oct 2023", true),
      filled("Music Coordinator", "Lehman, John S", "19 Nov 2023", true),
    ],
  },
  {
    org: "Other Callings",
    subOrg: "Technology",
    entries: [
      vacant("Email Communication Specialist"),
      filled("Technology Specialist", "Wilding, Thomas", "20 Apr 2025"),
      vacant("Ward/Branch Interpreter"),
    ],
  },
  {
    org: "Other Callings",
    subOrg: "Welfare and Self-Reliance",
    entries: [
      vacant("Disability Activity Leader"),
      vacant("Disability Specialist"),
      filled("Welfare and Self-Reliance Specialist", "Fugal, Jan", "10 May 2026", true),
      vacant("Self-Reliance Group Facilitator"),
    ],
  },
  {
    org: "Other Callings",
    subOrg: "Additional Callings",
    entries: [
      vacant("Bulletin Editor", true),
      vacant("Family Spotlight Coordinator", true),
      vacant("Missionary Meal Coordinator", true),
      vacant("Ordinance Worker", true),
      filled("Sacrament Meeting Assistant", "Chang, Mark", "13 Feb 2022", false, true),
      vacant("Sacrament Usher", true),
      vacant("Ward Activity Committee Leader", true),
      filled("Ward Activity Committee Member", "Zoilo, Shishiqua", "18 Sep 2022", false, true),
      filled("Ward Activity Committee Member", "Marchesani, Darlyne", "30 Oct 2022", false, true),
      vacant("Ward Safety Chairman", true),
      vacant("Ward Single Adult Assistant", true),
      vacant("Ward Single Adult Representative", true),
      vacant("Ward Social Media Coordinator", true),
    ],
  },
];

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const MOCK_TASKS: Task[] = [
  {
    id: "t01",
    title: "Temple recommend interview — David Park",
    type: "interview",
    status: "active",
    memberName: "David Park",
    dueDate: "2026-06-01",
    description: "Scheduled after sacrament meeting.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-22T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
  },
  {
    id: "t02",
    title: "Follow up with Martinez family on welfare visit",
    type: "follow_up",
    status: "in_progress",
    memberName: "Anna Martinez",
    description: "Check in about employment situation.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-18T00:00:00Z",
    updatedAt: "2026-05-20T00:00:00Z",
  },
  {
    id: "t03",
    title: "Add Thomas Hughes to business items document",
    type: "agenda_item",
    status: "active",
    memberName: "Thomas Hughes",
    description: "Ward Mission Leader — scheduled for June 1 sacrament meeting.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-22T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
  },
  {
    id: "t04",
    title: "Update LCR for Mark Williams (Ward Clerk)",
    type: "calling",
    status: "active",
    memberName: "Mark Williams",
    description: "Set apart April 20 — record in LCR.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-04-21T00:00:00Z",
    updatedAt: "2026-04-21T00:00:00Z",
  },
  {
    id: "t05",
    title: "Prepare tithing settlement schedule",
    type: "todo",
    status: "waiting",
    dueDate: "2026-06-15",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-15T00:00:00Z",
    updatedAt: "2026-05-15T00:00:00Z",
  },
  {
    id: "t06",
    title: "Youth temple recommend — Emma Wilson",
    type: "interview",
    status: "active",
    memberName: "Emma Wilson",
    dueDate: "2026-06-08",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-24T00:00:00Z",
    updatedAt: "2026-05-24T00:00:00Z",
  },
  {
    id: "t07",
    title: "Budget approval — Primary summer activity",
    type: "agenda_item",
    status: "active",
    description: "Needs bishopric sign-off before June 10.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-20T00:00:00Z",
    updatedAt: "2026-05-20T00:00:00Z",
  },
  {
    id: "t08",
    title: "Review ward directory updates",
    type: "general",
    status: "completed",
    description: "Completed after clerk submitted changes.",
    createdBy: "mock-bishop-001",
    createdAt: "2026-05-10T00:00:00Z",
    updatedAt: "2026-05-17T00:00:00Z",
  },
];
