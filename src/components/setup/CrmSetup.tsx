"use client";
import { useState } from "react";
import Link from "next/link";
import { UserPlus, ScrollText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABEL, type Role } from "@/lib/auth/roles";
import {
  saveLookup, saveDisposition, deleteDisposition, setTeamProcesses, inviteUser, setUserStatus, changeUserRole, setUserTeam, updateOrgSettings,
} from "@/app/(app)/crm-setup/actions";
import { LookupTable, type LookupRow } from "./LookupTable";
import { useAction } from "./useAction";
import { DataControls } from "./DataControls";

type Named = { id: string; name: string };
export type SetupData = {
  me: { userId: string; role: Role };
  org: { name: string; idle_timeout_minutes: number; ai_enabled: boolean };
  users: { user_id: string; full_name: string; email: string; role: Role; team_id: string | null; status: "active" | "deactivated" }[];
  teams: (Named & { team_leader_id: string | null })[];
  teamProcesses: { team_id: string; process_id: string }[];
  processes: (Named & { active: boolean })[];
  categories: Named[];
  products: (Named & { category_id: string | null })[];
  leadTypes: Named[];
  dispositions: { id: string; process_id: string; label: string; outcome: "in_progress" | "won" | "lost"; counts_presentation: boolean; sort: number }[];
};

const sel = "h-8 rounded-md border border-input bg-white px-2 text-sm";
const OUTCOME: Record<string, string> = { in_progress: "In progress", won: "Won", lost: "Lost" };
const OUTCOME_STYLE: Record<string, string> = { in_progress: "bg-amber-50 text-amber-700", won: "bg-emerald-50 text-emerald-700", lost: "bg-rose-50 text-rose-700" };

export function CrmSetup({ data }: { data: SetupData }) {
  const isSuper = data.me.role === "super_admin";
  return (
    <Tabs defaultValue="users">
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList className="mb-4">
          {["users", "teams", "processes", "products", "lead-types", "dispositions", "security"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{t.replace("-", " ")}</TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="users"><Users data={data} isSuper={isSuper} /></TabsContent>
      <TabsContent value="teams"><Teams data={data} /></TabsContent>
      <TabsContent value="processes">
        <Section title="Processes" hint="A process is a campaign or client list your callers work on, for example SGI.">
          <LookupTable table="processes" rows={data.processes} noun="Process" canEdit defaults={{ active: true }} />
        </Section>
      </TabsContent>
      <TabsContent value="products"><Products data={data} /></TabsContent>
      <TabsContent value="lead-types">
        <Section title="Lead types" hint="How warm a lead is, for example Hot, Warm, Cold.">
          <LookupTable table="lead_types" rows={data.leadTypes} noun="Lead type" canEdit />
        </Section>
      </TabsContent>
      <TabsContent value="dispositions"><Dispositions data={data} /></TabsContent>
      <TabsContent value="security"><Security data={data} isSuper={isSuper} /></TabsContent>
    </Tabs>
  );
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="font-semibold text-slate-900">{title}</h2>{hint && <p className="text-sm text-slate-500">{hint}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Users({ data, isSuper }: { data: SetupData; isSuper: boolean }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const roles: Role[] = isSuper ? ["super_admin", "admin", "team_leader", "caller"] : ["team_leader", "caller"];
  const teamName = (id: string | null) => data.teams.find((t) => t.id === id)?.name ?? "—";

  async function invite(form: FormData) {
    const ok = await run(() => inviteUser({
      email: form.get("email"), fullName: form.get("fullName"), role: form.get("role"), teamId: form.get("teamId") || null,
    }), "Invite sent");
    if (ok) setOpen(false);
  }

  return (
    <Section title="Users" hint="Only a Super Admin can add Admins or Super Admins, or change roles."
      action={<Button size="sm" onClick={() => setOpen(true)}><UserPlus className="size-4" />Invite user</Button>}>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Team</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data.users.map((u) => {
              const self = u.user_id === data.me.userId;
              const canManage = !self && (isSuper || (u.role !== "super_admin" && u.role !== "admin"));
              return (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.full_name}{self && <span className="ml-1 text-xs text-slate-400">(you)</span>}</TableCell>
                  <TableCell className="text-slate-600">{u.email}</TableCell>
                  <TableCell>
                    {isSuper && !self ? (
                      <select className={sel} value={u.role} disabled={pending} aria-label={`Role for ${u.full_name}`}
                        onChange={(e) => run(() => changeUserRole(u.user_id, e.target.value as Role), "Role updated")}>
                        {(["super_admin", "admin", "team_leader", "caller"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    ) : ROLE_LABEL[u.role]}
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <select className={sel} value={u.team_id ?? ""} disabled={pending} aria-label={`Team for ${u.full_name}`}
                        onChange={(e) => run(() => setUserTeam(u.user_id, e.target.value || null), "Team updated")}>
                        <option value="">No team</option>
                        {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : teamName(u.team_id)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={u.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}>
                      {u.status === "active" ? "Active" : "Deactivated"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <Button size="sm" variant="ghost" disabled={pending}
                        onClick={() => run(() => setUserStatus(u.user_id, u.status === "active" ? "deactivated" : "active"),
                          u.status === "active" ? "User deactivated and signed out" : "User reactivated")}>
                        {u.status === "active" ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>They get an email link to set their password.</DialogDescription>
          </DialogHeader>
          <form action={invite} className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="fullName">Full name</Label><Input id="fullName" name="fullName" required /></div>
            <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="role">Role</Label>
                <select id="role" name="role" className={`${sel} h-9 w-full`} defaultValue="caller">
                  {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select></div>
              <div className="space-y-1.5"><Label htmlFor="teamId">Team</Label>
                <select id="teamId" name="teamId" className={`${sel} h-9 w-full`} defaultValue="">
                  <option value="">No team</option>
                  {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></div>
            </div>
            <DialogFooter><Button type="submit" disabled={pending}>Send invite</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function Teams({ data }: { data: SetupData }) {
  const { pending, run } = useAction();
  const leaders = data.users.filter((u) => u.role === "team_leader" && u.status === "active");
  return (
    <Section title="Teams" hint="Pick each team's leader and the processes its callers work on.">
      <LookupTable table="teams" rows={data.teams as LookupRow[]} noun="Team" canEdit extra={(row) => {
        const t = row as SetupData["teams"][number];
        const linked = new Set(data.teamProcesses.filter((tp) => tp.team_id === t.id).map((tp) => tp.process_id));
        return (
          <div className="flex flex-wrap items-center gap-3">
            <select className={sel} value={t.team_leader_id ?? ""} disabled={pending} aria-label={`Leader of ${t.name}`}
              onChange={(e) => run(() => saveLookup("teams", { id: t.id, name: t.name, team_leader_id: e.target.value || null }), "Team leader set")}>
              <option value="">No leader</option>
              {leaders.map((l) => <option key={l.user_id} value={l.user_id}>{l.full_name}</option>)}
            </select>
            {data.processes.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                <Checkbox checked={linked.has(p.id)} disabled={pending}
                  onCheckedChange={(c) => {
                    const next = new Set(linked); if (c) next.add(p.id); else next.delete(p.id);
                    run(() => setTeamProcesses(t.id, [...next]), "Processes updated");
                  }} />
                {p.name}
              </label>
            ))}
          </div>
        );
      }} />
    </Section>
  );
}

function Products({ data }: { data: SetupData }) {
  const { pending, run } = useAction();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Product categories" hint="For example UG and PG.">
        <LookupTable table="product_categories" rows={data.categories} noun="Category" canEdit />
      </Section>
      <Section title="Products" hint="What you sell or enrol for, each in a category.">
        <LookupTable table="products" rows={data.products as LookupRow[]} noun="Product" canEdit extra={(row) => {
          const p = row as SetupData["products"][number];
          return (
            <select className={sel} value={p.category_id ?? ""} disabled={pending} aria-label={`Category of ${p.name}`}
              onChange={(e) => run(() => saveLookup("products", { id: p.id, name: p.name, category_id: e.target.value || null }), "Category set")}>
              <option value="">No category</option>
              {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          );
        }} />
      </Section>
    </div>
  );
}

function Dispositions({ data }: { data: SetupData }) {
  const { pending, run } = useAction();
  const [processId, setProcessId] = useState(data.processes[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [outcome, setOutcome] = useState<"in_progress" | "won" | "lost">("in_progress");
  const rows = data.dispositions.filter((d) => d.process_id === processId).sort((a, b) => a.sort - b.sort);

  if (!data.processes.length) return <p className="text-sm text-slate-500">Add a process first.</p>;
  return (
    <Section title="Dispositions" hint="The outcomes a caller can pick after a call. You decide which count as Won and Lost for each process."
      action={<select className={`${sel} h-9`} value={processId} onChange={(e) => setProcessId(e.target.value)} aria-label="Process">
        {data.processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>}>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader><TableRow><TableHead>Disposition</TableHead><TableHead>Counts as</TableHead><TableHead>Presentation</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.label}</TableCell>
                <TableCell>
                  <select className={`${sel} ${OUTCOME_STYLE[d.outcome]}`} value={d.outcome} disabled={pending} aria-label={`Outcome for ${d.label}`}
                    onChange={(e) => run(() => saveDisposition({ ...d, outcome: e.target.value }), "Saved")}>
                    {Object.entries(OUTCOME).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </TableCell>
                <TableCell>
                  <Checkbox checked={d.counts_presentation} disabled={pending} aria-label={`${d.label} counts as presentation`}
                    onCheckedChange={(c) => run(() => saveDisposition({ ...d, counts_presentation: !!c }), "Saved")} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" className="text-rose-600" disabled={pending}
                    onClick={() => run(() => deleteDisposition(d.id), "Deleted")}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <form className="flex flex-wrap gap-2 border-t bg-slate-50/60 p-3" onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() => saveDisposition({ process_id: processId, label, outcome, counts_presentation: false, sort: rows.length }), "Disposition added");
          if (ok) setLabel("");
        }}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New disposition" className="h-9 max-w-xs bg-white" aria-label="New disposition" />
          <select className={`${sel} h-9`} value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} aria-label="Counts as">
            {Object.entries(OUTCOME).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <Button type="submit" size="sm" disabled={pending || !label.trim()}>Add</Button>
        </form>
      </div>
    </Section>
  );
}

function Security({ data, isSuper }: { data: SetupData; isSuper: boolean }) {
  const { pending, run } = useAction();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Organisation & security" hint={isSuper ? undefined : "Only a Super Admin can change these."}>
        <form className="space-y-4 rounded-xl border bg-white p-5 shadow-sm" action={async (f) => {
          await run(() => updateOrgSettings({ name: f.get("name"), idle_timeout_minutes: Number(f.get("idle")), ai_enabled: f.get("ai") === "on" }), "Settings saved");
        }}>
          <div className="space-y-1.5"><Label htmlFor="org-name">Centre name</Label>
            <Input id="org-name" name="name" defaultValue={data.org.name} disabled={!isSuper} required /></div>
          <div className="space-y-1.5"><Label htmlFor="idle">Sign out after idle (minutes)</Label>
            <Input id="idle" name="idle" type="number" min={5} max={240} defaultValue={data.org.idle_timeout_minutes} disabled={!isSuper} required />
            <p className="text-xs text-slate-500">Between 5 and 240.</p></div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="ai" defaultChecked={data.org.ai_enabled} disabled={!isSuper} className="mt-0.5 accent-rose-600" />
            <span><span className="font-medium text-slate-900">Turn on Ops AI</span><br />
              <span className="text-xs text-slate-500">Sends report totals (counts, rates, agent names) to Claude to answer questions. Never phone numbers, emails or customer names. Changes are logged.</span></span>
          </label>
          {isSuper && <Button type="submit" disabled={pending}>Save</Button>}
        </form>
      </Section>
      {isSuper && <Section title="Your data"><DataControls orgName={data.org.name} /></Section>}
      <Section title="How your data is protected">
        <div className="space-y-3 rounded-xl border bg-white p-5 text-sm text-slate-600 shadow-sm">
          <p>Data is encrypted in transit and at rest, stored on servers in India, and every access is controlled and logged.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Super Admins and Admins sign in with an authenticator app.</li>
            <li>Accounts lock for 15 minutes after 5 wrong passwords.</li>
            <li>Only Super Admins see full phone numbers and the activity log.</li>
          </ul>
          {isSuper && <Link href="/audit-log" className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><ScrollText className="size-4" />Open activity log</Link>}
        </div>
      </Section>
    </div>
  );
}
