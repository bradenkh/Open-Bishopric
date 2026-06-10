import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that don't require an authenticated session. */
const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Refreshes the Supabase auth session and gates protected routes.
 *
 * Called from `src/proxy.ts` on every matched request. It:
 *   1. Reads the session cookies and refreshes the access token if needed,
 *      writing the new cookies onto the response.
 *   2. Redirects unauthenticated users away from protected routes.
 *
 * IMPORTANT: always return the `supabaseResponse` object as-is (or copy its
 * cookies onto any new response) so the refreshed session is persisted.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getUser() — it must be the
  // first call so the session is refreshed before any auth checks.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
