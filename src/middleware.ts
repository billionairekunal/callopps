import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { routeDecision } from "@/lib/auth/route";
import type { Role } from "@/lib/auth/roles";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  let profile = null, aal = { current: "aal1", next: "aal1" };
  if (user) {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from("profiles").select("role, status").eq("user_id", user.id).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    profile = p as { role: Role; status: "active" | "deactivated" } | null;
    aal = { current: a?.currentLevel ?? "aal1", next: a?.nextLevel ?? "aal1" };
  }

  const d = routeDecision(req.nextUrl.pathname, user?.id ?? null, profile, aal);
  const withCookies = (r: NextResponse) => { res.cookies.getAll().forEach((c) => r.cookies.set(c)); return r; };
  if ("redirect" in d) return withCookies(NextResponse.redirect(new URL(d.redirect, req.url)));
  if ("forbidden" in d) return withCookies(NextResponse.rewrite(new URL("/forbidden", req.url), { status: 403 }));
  return res;
}

export const config = {
  // Everything except Next's own static assets runs through auth.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
