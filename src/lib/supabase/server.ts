import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use on the server — Server Components, Route Handlers,
 * and Server Actions. Backed by Next.js's `cookies()` so it reads the user's
 * session and can refresh it.
 *
 * Note: in Server Components, cookies cannot be written (the response has
 * already started streaming), so the `setAll` calls are wrapped in try/catch.
 * Token refresh in that case is handled by the proxy (`src/proxy.ts`).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — ignore. The proxy refreshes
            // the session cookie on the next request.
          }
        },
      },
    },
  );
}
