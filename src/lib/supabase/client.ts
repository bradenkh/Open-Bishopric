import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (the browser).
 *
 * Reads/writes the auth session from cookies via `@supabase/ssr`, so the
 * session is shared with the server (Server Components, Route Handlers, and
 * the proxy). Safe to call repeatedly — `createBrowserClient` memoizes a
 * single instance per browser context.
 */
let logged = false;

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!logged) {
    logged = true;
    console.log("[supabase] NEXT_PUBLIC_SUPABASE_URL:", url ? url.replace(/\/\/.*@/, "//***@") : "MISSING — no Supabase URL configured");
  }
  return createBrowserClient(url!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
