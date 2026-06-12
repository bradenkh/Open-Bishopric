"use client";

/**
 * The app's single source of truth for ward data, backed by Supabase.
 *
 * Replaces the old per-page `useState([...MOCK_*])` prototype state. On mount
 * (inside the authenticated dashboard layout) it loads every collection from
 * Supabase via the browser client — Row Level Security restricts access to
 * authenticated bishopric members. Mutations are optimistic: local state
 * updates immediately, then the change is persisted; on failure the affected
 * collection is reloaded from the server so the UI never drifts silently.
 *
 * Each collection exposes the same shape:
 *   items, create(fullItem), update(id, patch), remove(id)
 * Items carry app-generated string ids (use `newId()`), matching the schema's
 * text primary keys.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  announcementsRepo,
  availabilityExceptionsRepo,
  availabilityRepo,
  callingsRepo,
  interviewsRepo,
  listProfiles,
  meetingsRepo,
  membersRepo,
  rosterRepo,
  tasksRepo,
  wardInfoRepo,
} from "@/lib/db";
import type {
  Announcement,
  AppUser,
  AvailabilityBlock,
  AvailabilityException,
  BishopricMember,
  BishopricRole,
  Calling,
  Interview,
  Meeting,
  Member,
  RosterGroup,
  Task,
  WardInfo,
} from "@/types";

/** Generate a client-side id for a new row (the schema uses text PKs). */
export function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface Collection<T> {
  items: T[];
  create: (item: T) => Promise<void>;
  update: (id: string, patch: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

interface Repo<T extends { id: string }> {
  list: (db: SupabaseClient) => Promise<T[]>;
  create: (db: SupabaseClient, item: T) => Promise<T>;
  update: (db: SupabaseClient, id: string, patch: Partial<T>) => Promise<T>;
  remove: (db: SupabaseClient, id: string) => Promise<void>;
}

interface DataContextValue {
  loading: boolean;

  callings: Collection<Calling>;
  interviews: Collection<Interview>;
  meetings: Collection<Meeting>;
  announcements: Collection<Announcement>;
  availability: Collection<AvailabilityBlock>;
  exceptions: Collection<AvailabilityException>;

  members: Member[];
  /** Everyone with a login. The settings screen manages these. */
  profiles: AppUser[];
  /** Re-fetch profiles (after an invite or role change). */
  reloadProfiles: () => Promise<void>;
  /** Re-fetch every collection (e.g. after the AI agent changes data server-side). */
  reloadAll: () => Promise<void>;
  /** The bishopric roster, derived from `profiles` (people with leadership roles). */
  bishopric: BishopricMember[];
  roster: RosterGroup[];
  /** Edit a roster group (rename callings, toggle chart visibility, add/remove positions). */
  updateRosterGroup: (id: string, patch: Partial<RosterGroup>) => Promise<void>;

  wardInfo: WardInfo | null;
  updateWardInfo: (patch: Partial<WardInfo>) => Promise<void>;

  // ── Tasks (with the bishopric workflow helpers the callings page relies on) ──
  tasks: Task[];
  addTask: (task: Task) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  /** Mark a task complete. If it's a set_apart task, auto-creates a clerk LCR task. */
  completeTask: (id: string) => Promise<void>;
  /** Complete every open task whose context.callingId matches. */
  completeCallingTasks: (callingId: string) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

/** Build an optimistic CRUD collection over a repo + local state setter. */
function makeCollection<T extends { id: string }>(
  db: SupabaseClient,
  repo: Repo<T>,
  items: T[],
  setItems: React.Dispatch<React.SetStateAction<T[]>>,
): Collection<T> {
  const reload = async () => {
    try {
      setItems(await repo.list(db));
    } catch (err) {
      console.error("Failed to reload collection", err);
    }
  };
  return {
    items,
    create: async (item) => {
      setItems((prev) => [item, ...prev]);
      try {
        await repo.create(db, item);
      } catch (err) {
        console.error("Create failed", err);
        await reload();
      }
    },
    update: async (id, patch) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      try {
        await repo.update(db, id, patch);
      } catch (err) {
        console.error("Update failed", err);
        await reload();
      }
    },
    remove: async (id) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      try {
        await repo.remove(db, id);
      } catch (err) {
        console.error("Delete failed", err);
        await reload();
      }
    },
  };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [db] = useState(() => createClient());
  const [loading, setLoading] = useState(true);

  const [callings, setCallings] = useState<Calling[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<AppUser[]>([]);
  const [roster, setRoster] = useState<RosterGroup[]>([]);

  // The bishopric roster is the set of people with leadership roles who can sign
  // in. Derived from profiles so there's a single source of truth for roles.
  const bishopric = useMemo<BishopricMember[]>(
    () =>
      profiles.map((p) => ({
        id: p.uid,
        name: p.displayName,
        // AppUser.role is hyphenated; BishopricRole uses underscores.
        role: p.role.replace(/-/g, "_") as BishopricRole,
      })),
    [profiles],
  );

  const reloadProfiles = useCallback(async () => {
    try {
      setProfiles(await listProfiles(db));
    } catch (err) {
      console.error("Failed to reload profiles", err);
    }
  }, [db]);
  const [wardInfo, setWardInfo] = useState<WardInfo | null>(null);

  /** Fetch every collection and replace local state. Used on mount and to
   *  refresh after the AI agent mutates data server-side (its writes don't go
   *  through the optimistic collections, so the client cache must be refilled). */
  const loadAll = useCallback(async () => {
    const [
      callingsData,
      interviewsData,
      meetingsData,
      announcementsData,
      availabilityData,
      exceptionsData,
      tasksData,
      membersData,
      profilesData,
      rosterData,
      wardInfoData,
    ] = await Promise.all([
      callingsRepo.list(db),
      interviewsRepo.list(db),
      meetingsRepo.list(db),
      announcementsRepo.list(db),
      availabilityRepo.list(db),
      availabilityExceptionsRepo.list(db),
      tasksRepo.list(db),
      membersRepo.list(db),
      listProfiles(db),
      rosterRepo.list(db),
      wardInfoRepo.get(db),
    ]);
    setCallings(callingsData);
    setInterviews(interviewsData);
    setMeetings(meetingsData);
    setAnnouncements(announcementsData);
    setAvailability(availabilityData);
    setExceptions(exceptionsData);
    setTasks(tasksData);
    setMembers(membersData);
    setProfiles(profilesData);
    setRoster(rosterData);
    setWardInfo(wardInfoData);
  }, [db]);

  const reloadAll = useCallback(async () => {
    try {
      await loadAll();
    } catch (err) {
      console.error("Failed to reload ward data", err);
    }
  }, [loadAll]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadAll();
      } catch (err) {
        console.error("Failed to load ward data", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadAll]);

  // ── Tasks workflow (ported from the old TasksContext, now persisted) ─────────
  const addTask = useCallback(
    async (task: Task) => {
      setTasks((prev) => [task, ...prev]);
      try {
        await tasksRepo.create(db, task);
      } catch (err) {
        console.error("Create task failed", err);
        setTasks(await tasksRepo.list(db));
      }
    },
    [db],
  );

  const updateTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      try {
        await tasksRepo.update(db, id, patch);
      } catch (err) {
        console.error("Update task failed", err);
        setTasks(await tasksRepo.list(db));
      }
    },
    [db],
  );

  const completeTask = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      const task = tasks.find((t) => t.id === id);
      await updateTask(id, { status: "completed" });

      // When a set-apart task is completed, auto-create the clerk's LCR task.
      if (task?.context?.taskType === "set_apart") {
        const clerk = bishopric.find((m) => m.role === "clerk");
        const position = task.context?.position as string | undefined;
        const memberName = task.memberName ?? "Unknown";
        const setApartDate = task.context?.setApartDate as string | undefined;
        const setApartBy = task.context?.setApartBy as string | undefined;

        const clerkTask: Task = {
          id: newId(),
          title: `Update LCR — ${memberName}${position ? ` / ${position}` : ""}`,
          description: [
            `${memberName} was set apart${setApartDate ? ` on ${setApartDate}` : ""}${setApartBy ? ` by ${setApartBy}` : ""}.`,
            "Please record the calling in LCR (Leader & Clerk Resources) and mark them as set apart.",
          ].join(" "),
          type: "calling",
          status: "active",
          memberName,
          assigneeId: clerk?.id,
          assigneeName: clerk?.name ?? "Ward Clerk",
          context: {
            callingId: task.context?.callingId,
            taskType: "lcr_update",
            position,
          },
          createdBy: "system",
          createdAt: now,
          updatedAt: now,
        };
        await addTask(clerkTask);
      }
    },
    [tasks, bishopric, updateTask, addTask],
  );

  const completeCallingTasks = useCallback(
    async (callingId: string) => {
      const toComplete = tasks.filter(
        (t) => t.context?.callingId === callingId && t.status !== "completed",
      );
      setTasks((prev) =>
        prev.map((t) =>
          t.context?.callingId === callingId && t.status !== "completed"
            ? { ...t, status: "completed" as const }
            : t,
        ),
      );
      try {
        await Promise.all(
          toComplete.map((t) => tasksRepo.update(db, t.id, { status: "completed" })),
        );
      } catch (err) {
        console.error("Complete calling tasks failed", err);
        setTasks(await tasksRepo.list(db));
      }
    },
    [db, tasks],
  );

  const updateRosterGroup = useCallback(
    async (id: string, patch: Partial<RosterGroup>) => {
      setRoster((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
      try {
        await rosterRepo.update(db, id, patch);
      } catch (err) {
        console.error("Update roster group failed", err);
        setRoster(await rosterRepo.list(db));
      }
    },
    [db],
  );

  const updateWardInfo = useCallback(
    async (patch: Partial<WardInfo>) => {
      setWardInfo((prev) => (prev ? { ...prev, ...patch } : prev));
      try {
        await wardInfoRepo.update(db, patch);
      } catch (err) {
        console.error("Update ward info failed", err);
        setWardInfo(await wardInfoRepo.get(db));
      }
    },
    [db],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      loading,
      callings: makeCollection(db, callingsRepo, callings, setCallings),
      interviews: makeCollection(db, interviewsRepo, interviews, setInterviews),
      meetings: makeCollection(db, meetingsRepo, meetings, setMeetings),
      announcements: makeCollection(db, announcementsRepo, announcements, setAnnouncements),
      availability: makeCollection(db, availabilityRepo, availability, setAvailability),
      exceptions: makeCollection(db, availabilityExceptionsRepo, exceptions, setExceptions),
      members,
      profiles,
      reloadProfiles,
      reloadAll,
      bishopric,
      roster,
      updateRosterGroup,
      wardInfo,
      updateWardInfo,
      tasks,
      addTask,
      updateTask,
      completeTask,
      completeCallingTasks,
    }),
    [
      loading,
      db,
      callings,
      interviews,
      meetings,
      announcements,
      availability,
      exceptions,
      members,
      profiles,
      reloadProfiles,
      reloadAll,
      bishopric,
      roster,
      updateRosterGroup,
      wardInfo,
      updateWardInfo,
      tasks,
      addTask,
      updateTask,
      completeTask,
      completeCallingTasks,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

/** Backwards-compatible tasks hook (mirrors the old TasksContext API). */
export function useTasks() {
  const { tasks, addTask, updateTask, completeTask, completeCallingTasks } = useData();
  return { tasks, addTask, updateTask, completeTask, completeCallingTasks };
}
