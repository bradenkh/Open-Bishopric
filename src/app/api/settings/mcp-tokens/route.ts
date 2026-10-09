import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createToken, deleteToken, listTokens } from "@/lib/mcp/tokens";

/** The signed-in member's MCP connector tokens (Settings → Claude connector). */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ tokens: await listTokens(auth.user.uid) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load tokens" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { name } = await request.json().catch(() => ({}));
  const label = typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : "Claude";
  try {
    const { token, info } = await createToken(auth.user.uid, label);
    return NextResponse.json({ token, info });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create token" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await deleteToken(auth.user.uid, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to revoke token" }, { status: 500 });
  }
}
