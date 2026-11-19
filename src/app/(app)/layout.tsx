import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { decideAccess, AuthError } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { IdleSignOut } from "@/components/IdleSignOut";
import { OutcomeSheet } from "@/components/calls/OutcomeSheet";
import { touchAttendance } from "@/lib/calls/repo";
import { myAttendance } from "@/lib/calls/queries";

const ROUTE: Record<string, string> = { unauthenticated: "/login", "not-set-up": "/not-set-up", "aal2 required": "/mfa" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let session;
  try { session = decideAccess(await loadSession(), []); }
  catch (e) { if (e instanceof AuthError) redirect(ROUTE[e.reason] ?? "/login"); throw e; }

  await touchAttendance(session); // §14: any app request is activity
  const [{ data: org }, attendance] = await Promise.all([
    (await createClient()).from("orgs").select("idle_timeout_minutes").single(),
    myAttendance(session),
  ]);

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar role={session.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar role={session.role} fullName={session.fullName} attendance={attendance} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
      <IdleSignOut minutes={org?.idle_timeout_minutes ?? 30} />
      {session.role !== "admin" && <OutcomeSheet />}
    </div>
  );
}
