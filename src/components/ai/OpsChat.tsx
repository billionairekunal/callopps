"use client";
import { useState, useTransition } from "react";
import { Sparkles, SendHorizontal } from "lucide-react";
import { askOpsAi } from "@/app/(app)/ops-ai/actions";

type Turn = { role: "user" | "assistant"; content: string };
const SUGGEST = ["Win rate by caller this month", "Which process has the most overdue follow-ups?", "Compare this month with last month", "Who logged the most hours, and who made the most calls?"];

export function OpsChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ask = (question: string) => {
    if (!question.trim()) return;
    const history = turns.slice(-12);
    setTurns([...turns, { role: "user", content: question }]); setQ(""); setError(null);
    start(async () => {
      const r = await askOpsAi({ question, history });
      if (r.ok) setTurns((t) => [...t, { role: "assistant", content: r.data }]);
      else { setError(r.error); setTurns((t) => t.slice(0, -1)); setQ(question); }
    });
  };
  return (
    <div className="flex min-h-[480px] flex-col rounded-xl border bg-white shadow-sm">
      <div className="flex-1 space-y-4 p-5">
        {turns.length === 0 && (
          <div className="py-6 text-center">
            <Sparkles className="mx-auto mb-2 size-6 text-rose-600" />
            <p className="mb-4 text-sm text-slate-600">Ask about this month&apos;s and last month&apos;s reports.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGEST.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full border px-3 py-1.5 text-sm text-slate-700 hover:border-rose-300 hover:bg-rose-50">{s}</button>)}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "flex justify-end" : ""}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${t.role === "user" ? "bg-rose-600 text-white" : "bg-slate-50 text-slate-800 ring-1 ring-slate-200"}`}>{t.content}</div>
          </div>
        ))}
        {pending && <p className="text-sm text-slate-500">Thinking about your numbers…</p>}
        {error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">{error}</p>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-2 border-t p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={2000} placeholder="e.g. Which agent has the best win rate this month?" aria-label="Question"
          className="h-10 flex-1 rounded-md border px-3 text-sm outline-none focus:border-rose-400" />
        <button disabled={pending || !q.trim()} aria-label="Ask" className="flex size-10 items-center justify-center rounded-md bg-rose-600 text-white disabled:opacity-50"><SendHorizontal className="size-4" /></button>
      </form>
    </div>
  );
}
