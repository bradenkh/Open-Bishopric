import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/db";
import type { AppUser } from "@/types";

/** The signed-in user's profile (identity + role), or null if not signed in. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return getProfile(supabase, user.id);
}

/**
 * Guard for privileged operations (e.g. managing users). Every signed-in user
 * is a trusted bishopric member, so this only requires authentication. Returns
 * the caller's profile, or a 401 Response to return from the Route Handler.
 */
export async function requireUser(): Promise<
  { user: AppUser } | { error: Response }
> {
  const user = await getCurrentUser();
  if (!user) return { error: new Response("Unauthorized", { status: 401 }) };
  return { user };
}
