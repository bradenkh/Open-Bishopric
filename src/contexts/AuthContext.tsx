"use client";

/**
 * Supabase-backed auth. Invite-only: there is no public sign-up — bishopric
 * members are provisioned in Supabase, and their `profiles` row (with role) is
 * created automatically by the `handle_new_user` trigger.
 *
 * Keeps the same context shape the rest of the app already consumes
 * (`user`, `appUser`, `loading`, `authError`, `signIn`, `signOut`).
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import type { AppUser } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/db";

interface AuthContextValue {
  /** Minimal user object (uid) — mirrors the shape pages already use. */
  user: { uid: string } | null;
  appUser: AppUser | null;
  loading: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<Session | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();

  // Load the signed-in user's profile (identity + role) from the DB.
  const loadProfile = useCallback(
    async (userId: string) => {
      console.log("[auth] loadProfile called for userId:", userId);
      try {
        const profile = await getProfile(supabase, userId);
        console.log("[auth] loadProfile result:", profile ? `found (role=${profile.role})` : "null — no profile row");
        setAppUser(profile);
        if (!profile) {
          setAuthError(
            "No profile row exists for this account. Has the database been " +
              "set up (migrations applied)? The handle_new_user trigger creates " +
              "a profile when a user is added.",
          );
        }
      } catch (err) {
        // Supabase/Postgrest errors are plain objects, not Error instances —
        // surface their message (and code/hint) so the real cause is visible.
        console.error("Failed to load profile", err);
        const e = err as { message?: string; code?: string; hint?: string };
        const detail = e?.message ?? (err instanceof Error ? err.message : String(err));
        setAuthError(
          `Failed to load profile: ${detail}${e?.code ? ` (${e.code})` : ""}${e?.hint ? ` — ${e.hint}` : ""}`,
        );
        setAppUser(null);
      }
    },
    [supabase],
  );

  useEffect(() => {
    let active = true;
    console.log("[auth] useEffect mount — checking for existing session");

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) console.error("[auth] getSession error", { code: error?.code, message: error?.message });
      if (!active) return;
      console.log("[auth] getSession result:", data.session ? `session found, user=${data.session.user.email}` : "no session");
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      console.log("[auth] onAuthStateChange event:", event, nextSession ? `user=${nextSession.user.email}` : "no session");
      setSession(nextSession);
      if (nextSession) {
        await loadProfile(nextSession.user.id);
      } else {
        setAppUser(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      console.log("[auth] signIn attempt for", email);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("[auth] signIn failed", { code: error.code, message: error.message, status: error.status });
        throw error;
      }
      console.log("[auth] signIn OK, user id:", data.session?.user?.id);
      // onAuthStateChange will populate the session and profile.
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAppUser(null);
    setSession(null);
    router.replace("/login");
  }, [supabase, router]);

  return (
    <AuthContext.Provider
      value={{
        user: session ? { uid: session.user.id } : null,
        appUser,
        loading,
        authError,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
