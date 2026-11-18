import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE = 50;
type Search = { action?: string; actor?: string; from?: string; to?: string; page?: string };

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("super_admin");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const db = await createClient();

  let q = db.from("audit_log").select("id, actor_id, action, entity, entity_id, meta, at", { count: "exact" })
    .order("at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.action) q = q.ilike("action", `${sp.action}%`);
  if (sp.actor) q = q.eq("actor_id", sp.actor);
  if (sp.from) q = q.gte("at", `${sp.from}T00:00:00+05:30`);
  if (sp.to) q = q.lte("at", `${sp.to}T23:59:59+05:30`);
  const [{ data: rows, count }, { data: people }] = await Promise.all([q, db.from("profiles").select("user_id, full_name").order("full_name")]);
  const name = new Map(people?.map((p) => [p.user_id, p.full_name]) ?? []);
  const last = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), page: String(p) })}`;
  const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  const field = "h-9 rounded-md border border-input bg-white px-2 text-sm";

  return (
    <>
      <PageHeader title="Activity log" subtitle="Every sign-in, setting change, import and export. Read-only; nobody can edit or delete entries." />
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3 shadow-sm">
        <label className="text-xs text-slate-500">Action<br />
          <select name="action" defaultValue={sp.action ?? ""} className={field}>
            <option value="">All actions</option>
            {["auth", "setup", "centre", "lead", "import", "export"].map((a) => <option key={a} value={a}>{a}.*</option>)}
          </select></label>
        <label className="text-xs text-slate-500">Person<br />
          <select name="actor" defaultValue={sp.actor ?? ""} className={field}>
            <option value="">Everyone</option>
            {people?.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
          </select></label>
        <label className="text-xs text-slate-500">From<br /><input type="date" name="from" defaultValue={sp.from} className={field} /></label>
        <label className="text-xs text-slate-500">To<br /><input type="date" name="to" defaultValue={sp.to} className={field} /></label>
        <button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-white">Apply</button>
        <Link href="/audit-log" className="h-9 px-2 text-sm leading-9 text-slate-500 hover:text-slate-800">Reset</Link>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader><TableRow><TableHead>When (IST)</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows?.length ? rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-slate-600">{fmt.format(new Date(r.at))}</TableCell>
                <TableCell>{r.actor_id ? name.get(r.actor_id) ?? "Removed user" : "System"}</TableCell>
                <TableCell><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{r.action}</code></TableCell>
                <TableCell className="max-w-md truncate text-xs text-slate-500">
                  {[r.entity, ...Object.entries(r.meta ?? {}).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)].filter(Boolean).join(" · ")}
                </TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={4} className="py-8 text-center text-slate-500">No activity matches these filters.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>{count ?? 0} entries · page {page} of {last}</span>
        <span className="flex gap-3">
          {page > 1 && <Link href={href(page - 1)} className="font-medium text-rose-600">← Newer</Link>}
          {page < last && <Link href={href(page + 1)} className="font-medium text-rose-600">Older →</Link>}
        </span>
      </div>
    </>
  );
}
