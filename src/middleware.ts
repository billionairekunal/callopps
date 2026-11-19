import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { routeDecision } from "@/lib/auth/route";
import type { Role } from "@/lib/auth/roles";
import { checkEnv, setupPage } from "@/lib/env";

export async function middleware(req: NextRequest) {
  // A misconfigured deployment explains itself instead of crashing every page with a bare 500.
  // Named one by one: edge middleware only sees variables it reads by name.
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, CALLOPPS_MASTER_KEY: process.env.CALLOPPS_MASTER_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL, VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  };
  const problems = checkEnv(env, process.env.NODE_ENV === "production" && process.env.CALLOPPS_SKIP_ENV_CHECK !== "1");
  if (problems.length) return new NextResponse(setupPage(problems), { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
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
