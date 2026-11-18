import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = ["/login", "/auth/callback"];
const needsMfa = (role?: string) => role === "super_admin" || role === "admin";

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
  const path = req.nextUrl.pathname;
  const go = (to: string) => {
    if (path === to) return res;
    const r = NextResponse.redirect(new URL(to, req.url));
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return PUBLIC.includes(path) ? res : go("/login");

  const { data: p } = await supabase.from("profiles").select("role, status").eq("user_id", user.id).maybeSingle();
  if (!p || p.status !== "active") return path === "/set-password" ? res : go("/not-set-up");
  if (path === "/set-password") return res;

  if (needsMfa(p.role)) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") return go("/mfa");
  }
  if (path === "/login" || path === "/mfa" || path === "/not-set-up" || path === "/")
    return go(p.role === "caller" ? "/my-tasks" : "/reports");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
