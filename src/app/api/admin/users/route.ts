import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = ["bishop", "counselor", "clerk", "exec_secretary"];

/** Generate a readable temporary password for a newly provisioned account. */
function tempPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") + "Aa1!";
}

/**
 * Provision a new bishopric member. Creates a confirmed auth user
 * with a temporary password (no email/SMTP required); the `handle_new_user`
 * trigger creates their profile with the chosen role. Returns the temporary
 * password once so the bishop can share it — the new user can change it under
 * Settings → Account.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { email, displayName, role } = await request.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const password = tempPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName || email.split("@")[0],
      role,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, tempPassword: password });
}
