"use client";
import { useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/browser";

export type Msg = { id: number; user_id: string; body: string; created_at: string };
const time = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** One channel: history from the server, new messages live via Supabase Realtime (RLS applies). */
export function ChatRoom({ channelId, orgId, me, initial, names }: { channelId: string; orgId: string; me: string; initial: Msg[]; names: Record<string, string> }) {
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const db = useRef(createClient()).current;

  useEffect(() => {
    const read = () => db.from("chat_reads").upsert({ channel_id: channelId, last_read_at: new Date().toISOString() }).then(() => window.dispatchEvent(new Event("callopps:chat-read")));
    read();
    const sub = db.channel(`chat:${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` }, (p) => {
        const m = p.new as Msg;
        setMsgs((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
        if (document.visibilityState === "visible") read();
      })
      .subscribe();
    return () => { db.removeChannel(sub); };
  }, [channelId, db]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { data, error } = await db.from("chat_messages").insert({ org_id: orgId, channel_id: channelId, body }).select("id, user_id, body, created_at").single();
    setSending(false);
    if (error) return void toast.error("Message not sent. Try again.");
    setText("");
    setMsgs((list) => (list.some((x) => x.id === data.id) ? list : [...list, data as Msg]));
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[420px] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.length === 0 && <p className="text-center text-sm text-slate-400">No messages yet. Say hello.</p>}
        {msgs.map((m, i) => {
          const mine = m.user_id === me, first = i === 0 || msgs[i - 1].user_id !== m.user_id;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              {first && <span className="mb-0.5 text-xs text-slate-500">{mine ? "You" : names[m.user_id] ?? "Someone"} · {time.format(new Date(m.created_at))}</span>}
              <p className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-800"}`}>{m.body}</p>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} placeholder="Write a message…" aria-label="Message"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-md border px-3 py-2 text-sm outline-none focus:border-rose-400" />
        <button disabled={sending || !text.trim()} aria-label="Send" className="flex size-10 items-center justify-center rounded-md bg-rose-600 text-white disabled:opacity-50"><SendHorizontal className="size-4" /></button>
      </form>
    </div>
  );
}
