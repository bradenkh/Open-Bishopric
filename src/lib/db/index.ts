import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppUser,
  Announcement,
  AvailabilityBlock,
  AvailabilityException,
  BishopricMember,
  Calling,
  Interview,
  Meeting,
  Member,
  RosterGroup,
  Task,
  UserRole,
  WardInfo,
} from "@/types";
import { fromRow, toRow } from "./mappers";

type DB = SupabaseClient;

interface Order {
  column: string;
  ascending?: boolean;
}

/**
 * A typed CRUD repository over a single table. The Supabase client is passed in
 * so the same repository works in the browser (anon client + RLS), in Server
 * Components/Actions, and with the service-role client (agent tools).
 *
 * Domain rows use app-supplied text ids, so `create` expects the model to
 * include its `id`.
 */
function repo<T extends { id: string }>(table: string, order?: Order) {
  return {
    async list(db: DB): Promise<T[]> {
      let query = db.from(table).select("*");
      if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((r) => fromRow<T>(r as Record<string, unknown>));
    },
    async create(db: DB, model: T): Promise<T> {
      const { data, error } = await db
        .from(table)
        .insert(toRow(model as Record<string, unknown>))
        .select()
        .single();
      if (error) throw error;
      return fromRow<T>(data as Record<string, unknown>);
    },
    async update(db: DB, id: string, patch: Partial<T>): Promise<T> {
      const { data, error } = await db
        .from(table)
        .update(toRow(patch as Record<string, unknown>))
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return fromRow<T>(data as Record<string, unknown>);
    },
    async remove(db: DB, id: string): Promise<void> {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}

export const membersRepo = repo<Member>("members", { column: "last_name" });
export const bishopricRepo = repo<BishopricMember>("bishopric_members", { column: "name" });
export const callingsRepo = repo<Calling>("callings", { column: "created_at", ascending: false });
export const meetingsRepo = repo<Meeting>("meetings", { column: "date" });
export const announcementsRepo = repo<Announcement>("announcements", { column: "created_at", ascending: false });
export const interviewsRepo = repo<Interview>("interviews", { column: "created_at", ascending: false });
export const availabilityRepo = repo<AvailabilityBlock>("availability_blocks", { column: "weekday" });
export const availabilityExceptionsRepo = repo<AvailabilityException>("availability_exceptions", { column: "start_date" });
export const tasksRepo = repo<Task>("tasks", { column: "created_at", ascending: false });

// ── Roster groups: ordered org chart. Rows carry id/position the model omits. ──
export const rosterRepo = {
  async list(db: DB): Promise<RosterGroup[]> {
    const { data, error } = await db.from("roster_groups").select("*").order("position");
    if (error) throw error;
    return (data ?? []).map((r) => fromRow<RosterGroup>(r as Record<string, unknown>));
  },
};

// ── Ward info: singleton row keyed 'default'. ──────────────────────────────────
export const wardInfoRepo = {
  async get(db: DB): Promise<WardInfo | null> {
    const { data, error } = await db.from("ward_info").select("*").eq("id", "default").maybeSingle();
    if (error) throw error;
    return data ? fromRow<WardInfo>(data as Record<string, unknown>) : null;
  },
  async update(db: DB, patch: Partial<WardInfo>): Promise<WardInfo> {
    const { data, error } = await db
      .from("ward_info")
      .update(toRow(patch as Record<string, unknown>))
      .eq("id", "default")
      .select()
      .single();
    if (error) throw error;
    return fromRow<WardInfo>(data as Record<string, unknown>);
  },
};

// ── Profiles: identity + role for the signed-in user. ──────────────────────────

/** DB roles use underscores (`exec_secretary`); AppUser.role uses a hyphen. */
function toAppRole(dbRole: string): UserRole {
  return dbRole.replace(/_/g, "-") as UserRole;
}

export async function getProfile(db: DB, userId: string): Promise<AppUser | null> {
  const { data, error } = await db
    .from("profiles")
    .select("id, email, display_name, role, photo_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    id: string;
    email: string | null;
    display_name: string;
    role: string;
    photo_url: string | null;
  };
  return {
    uid: row.id,
    email: row.email ?? "",
    displayName: row.display_name,
    role: toAppRole(row.role),
    photoURL: row.photo_url ?? undefined,
  };
}
