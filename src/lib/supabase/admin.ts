import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses Row Level Security — use ONLY in
 * trusted server contexts (Route Handlers, Server Actions) after you have
 * verified the caller is authorized. Never import this into client code.
 *
 * Used for privileged operations such as inviting bishopric members and the
 * AI agent's data access.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
