import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js Proxy (formerly Middleware). Runs on every matched request to
 * refresh the Supabase session and redirect unauthenticated users to /login.
 *
 * This is an optimistic gate only — every Server Action, Route Handler, and
 * data query also verifies the session (RLS + the data layer), per the
 * Next.js authentication guidance.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (static assets)
     * - favicon.ico, manifest.json, sw.js, icons (PWA assets)
     * - image files
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|.*\\.(?:png|svg|ico|webmanifest)$).*)",
  ],
};
