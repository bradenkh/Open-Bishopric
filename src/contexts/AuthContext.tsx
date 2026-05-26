"use client";

/**
 * Mock AuthContext — no Firebase, no network calls.
 * Auth state is persisted in localStorage so the login page still works
 * as a gate (any email + password is accepted).
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppUser } from "@/types";

const MOCK_BISHOP: AppUser = {
  uid: "mock-bishop-001",
  email: "bishop@ward.demo",
  displayName: "Bishop Anderson",
  role: "bishop",
};

const STORAGE_KEY = "demo-auth";

interface AuthContextValue {
  /** Lightweight user object (just uid) — mirrors Firebase User shape used by pages. */
  user: { uid: string } | null;
  appUser: AppUser | null;
  loading: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [authError]              = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // localStorage is only available on the client
    setLoggedIn(localStorage.getItem(STORAGE_KEY) === "1");
    setLoading(false);
  }, []);

  const signIn = async (_email: string, _password: string) => {
    localStorage.setItem(STORAGE_KEY, "1");
    setLoggedIn(true);
  };

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setLoggedIn(false);
    router.replace("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user:    loggedIn ? { uid: MOCK_BISHOP.uid } : null,
        appUser: loggedIn ? MOCK_BISHOP : null,
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
