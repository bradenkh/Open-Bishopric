import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (the browser).
 *
 * Reads/writes the auth session from cookies via `@supabase/ssr`, so the
 * session is shared with the server (Server Components, Route Handlers, and
 * the proxy). Safe to call repeatedly — `createBrowserClient` memoizes a
 * single instance per browser context.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
