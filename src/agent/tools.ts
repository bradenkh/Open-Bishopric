import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromRow } from "@/lib/db/mappers";
import { generateSlots } from "@/lib/availability";
import { parseBulletin, defaultBulletin, upcomingSunday } from "@/lib/bulletin";
import { isAnnouncementActive } from "@/lib/announcements";
import { listAgentNotes } from "@/lib/agent-notes";
import { INTERVIEW_DURATION_MINS } from "@/types";
import type {
  AgendaItem,
  Announcement,
  AvailabilityBlock,
  AvailabilityException,
  Calling,
  Interview,
  InterviewType,
  Meeting,
  Member,
  RosterEntry,
  RosterGroup,
  SacramentProgram,
  Task,
} from "@/types";

// The agent runs server-side after the Route Handler has verified the session,
// so it uses the service-role client for data access. Created lazily so the
// build doesn't require the service-role key to be present.
let _db: ReturnType<typeof createAdminClient> | undefined;
function db() {
  return (_db ??= createAdminClient());
}

export const getMembers = tool({
  description: "Search or list ward members by name. Use to find member information.",
  inputSchema: z.object({
    search: z.string().optional().describe("Optional name to search for"),
    limitCount: z.number().optional().default(10),
  }),
  execute: async ({ search, limitCount = 10 }) => {
    let query = db().from("members").select("*").order("last_name").limit(limitCount);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => fromRow<Member>(r));
  },
});

export const getTasks = tool({
  description: "Get tasks filtered by status and/or type.",
  inputSchema: z.object({
    status: z
      .enum(["active", "in_progress", "waiting", "completed", "cancelled", "all"])
      .optional()
      .default("active"),
    type: z
      .enum(["interview", "follow_up", "contact", "todo", "calling", "agenda_item", "announcement", "general", "all"])
      .optional()
      .default("all"),
    limitCount: z.number().optional().default(20),
  }),
  execute: async ({ status, type, limitCount = 20 }) => {
    let query = db().from("tasks").select("*").order("created_at", { ascending: false }).limit(limitCount);
    if (status && status !== "all") query = query.eq("status", status);
    if (type && type !== "all") query = query.eq("type", type);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => fromRow<Task>(r));
  },
});

export const createTask = tool({
  description: "Create a new task for the bishopric.",
  inputSchema: z.object({
    title: z.string().describe("Short descriptive title"),
    description: z.string().optional(),
    type: z.enum(["interview", "follow_up", "contact", "todo", "calling", "agenda_item", "announcement", "general"]),
    memberName: z.string().optional().describe("Name of the ward member this task relates to"),
    dueDate: z.string().optional().describe("ISO date string for the due date"),
  }),
  execute: async ({ title, description, type, memberName, dueDate }) => {
    const { data, error } = await db()
      .from("tasks")
      .insert({
        id: crypto.randomUUID(),
        title,
        description: description ?? null,
        type,
        status: "active",
        member_name: memberName ?? null,
        due_date: dueDate ?? null,
        created_by: "ai-agent",
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow<Task>(data);
  },
});

export const updateTaskStatus = tool({
  description: "Update the status of an existing task.",
  inputSchema: z.object({
    taskId: z.string(),
    status: z.enum(["active", "in_progress", "waiting", "completed", "cancelled"]),
  }),
  execute: async ({ taskId, status }) => {
    const { error } = await db().from("tasks").update({ status }).eq("id", taskId);
    if (error) throw error;
    return { success: true, taskId, status };
  },
});

export const getCallings = tool({
  description: "Get callings in progress, optionally filtered by stage.",
  inputSchema: z.object({
    stage: z
      .enum(["needs_calling", "vacant", "needs_release", "extending", "sustaining", "set_apart", "lcr_update", "recorded", "all"])
      .optional()
      .default("all"),
    limitCount: z.number().optional().default(20),
  }),
  execute: async ({ stage, limitCount = 20 }) => {
    let query = db().from("callings").select("*").order("created_at", { ascending: false }).limit(limitCount);
    if (stage && stage !== "all") query = query.eq("stage", stage);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => fromRow<Calling>(r));
  },
});

// ── Roster / organization chart (the Chart tab) ──────────────────────────────
// The standing org chart of every position and who holds it — what an LCR
// "Organizations and Callings" report shows. Distinct from the calling pipeline
// (`callings`), which is the workflow for filling one position at a time.

/** org|||position|||member key used to carry 'hidden from chart' flags across a replace. */
function rosterEntryKey(org: string, position: string, member?: string): string {
  return `${org}|||${position}|||${member ?? ""}`;
}

export const getRoster = tool({
  description:
    "Get the ward roster / organization chart (the Chart tab): every organization and the positions in it, with who holds each (or that it's vacant). Use to answer who holds a calling or which positions are vacant. This is the standing org chart — separate from the calling pipeline (getCallings).",
  inputSchema: z.object({
    org: z.string().optional().describe("Filter to one organization by name (partial match), e.g. 'Relief Society'"),
    vacantOnly: z.boolean().optional().default(false).describe("Only return vacant (unfilled) positions"),
  }),
  execute: async ({ org, vacantOnly = false }) => {
    let query = db().from("roster_groups").select("*").order("position");
    if (org) query = query.ilike("org", `%${org}%`);
    const { data, error } = await query;
    if (error) throw error;
    const groups = (data ?? []).map((r) => fromRow<RosterGroup>(r));
    return groups
      .map((g) => ({
        org: g.org,
        subOrg: g.subOrg,
        entries: (g.entries ?? []).filter((e) => !vacantOnly || !e.member),
      }))
      .filter((g) => g.entries.length > 0);
  },
});

const rosterEntrySchema = z.object({
  position: z.string().describe("Calling/position name, e.g. 'Elders Quorum President'"),
  member: z.string().optional().describe("Holder's name as shown in LCR ('Last, First'); omit for a vacant position"),
  sustained: z.string().optional().describe("Sustained date, verbatim, e.g. '2 Mar 2025'"),
  setApart: z.boolean().optional().describe("True if the holder has been set apart"),
  custom: z.boolean().optional().describe("True for ward-defined custom callings (marked * in LCR)"),
});

export const importRoster = tool({
  description:
    "Replace the ENTIRE ward roster / organization chart (the Chart tab) in one call. Use this to bulk-import all of the ward's callings — e.g. from a pasted LCR 'Organizations and Callings' report. Parse the source into organizations (org), optional sub-sections (subOrg), and their positions (entries), keeping the order they appear. This REPLACES the whole roster, so you must include every position — anything omitted is removed. Per-position 'hidden from chart' settings are carried over automatically by matching org+position+member. This does not touch the calling pipeline (getCallings).",
  inputSchema: z.object({
    groups: z
      .array(
        z.object({
          org: z.string().describe("Top-level organization, e.g. 'Bishopric', 'Elders Quorum', 'Relief Society'"),
          subOrg: z.string().optional().describe("Optional sub-section within the org, e.g. 'Presidency', 'Teachers'"),
          entries: z.array(rosterEntrySchema).describe("Positions in this group, in display order"),
        }),
      )
      .describe("Every roster group for the ward, in display order"),
  }),
  execute: async ({ groups }) => {
    if (groups.length === 0) {
      return { error: "Provide at least one organization group — an empty roster would wipe the chart." };
    }
    const database = db();

    // Existing rows: needed to carry 'hidden' flags forward and to delete after a
    // successful insert (insert-then-delete avoids data loss if the insert fails).
    const { data: existingRows, error: exErr } = await database.from("roster_groups").select("id, org, entries");
    if (exErr) throw exErr;

    const hiddenKeys = new Set<string>();
    for (const row of existingRows ?? []) {
      const rowOrg = row.org as string;
      for (const e of (row.entries as RosterEntry[] | null) ?? []) {
        if (e.hidden) hiddenKeys.add(rosterEntryKey(rowOrg, e.position, e.member));
      }
    }

    const newRows = groups.map((g, i) => ({
      id: crypto.randomUUID(),
      org: g.org,
      sub_org: g.subOrg ?? null,
      position: i,
      entries: g.entries.map((e) => {
        const entry: RosterEntry = { position: e.position };
        if (e.member) entry.member = e.member;
        if (e.sustained) entry.sustained = e.sustained;
        if (e.setApart != null) entry.setApart = e.setApart;
        if (e.custom != null) entry.custom = e.custom;
        if (hiddenKeys.has(rosterEntryKey(g.org, e.position, e.member))) entry.hidden = true;
        return entry;
      }),
    }));

    const { error: insErr } = await database.from("roster_groups").insert(newRows);
    if (insErr) throw insErr;

    const oldIds = (existingRows ?? []).map((r) => r.id as string);
    if (oldIds.length > 0) {
      const { error: delErr } = await database.from("roster_groups").delete().in("id", oldIds);
      if (delErr) throw delErr;
    }

    const positions = groups.reduce((n, g) => n + g.entries.length, 0);
    const filled = groups.reduce((n, g) => n + g.entries.filter((e) => e.member).length, 0);
    return {
      ok: true,
      organizations: groups.length,
      positions,
      filled,
      vacant: positions - filled,
      hiddenPreserved: hiddenKeys.size,
    };
  },
});

// ── Interviews ─────────────────────────────────────────────────────────────────

const INTERVIEW_TYPES = [
  "temple_recommend", "temple_recommend_youth", "calling", "ministering",
  "tithing_settlement", "youth", "worthiness", "other",
] as const;

/** Bishopric members who can conduct interviews (bishop + counselors), from profiles. */
async function loadInterviewers(): Promise<{ name: string; role: string }[]> {
  const { data, error } = await db()
    .from("profiles")
    .select("display_name, role")
    .in("role", ["bishop", "counselor"])
    .order("display_name");
  if (error) throw error;
  return (data ?? []).map((r) => ({ name: r.display_name as string, role: r.role as string }));
}

async function bishopName(): Promise<string | undefined> {
  const { data } = await db().from("profiles").select("display_name").eq("role", "bishop").maybeSingle();
  return (data?.display_name as string | undefined) ?? undefined;
}

export const getInterviews = tool({
  description:
    "List interviews, optionally filtered by stage or member. Use to see who needs scheduling and to get an interview's id before scheduling it.",
  inputSchema: z.object({
    stage: z
      .enum([
        "schedule_any", "schedule_bishop", "pending_confirmation",
        "scheduled", "date_passed", "completed", "all",
      ])
      .optional()
      .default("all"),
    memberName: z.string().optional().describe("Filter to a single member by name"),
    limitCount: z.number().optional().default(30),
  }),
  execute: async ({ stage, memberName, limitCount = 30 }) => {
    let query = db().from("interviews").select("*").order("created_at", { ascending: false }).limit(limitCount);
    // `date_passed` is a derived UI stage (a scheduled interview whose date has
    // passed); it isn't stored, so don't filter on it at the DB level.
    if (stage && stage !== "all" && stage !== "date_passed") query = query.eq("stage", stage);
    if (memberName) query = query.ilike("member_name", `%${memberName}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => fromRow<Interview>(r));
  },
});

export const getInterviewers = tool({
  description:
    "List the bishopric members who can conduct interviews (the bishop and counselors). Use to know who to schedule an interview with.",
  inputSchema: z.object({}),
  execute: async () => {
    const interviewers = await loadInterviewers();
    return { interviewers, bishop: await bishopName() };
  },
});

export const createInterview = tool({
  description:
    "Add a person to the list of interviews to schedule. Creates the interview in the appropriate scheduling column; it can then be scheduled with `findInterviewSlots` + `scheduleInterview`.",
  inputSchema: z.object({
    memberName: z.string().describe("Name of the person to be interviewed"),
    type: z.enum(INTERVIEW_TYPES).optional().default("temple_recommend"),
    requiresBishop: z
      .boolean()
      .optional()
      .default(false)
      .describe("True if the interview must be with the bishop (not just any bishopric member)"),
    notes: z.string().optional(),
  }),
  execute: async ({ memberName, type = "temple_recommend", requiresBishop = false, notes }) => {
    const { data, error } = await db()
      .from("interviews")
      .insert({
        id: crypto.randomUUID(),
        member_name: memberName,
        type,
        stage: requiresBishop ? "schedule_bishop" : "schedule_any",
        requires_bishop: requiresBishop,
        duration_mins: INTERVIEW_DURATION_MINS[type as InterviewType],
        notes: notes ?? null,
        created_by: "ai-agent",
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow<Interview>(data);
  },
});

export const findInterviewSlots = tool({
  description:
    "Find open appointment slots for an interview over the next few weeks, based on the bishopric's availability and existing bookings. Pass the interviewId to size slots to that interview. Returns conflict-free slots with the interviewer for each.",
  inputSchema: z.object({
    interviewId: z.string().describe("The interview to find slots for (from getInterviews/createInterview)"),
    days: z.number().optional().default(28).describe("How many days ahead to search"),
    limitCount: z.number().optional().default(20),
  }),
  execute: async ({ interviewId, days = 28, limitCount = 20 }) => {
    const { data: row, error: iErr } = await db().from("interviews").select("*").eq("id", interviewId).maybeSingle();
    if (iErr) throw iErr;
    if (!row) return { error: "No interview found with that id." };
    const interview = fromRow<Interview>(row);

    const [blocksRes, exceptionsRes, interviewsRes] = await Promise.all([
      db().from("availability_blocks").select("*"),
      db().from("availability_exceptions").select("*"),
      db().from("interviews").select("*"),
    ]);
    if (blocksRes.error) throw blocksRes.error;
    if (exceptionsRes.error) throw exceptionsRes.error;
    if (interviewsRes.error) throw interviewsRes.error;

    const durationMins = interview.durationMins ?? INTERVIEW_DURATION_MINS[interview.type];
    const restrictToMember = interview.requiresBishop ? await bishopName() : undefined;

    const slots = generateSlots({
      memberName: restrictToMember,
      durationMins,
      blocks: (blocksRes.data ?? []).map((r) => fromRow<AvailabilityBlock>(r)),
      exceptions: (exceptionsRes.data ?? []).map((r) => fromRow<AvailabilityException>(r)),
      interviews: (interviewsRes.data ?? []).map((r) => fromRow<Interview>(r)),
      days,
      ignoreInterviewId: interviewId,
    });

    return {
      durationMins,
      requiresBishop: interview.requiresBishop ?? false,
      slots: slots.slice(0, limitCount).map((s) => ({
        date: s.date,
        time: s.time,
        endTime: s.endTime,
        interviewer: s.memberName,
      })),
      note:
        slots.length === 0
          ? "No open slots — the bishopric may need to add availability on the Interviews → Availability tab, or schedule manually."
          : undefined,
    };
  },
});

export const scheduleInterview = tool({
  description:
    "Book an interview into a specific date/time with an interviewer (use a slot from findInterviewSlots). By default it moves to 'pending confirmation' until both sides confirm; set markConfirmed to book it as fully scheduled. Rejects times that overlap another booking for the same interviewer.",
  inputSchema: z.object({
    interviewId: z.string(),
    date: z.string().describe("ISO date YYYY-MM-DD"),
    time: z.string().describe("24-hour time HH:MM"),
    interviewer: z.string().describe("Name of the bishopric member conducting it"),
    durationMins: z.number().optional(),
    markConfirmed: z
      .boolean()
      .optional()
      .default(false)
      .describe("Skip the confirmation step and mark it fully scheduled"),
  }),
  execute: async ({ interviewId, date, time, interviewer, durationMins, markConfirmed = false }) => {
    const { data: row, error: iErr } = await db().from("interviews").select("*").eq("id", interviewId).maybeSingle();
    if (iErr) throw iErr;
    if (!row) return { error: "No interview found with that id." };
    const interview = fromRow<Interview>(row);
    const duration = durationMins ?? interview.durationMins ?? INTERVIEW_DURATION_MINS[interview.type];

    // Guard against double-booking the interviewer at an overlapping time.
    const { data: others, error: oErr } = await db()
      .from("interviews")
      .select("*")
      .eq("interviewer", interviewer)
      .eq("scheduled_date", date)
      .neq("id", interviewId);
    if (oErr) throw oErr;
    const start = toMins(time);
    const end = start + duration;
    const conflict = (others ?? [])
      .map((r) => fromRow<Interview>(r))
      .find((o) => {
        if (o.stage === "completed" || !o.scheduledTime) return false;
        const os = toMins(o.scheduledTime);
        const oe = os + (o.durationMins ?? INTERVIEW_DURATION_MINS[o.type]);
        return start < oe && end > os;
      });
    if (conflict) {
      return {
        error: `${interviewer} is already booked at that time (${conflict.memberName} at ${conflict.scheduledTime}). Pick another slot.`,
      };
    }

    const { data, error } = await db()
      .from("interviews")
      .update({
        stage: markConfirmed ? "scheduled" : "pending_confirmation",
        interviewer,
        scheduled_date: date,
        scheduled_time: time,
        duration_mins: duration,
        attendee_confirmed: markConfirmed,
        interviewer_confirmed: markConfirmed,
      })
      .eq("id", interviewId)
      .select()
      .single();
    if (error) throw error;
    return fromRow<Interview>(data);
  },
});

// ── Sacrament meeting bulletins ──────────────────────────────────────────────

const bulletinRowSchema = z.object({
  label: z.string().describe("Left-hand label, e.g. 'Opening Hymn' or 'First Speaker'"),
  value: z
    .string()
    .optional()
    .describe("Right-hand value, e.g. \"#19, 'We Thank Thee, O God, for a Prophet'\". Omit for a full-width centered row."),
});

/** Accept ISO (YYYY-MM-DD) or US (MM/DD/YYYY) dates and return ISO. */
function normalizeDateInput(input: string): string {
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, mm, dd, yyyy] = us;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return s;
}

async function findSacramentMeeting(date: string): Promise<{ row: Record<string, unknown> | null; sunday: string }> {
  const sunday = upcomingSunday(normalizeDateInput(date));
  const { data, error } = await db()
    .from("meetings")
    .select("*")
    .eq("type", "sacrament_meeting")
    .eq("date", sunday)
    .maybeSingle();
  if (error) throw error;
  return { row: data, sunday };
}

export const getSacramentBulletin = tool({
  description:
    "Get the sacrament meeting bulletin (order of service) for a given Sunday. Use this before editing so you can modify and write back the full program. If the date isn't a Sunday it's rolled forward to the next one.",
  inputSchema: z.object({
    date: z.string().optional().describe("ISO date YYYY-MM-DD; defaults to the upcoming Sunday"),
  }),
  execute: async ({ date }) => {
    const { row, sunday } = await findSacramentMeeting(date ?? new Date().toISOString().slice(0, 10));
    if (!row) return { exists: false, date: sunday };
    const meeting = fromRow<Meeting>(row);
    const program = meeting.program ?? defaultBulletin({});
    return {
      exists: true,
      date: sunday,
      meetingId: meeting.id,
      title: meeting.title,
      time: meeting.time,
      location: meeting.location,
      status: meeting.status,
      program: {
        presiding: program.presiding,
        conducting: program.conducting,
        chorister: program.chorister,
        organist: program.organist,
        secondHour: program.secondHour,
        quote: program.quote,
        quoteBy: program.quoteBy,
        rows: program.rows.map((r) => ({ label: r.label, value: r.value, anchor: r.anchor })),
      },
    };
  },
});

export const updateSacramentBulletin = tool({
  description:
    "Create or update the sacrament meeting bulletin for a Sunday. Provide only the header fields you want to change; existing ones are kept. Provide `rows` to replace the full order of service (read it first with getSacramentBulletin, then send back the modified list) — omit `rows` to leave the order of service unchanged. The 'Administration of the Sacrament' anchor row is always preserved.",
  inputSchema: z.object({
    date: z.string().describe("ISO date YYYY-MM-DD (rolled forward to the next Sunday if needed)"),
    presiding: z.string().optional(),
    conducting: z.string().optional(),
    chorister: z.string().optional(),
    organist: z.string().optional(),
    secondHour: z.string().optional().describe("What happens in the second hour, e.g. 'Sunday School'"),
    quote: z.string().optional().describe("Spiritual thought / quote printed on the bulletin"),
    quoteBy: z.string().optional().describe("Attribution for the quote"),
    rows: z.array(bulletinRowSchema).optional().describe("Full order-of-service rows, in order. Replaces the existing program rows."),
    title: z.string().optional(),
    time: z.string().optional().describe("24-hour time HH:MM"),
    location: z.string().optional(),
  }),
  execute: async ({ date, rows, title, time, location, ...header }) => {
    const { row, sunday } = await findSacramentMeeting(date);
    const existing = row ? fromRow<Meeting>(row) : null;
    const base = existing?.program ?? defaultBulletin({});

    // Keep existing header fields unless the caller overrides them; replace rows
    // only when provided. parseBulletin normalizes the result and guarantees the
    // single sacrament anchor row exists.
    const merged = {
      presiding: header.presiding ?? base.presiding,
      conducting: header.conducting ?? base.conducting,
      chorister: header.chorister ?? base.chorister,
      organist: header.organist ?? base.organist,
      secondHour: header.secondHour ?? base.secondHour,
      quote: header.quote ?? base.quote,
      quoteBy: header.quoteBy ?? base.quoteBy,
      rows: rows ? rows.map((r) => ({ label: r.label, value: r.value })) : base.rows,
    };
    const program: SacramentProgram = parseBulletin(merged);

    if (existing) {
      const patch: Record<string, unknown> = { program };
      if (title !== undefined) patch.title = title;
      if (time !== undefined) patch.time = time;
      if (location !== undefined) patch.location = location;
      const { error } = await db().from("meetings").update(patch).eq("id", existing.id);
      if (error) throw error;
      return { ok: true, action: "updated", date: sunday, meetingId: existing.id, rowCount: program.rows.length };
    }

    const id = crypto.randomUUID();
    const { error } = await db()
      .from("meetings")
      .insert({
        id,
        title: title ?? "Sacrament Meeting",
        type: "sacrament_meeting",
        date: sunday,
        time: time ?? null,
        location: location ?? null,
        status: "upcoming",
        agenda: [],
        program,
        created_by: "ai-agent",
      });
    if (error) throw error;
    return { ok: true, action: "created", date: sunday, meetingId: id, rowCount: program.rows.length };
  },
});

/** "HH:MM" → minutes since midnight. */
function toMins(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// ── Announcements (printed on the sacrament meeting bulletin) ─────────────────

export const getAnnouncements = tool({
  description:
    "List ward announcements. By default returns the active ones (not archived, event date not yet passed) that print on the bulletin. Use to find an announcement's id before updating it.",
  inputSchema: z.object({
    filter: z.enum(["active", "archived", "all"]).optional().default("active"),
    limitCount: z.number().optional().default(30),
  }),
  execute: async ({ filter = "active", limitCount = 30 }) => {
    const { data, error } = await db()
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limitCount);
    if (error) throw error;
    let list = (data ?? []).map((r) => fromRow<Announcement>(r));
    if (filter === "active") list = list.filter((a) => isAnnouncementActive(a));
    else if (filter === "archived") list = list.filter((a) => a.archived);
    return list;
  },
});

export const createAnnouncement = tool({
  description:
    "Create a ward announcement. It is automatically included on the sacrament meeting bulletin until its event date passes (announcements with no date are standing until archived). The description supports simple formatting: **bold**, *italic*, and newlines for line breaks. These render in the printed PDF bulletin.",
  inputSchema: z.object({
    title: z.string().describe("Short headline"),
    description: z.string().optional().describe("Body text. Supports formatting: **bold**, *italic*, and newlines for line breaks"),
    date: z.string().optional().describe("Event date YYYY-MM-DD (optional; omit for a standing announcement)"),
    time: z.string().optional().describe("Event time HH:MM"),
    location: z.string().optional(),
  }),
  execute: async ({ title, description, date, time, location }) => {
    const { data, error } = await db()
      .from("announcements")
      .insert({
        id: crypto.randomUUID(),
        title,
        description: description ?? null,
        date: date ? normalizeDateInput(date) : null,
        time: time ?? null,
        location: location ?? null,
        archived: false,
        created_by: "ai-agent",
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow<Announcement>(data);
  },
});

export const updateAnnouncement = tool({
  description:
    "Update an existing announcement (get its id from getAnnouncements). Provide only the fields to change. Set archived=true to retire it from the bulletin, or archived=false to restore it. The description supports simple formatting: **bold**, *italic*, and newlines for line breaks.",
  inputSchema: z.object({
    id: z.string(),
    title: z.string().optional(),
    description: z.string().optional().describe("Body text. Supports formatting: **bold**, *italic*, and newlines for line breaks"),
    date: z.string().optional().describe("Event date YYYY-MM-DD (use an empty string to clear it)"),
    time: z.string().optional().describe("Event time HH:MM (empty string to clear)"),
    location: z.string().optional(),
    archived: z.boolean().optional(),
  }),
  execute: async ({ id, title, description, date, time, location, archived }) => {
    const patch: Record<string, unknown> = {};
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description || null;
    if (date !== undefined) patch.date = date ? normalizeDateInput(date) : null;
    if (time !== undefined) patch.time = time || null;
    if (location !== undefined) patch.location = location || null;
    if (archived !== undefined) patch.archived = archived;
    if (Object.keys(patch).length === 0) {
      return { error: "No fields to update were provided." };
    }
    const { data, error } = await db()
      .from("announcements")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return fromRow<Announcement>(data);
  },
});

// ── Meeting agendas (bishopric & ward council) ───────────────────────────────

const AGENDA_MEETING_TYPES = ["bishopric", "ward_council"] as const;

/** Find the meeting to act on: an exact date if given, else the soonest upcoming. */
async function resolveAgendaMeeting(
  type: "bishopric" | "ward_council",
  date?: string,
): Promise<Meeting | null> {
  let query = db().from("meetings").select("*").eq("type", type);
  if (date) {
    query = query.eq("date", normalizeDateInput(date));
  } else {
    const today = new Date().toISOString().slice(0, 10);
    query = query.gte("date", today).eq("status", "upcoming").order("date", { ascending: true });
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data ? fromRow<Meeting>(data) : null;
}

export const getMeetingAgenda = tool({
  description:
    "Read a bishopric or ward council meeting's agenda (its sections and items). Use this before adding items so you can place them under the right section. Defaults to the soonest upcoming meeting of that type; pass a date to target a specific one.",
  inputSchema: z.object({
    type: z.enum(AGENDA_MEETING_TYPES).describe("Which meeting's agenda to read"),
    date: z.string().optional().describe("ISO date YYYY-MM-DD; omit for the next upcoming meeting"),
  }),
  execute: async ({ type, date }) => {
    const meeting = await resolveAgendaMeeting(type, date);
    if (!meeting) return { exists: false, type, date };
    return {
      exists: true,
      meetingId: meeting.id,
      title: meeting.title,
      date: meeting.date,
      sections: meeting.sections ?? [],
      agenda: meeting.agenda.map((a) => ({
        id: a.id, title: a.title, section: a.section, presenter: a.presenter,
        notes: a.notes, outcome: a.outcome, source: a.source,
      })),
    };
  },
});

export const addAgendaItems = tool({
  description:
    "Add one or more items to a bishopric or ward council meeting's agenda — e.g. after an organization leader replies with the items they want discussed. Place each item under one of the meeting's sections (read them first with getMeetingAgenda). Set `source` to the organization or leader the items came from. Targets the soonest upcoming meeting of the given type unless meetingId or date is provided.",
  inputSchema: z.object({
    type: z.enum(AGENDA_MEETING_TYPES).optional().describe("Meeting type (used when meetingId is omitted)"),
    meetingId: z.string().optional().describe("Specific meeting id (from getMeetingAgenda)"),
    date: z.string().optional().describe("ISO date YYYY-MM-DD (used with type when meetingId is omitted)"),
    source: z.string().optional().describe("Organization or leader the items came from, e.g. 'Relief Society'"),
    items: z.array(z.object({
      title: z.string(),
      section: z.string().optional().describe("Section heading the item belongs under"),
      presenter: z.string().optional(),
      durationMins: z.number().optional(),
      notes: z.string().optional(),
    })).min(1),
  }),
  execute: async ({ type, meetingId, date, source, items }) => {
    let meeting: Meeting | null = null;
    if (meetingId) {
      const { data, error } = await db().from("meetings").select("*").eq("id", meetingId).maybeSingle();
      if (error) throw error;
      meeting = data ? fromRow<Meeting>(data) : null;
    } else if (type) {
      meeting = await resolveAgendaMeeting(type, date);
    }
    if (!meeting) return { error: "No matching meeting found. Provide a meetingId, or a type (and optional date)." };

    const additions: AgendaItem[] = items.map((i) => ({
      id: crypto.randomUUID(),
      title: i.title,
      section: i.section,
      presenter: i.presenter,
      durationMins: i.durationMins,
      notes: i.notes,
      source,
    }));
    const agenda = [...meeting.agenda, ...additions];
    const { error } = await db().from("meetings").update({ agenda }).eq("id", meeting.id);
    if (error) throw error;
    return { ok: true, meetingId: meeting.id, date: meeting.date, added: additions.length };
  },
});

export const recordSolicitationReply = tool({
  description:
    "Record an organization leader's reply to a pre-meeting agenda request, marking that request as replied. Use after you've added the leader's items with addAgendaItems.",
  inputSchema: z.object({
    solicitationId: z.string().describe("The agenda request's id"),
    replyText: z.string().describe("The leader's raw reply text"),
  }),
  execute: async ({ solicitationId, replyText }) => {
    const { error } = await db()
      .from("agenda_solicitations")
      .update({ reply_text: replyText, status: "replied" })
      .eq("id", solicitationId);
    if (error) throw error;
    return { ok: true, solicitationId };
  },
});

// ── Quote of the day ──────────────────────────────────────────────────────────

export const getQuoteOfTheDay = tool({
  description:
    "Fetch today's inspirational quote from the Church of Jesus Christ website (churchofjesuschrist.org). Returns the quote text and attribution. Use when the user asks for a quote, spiritual thought, or quote of the day.",
  inputSchema: z.object({}),
  execute: async () => {
    const url = "https://www.churchofjesuschrist.org/my-home?lang=eng";
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OpenBishopric/1.0)",
          Accept: "text/html",
        },
      });
      if (!res.ok) {
        return { error: `Failed to fetch page (HTTP ${res.status}). Try again later.` };
      }
      const html = await res.text();

      let quote: string | undefined;
      let attribution: string | undefined;

      // Strategy 1: look for JSON data embedded in the page (common in React SSR)
      const jsonMatches = html.matchAll(/<script[^>]*>\s*(\{[\s\S]*?"quote[\s\S]*?\})\s*<\/script>/gi);
      for (const m of jsonMatches) {
        try {
          const data = JSON.parse(m[1]);
          const found = findQuoteInObject(data);
          if (found) {
            quote = found.quote;
            attribution = found.attribution;
            break;
          }
        } catch { /* not valid JSON, skip */ }
      }

      // Strategy 2: look for __NEXT_DATA__ or similar embedded state
      if (!quote) {
        const stateMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
          ?? html.match(/<script[^>]*>\s*window\.__(?:INITIAL_STATE|APP_STATE|DATA)__\s*=\s*([\s\S]*?);\s*<\/script>/i);
        if (stateMatch) {
          try {
            const data = JSON.parse(stateMatch[1]);
            const found = findQuoteInObject(data);
            if (found) {
              quote = found.quote;
              attribution = found.attribution;
            }
          } catch { /* skip */ }
        }
      }

      // Strategy 3: scrape from HTML structure
      if (!quote) {
        const quotePatterns = [
          /class="[^"]*quote[^"]*"[^>]*>[\s\S]*?<(?:p|blockquote|span|div)[^>]*>([\s\S]*?)<\/(?:p|blockquote|span|div)>/i,
          /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i,
          /data-testid="[^"]*quote[^"]*"[^>]*>([\s\S]*?)<\//i,
        ];
        for (const pattern of quotePatterns) {
          const m = html.match(pattern);
          if (m) {
            quote = stripHtml(m[1]).trim();
            break;
          }
        }
        if (quote) {
          const attrMatch = html.match(/class="[^"]*(?:attribution|author|cite)[^"]*"[^>]*>([\s\S]*?)<\//i);
          if (attrMatch) attribution = stripHtml(attrMatch[1]).trim();
        }
      }

      if (!quote) {
        return { error: "Could not extract the quote from the page. The page structure may have changed." };
      }

      return {
        quote: stripHtml(quote).trim(),
        ...(attribution ? { attribution: stripHtml(attribution).trim() } : {}),
        source: url,
      };
    } catch (err) {
      return { error: `Failed to fetch quote: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
});

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
}

function findQuoteInObject(obj: unknown): { quote: string; attribution?: string } | null {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;

  if (typeof record.quote === "string" && record.quote.length > 10) {
    return {
      quote: record.quote,
      attribution: typeof record.attribution === "string" ? record.attribution
        : typeof record.quoteBy === "string" ? record.quoteBy
        : typeof record.author === "string" ? record.author
        : undefined,
    };
  }
  if (typeof record.quoteText === "string" && record.quoteText.length > 10) {
    return {
      quote: record.quoteText,
      attribution: typeof record.quoteAuthor === "string" ? record.quoteAuthor
        : typeof record.author === "string" ? record.author
        : undefined,
    };
  }

  for (const val of Object.values(record)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        const found = findQuoteInObject(item);
        if (found) return found;
      }
    } else if (val && typeof val === "object") {
      const found = findQuoteInObject(val);
      if (found) return found;
    }
  }
  return null;
}

// ── Memory: standing preferences the assistant remembers across conversations ──

export const rememberPreference = tool({
  description:
    "Save a standing preference, rule, or fact to remember across ALL future conversations (e.g. 'when building a bulletin, don't add the conference talk to the agenda'). Use this whenever the user asks you to remember something or to always/never do something. Keep each note to a single clear instruction.",
  inputSchema: z.object({
    content: z.string().describe("The preference/rule to remember, phrased as a clear instruction"),
  }),
  execute: async ({ content }) => {
    const { data, error } = await db()
      .from("agent_notes")
      .insert({ id: crypto.randomUUID(), content: content.trim(), created_by: "ai-agent" })
      .select("id, content, created_at")
      .single();
    if (error) throw error;
    return { ok: true, id: data.id, content: data.content };
  },
});

export const getRememberedPreferences = tool({
  description:
    "List the standing preferences/notes you've been asked to remember. The active ones are already applied to your instructions; use this when the user asks what you remember, or to get a note's id before forgetting it.",
  inputSchema: z.object({}),
  execute: async () => {
    const notes = await listAgentNotes(db());
    return { notes: notes.map((n) => ({ id: n.id, content: n.content })) };
  },
});

export const forgetPreference = tool({
  description:
    "Delete a remembered preference/note by id (get the id from getRememberedPreferences). Use when the user asks you to forget or stop doing something you were remembering.",
  inputSchema: z.object({
    id: z.string(),
  }),
  execute: async ({ id }) => {
    const { error } = await db().from("agent_notes").delete().eq("id", id);
    if (error) throw error;
    return { ok: true, id };
  },
});

export const agentTools = {
  getMembers,
  getTasks,
  createTask,
  updateTaskStatus,
  getCallings,
  // Roster / org chart (Chart tab)
  getRoster,
  importRoster,
  // Interviews
  getInterviews,
  getInterviewers,
  createInterview,
  findInterviewSlots,
  scheduleInterview,
  // Sacrament meeting bulletins
  getSacramentBulletin,
  updateSacramentBulletin,
  // Announcements
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  // Meeting agendas
  getMeetingAgenda,
  addAgendaItems,
  recordSolicitationReply,
  // Quote of the day
  getQuoteOfTheDay,
  // Memory
  rememberPreference,
  getRememberedPreferences,
  forgetPreference,
};
