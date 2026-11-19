import Link from "next/link";
import { Hash, Users, User } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ensureChannels } from "@/lib/chat/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { ChatRoom, type Msg } from "@/components/chat/ChatRoom";
import { NewDm } from "@/components/chat/NewDm";

export default async function Chat({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const s = await requireRole("super_admin", "admin", "team_leader", "caller");
  await ensureChannels(s.orgId);
  const db = await createClient();
  const [{ data: chans }, { data: people }, { data: unread }, { data: members }] = await Promise.all([
    db.from("chat_channels").select("id, kind, name, dm_key").order("kind").order("name"),
    db.from("profiles").select("user_id, full_name").eq("status", "active").order("full_name"),
    db.rpc("chat_unread"),
    db.from("chat_members").select("channel_id, user_id"),
  ]);
  const names = Object.fromEntries((people ?? []).map((p) => [p.user_id, p.full_name || "Unnamed"]));
  const label = (c: { kind: string; name: string; id: string }) => {
    if (c.kind !== "dm") return c.name;
    const other = (members ?? []).find((m) => m.channel_id === c.id && m.user_id !== s.userId);
    return other ? names[other.user_id] ?? "Former colleague" : "Direct message";
  };
  const counts = Object.fromEntries(((unread ?? []) as { channel_id: string; unread: number }[]).map((u) => [u.channel_id, Number(u.unread)]));
  const list = chans ?? [];
  const c = (await searchParams).c;
  const current = list.find((x) => x.id === c) ?? list.find((x) => x.kind === "org");
  const { data: msgs } = current
    ? await db.from("chat_messages").select("id, user_id, body, created_at").eq("channel_id", current.id).order("created_at", { ascending: false }).limit(100)
    : { data: [] };
  const ICON = { org: Hash, team: Users, dm: User } as const;
  return (
    <>
      <PageHeader title="Internal Chat" subtitle="Team channels and direct messages." />
      <div className="grid overflow-hidden rounded-xl border bg-white shadow-sm md:grid-cols-[240px_1fr]">
        <aside className="border-b p-3 md:border-b-0 md:border-r">
          <ul className="mb-3 flex gap-1 overflow-x-auto md:block md:space-y-0.5">
            {list.map((ch) => {
              const I = ICON[ch.kind as keyof typeof ICON];
              return (
                <li key={ch.id} className="shrink-0">
                  <Link href={`/chat?c=${ch.id}`} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${ch.id === current?.id ? "bg-rose-50 font-medium text-rose-800" : "text-slate-700 hover:bg-slate-50"}`}>
                    <I className="size-4 text-slate-400" /><span className="truncate">{label(ch)}</span>
                    {counts[ch.id] > 0 && ch.id !== current?.id && <span className="ml-auto rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white">{counts[ch.id]}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <NewDm people={(people ?? []).filter((p) => p.user_id !== s.userId)} />
        </aside>
        <section className="min-w-0">
          {current ? (
            <>
              <h2 className="border-b px-4 py-2.5 font-semibold text-slate-900">{label(current)}</h2>
              <ChatRoom key={current.id} channelId={current.id} orgId={s.orgId} me={s.userId} initial={((msgs ?? []) as Msg[]).reverse()} names={names} />
            </>
          ) : <p className="p-6 text-sm text-slate-500">No channels yet.</p>}
        </section>
      </div>
    </>
  );
}
