import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { Templates } from "@/components/comms/Templates";
import { fmtDateTime } from "@/lib/calls/time";

export default async function Communications() {
  const s = await requireRole("super_admin", "admin", "team_leader", "caller");
  const db = await createClient();
  const [{ data: log }, { data: templates }] = await Promise.all([
    db.from("communications").select("id, channel, body, at, lead_id, user_id, lead:leads(name), sender:profiles!communications_user_id_org_id_fkey(full_name)")
      .order("at", { ascending: false }).limit(100),
    db.from("message_templates").select("id, name, channel, body").order("name"),
  ]);
  const one = <T,>(x: T | T[] | null) => (Array.isArray(x) ? x[0] : x);
  return (
    <>
      <PageHeader title="Communications" subtitle="WhatsApp and SMS messages opened from CallOpps, and the saved templates." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="rounded-xl border bg-white shadow-sm">
          <h2 className="border-b px-5 py-3 font-semibold text-slate-900">Recent messages</h2>
          {s.role === "admin" ? <p className="p-5 text-sm text-slate-500">Message logs are shown to the Super Admin, team leaders and callers. Counts are in WhatsApp Reports.</p>
            : (log ?? []).length === 0 ? <p className="p-5 text-sm text-slate-500">No messages yet. Use WhatsApp or SMS on a lead in My tasks.</p> : (
            <ul className="divide-y">
              {(log ?? []).map((m) => (
                <li key={m.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${m.channel === "whatsapp" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{m.channel === "whatsapp" ? "WhatsApp" : "SMS"}</span>
                    <Link href={s.role === "caller" ? `/my-tasks?lead=${m.lead_id}` : `/leads/${m.lead_id}`} className="font-medium text-slate-800 hover:text-rose-700">{one(m.lead as unknown as { name: string | null } | null)?.name || "Unnamed lead"}</Link>
                    <span>· {one(m.sender as unknown as { full_name: string } | null)?.full_name ?? "—"}</span><span>· {fmtDateTime(m.at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-700">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Templates templates={templates ?? []} canEdit={s.role === "super_admin" || s.role === "admin"} />
      </div>
    </>
  );
}
