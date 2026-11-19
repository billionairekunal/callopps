"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, UploadCloud, ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { parseFile, MAX_FILE_MB, type Parsed } from "@/lib/leads/parseFile";
import { detectColumns, contactColumns, FIELD_LABEL, type Field } from "@/lib/leads/detect";
import { buildPreview, type PreviewRow, type PreviewStatus } from "@/lib/leads/preview";
import { cleanPhone } from "@/lib/leads/phone";
import { checkExisting, startImport, importChunk, finishImport, savedMappings } from "@/app/(app)/leads/import/actions";

type Person = { user_id: string; full_name: string; role: string };
type Named = { id: string; name: string };
const STEPS = ["Upload", "Map columns", "Preview", "Options", "Import"];
const FIELDS = Object.keys(FIELD_LABEL) as Field[];
const CHUNK = 500;
const sel = "h-9 rounded-md border border-input bg-white px-2 text-sm";

const STATUS: Record<PreviewStatus, { label: string; tone: string; hint: string }> = {
  ok: { label: "Ready", tone: "text-emerald-700 bg-emerald-50", hint: "Will be imported" },
  invalid: { label: "Invalid number", tone: "text-rose-700 bg-rose-50", hint: "Fix below or they're skipped" },
  blank: { label: "No number", tone: "text-slate-600 bg-slate-100", hint: "Skipped: a phone is required" },
  dup_file: { label: "Repeated in file", tone: "text-slate-600 bg-slate-100", hint: "Only the first copy is kept" },
  dup_existing: { label: "Already a lead", tone: "text-amber-700 bg-amber-50", hint: "Same number, same process" },
  dup_other_process: { label: "In another process", tone: "text-sky-700 bg-sky-50", hint: "Same number, different process" },
};

export function ImportWizard({ processes, people }: { processes: Named[]; people: Person[] }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [data, setData] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<string, Field>>({});
  const [sensitive, setSensitive] = useState<Set<string>>(new Set());
  const [processId, setProcessId] = useState("");
  const [saveMapping, setSaveMapping] = useState(true);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [filter, setFilter] = useState<PreviewStatus | "all">("all");
  const [skipSame, setSkipSame] = useState(true);
  const [importOther, setImportOther] = useState(true);
  const [assignTo, setAssignTo] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0, imported: 0, failedRows: 0, errors: [] as string[] });
  const [result, setResult] = useState<{ sourceId: string } | null>(null);

  const headers = data?.headers ?? [];
  const phoneHeader = headers.find((h) => mapping[h] === "phone");
  const processName = processes.find((p) => p.id === processId)?.name ?? null;
  const counts = useMemo(() => preview.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {} as Record<string, number>), [preview]);
  const toImport = useMemo(() => preview.filter((r) =>
    r.status === "ok" || (r.status === "dup_existing" && !skipSame) || (r.status === "dup_other_process" && importOther)), [preview, skipSame, importOther]);
  const rowNo = (i: number) => data?.rowNumbers[i] ?? i + headerRow + 1; // the real spreadsheet row

  async function readFile() {
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseFile(file, headerRow);
      if (!parsed.rows.length) throw new Error("No data rows found below the header row.");
      setData(parsed);
      const saved = await savedMappings();
      const sameHeaders = (h: string[]) => h.length === parsed.headers.length && h.every((x) => parsed.headers.includes(x));
      const match = saved.ok ? saved.data.find((m) => m.source_name.toLowerCase() === sourceName.trim().toLowerCase() && sameHeaders(m.headers))
        ?? saved.data.find((m) => sameHeaders(m.headers)) : undefined;
      if (match) {
        setMapping(match.mapping); setSensitive(new Set(match.sensitive));
        toast.success(`Used your saved mapping “${match.source_name}”.`);
      } else {
        const guessed = detectColumns(parsed.headers, parsed.rows.slice(0, 50));
        setMapping(guessed);
        // Extra columns that hold phones/emails start ticked: they are encrypted either way.
        setSensitive(new Set(contactColumns(parsed.headers, parsed.rows, guessed)));
      }
      setStep(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file.");
    } finally { setBusy(false); }
  }

  async function runPreview(rows = data!.rows) {
    setBusy(true);
    try {
      const pi = headers.indexOf(phoneHeader!);
      const phones = [...new Set(rows.map((r) => cleanPhone(r[pi])).filter((c) => c.valid).map((c) => c.primary!))];
      const existing = new Map<string, { processNames: (string | null)[] }>();
      for (let i = 0; i < phones.length; i += 2000) {
        const r = await checkExisting(phones.slice(i, i + 2000));
        if (!r.ok) throw new Error(r.error);
        Object.entries(r.data).forEach(([p, v]) => existing.set(p, v));
      }
      setPreview(buildPreview(rows, headers, mapping, existing, processName));
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check for duplicates.");
    } finally { setBusy(false); }
  }

  function fixPhone(index: number, value: string) {
    const pi = headers.indexOf(phoneHeader!);
    const rows = data!.rows.map((r, i) => (i === index ? r.map((c, j) => (j === pi ? value : c)) : r));
    setData({ ...data!, rows });
  }

  async function runImport() {
    setStep(4); setBusy(true);
    const total = toImport.length;
    const errors: string[] = [];
    let imported = 0, failedRows = 0;
    setProgress({ done: 0, total, imported: 0, failedRows: 0, errors });
    let start;
    try {
      start = await startImport({ sourceName: sourceName.trim(), fileName: file!.name, total, headers, mapping, sensitive: [...sensitive], saveMapping });
    } catch { start = { ok: false as const, error: "Could not reach the server. Check your connection and try again." }; }
    if (!start.ok) { toast.error(start.error); setBusy(false); setStep(3); return; }
    const { batchId, sourceId } = start.data;
    try {
      for (let i = 0; i < total; i += CHUNK) {
        const slice = toImport.slice(i, i + CHUNK);
        const range = `Rows ${rowNo(slice[0].index)}–${rowNo(slice.at(-1)!.index)}`;
        try {
          const r = await importChunk(batchId, slice.map((x) => ({ phone: x.phone, alt: x.alt, values: x.values })), {
            mapping, processId: processId || null, sensitiveHeaders: [...sensitive], assignTo: [...assignTo], offset: i,
          });
          if (r.ok) { imported += r.data.imported; failedRows += r.data.failed; }
          else { failedRows += slice.length; errors.push(`${range}: ${r.error}`); }
        } catch {
          // Network drop or an over-size request: report this range and keep going; earlier rows stay imported.
          failedRows += slice.length; errors.push(`${range}: the server didn't answer. Re-import just these rows.`);
        }
        setProgress({ done: Math.min(total, i + CHUNK), total, imported, failedRows, errors: [...errors] });
      }
    } finally {
      await finishImport(batchId, { imported, skipped: preview.length - total, invalid: (counts.invalid ?? 0) + (counts.blank ?? 0), failed: imported === 0 }).catch(() => {});
      setResult({ sourceId }); setBusy(false);
    }
  }

  const shown = (filter === "all" ? preview : preview.filter((r) => r.status === filter)).slice(0, 200);
  const callers = people.filter((p) => p.role === "caller" || p.role === "team_leader");

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
            i === step ? "border-rose-200 bg-rose-50 text-rose-700" : i < step ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-white text-slate-500")}>
            <span className="flex size-5 items-center justify-center rounded-full bg-white text-[11px] ring-1 ring-inset ring-current">{i + 1}</span>{s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="grid gap-5 rounded-xl border bg-white p-5 shadow-sm lg:grid-cols-[1.3fr_1fr]">
          <label className={cn("flex min-h-52 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
            file ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 hover:border-rose-300 hover:bg-rose-50/30")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); if (!sourceName) setSourceName(f.name.replace(/\.[^.]+$/, "")); } }}>
            {file ? <FileSpreadsheet className="size-10 text-emerald-600" /> : <UploadCloud className="size-10 text-slate-400" />}
            <span className="text-sm font-medium text-slate-800">{file ? file.name : "Drop your lead file here, or click to choose"}</span>
            <span className="text-xs text-slate-500">CSV, Excel (.xlsx) or a Word table (.docx), up to {MAX_FILE_MB} MB. Any columns, any order.</span>
            <input type="file" accept=".csv,.xlsx,.txt,.docx" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !sourceName) setSourceName(f.name.replace(/\.[^.]+$/, "")); }} />
          </label>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="src">Name this list</Label>
              <Input id="src" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. Bank X list, Nov" />
              <p className="text-xs text-slate-500">Every lead is tagged with this name and today&apos;s date.</p></div>
            <div className="space-y-1.5"><Label htmlFor="hr">Header row</Label>
              <Input id="hr" type="number" min={1} max={50} value={headerRow} onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))} className="w-24" />
              <p className="text-xs text-slate-500">The row that holds the column names. Usually 1.</p></div>
            <Button onClick={readFile} disabled={!file || !sourceName.trim() || busy}>{busy ? "Reading file…" : <>Next<ArrowRight className="size-4" /></>}</Button>
          </div>
        </section>
      )}

      {step === 1 && data && (
        <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-semibold">Check each column</h2>
              <p className="text-sm text-slate-500">{data.rows.length.toLocaleString("en-IN")} rows found. We guessed each column; change anything that&apos;s wrong. Only the phone is required.</p></div>
            <label className="text-sm">Process for this list<br />
              <select className={sel} value={processId} onChange={(e) => setProcessId(e.target.value)}>
                <option value="">None / from a column</option>
                {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Column in your file</th><th className="px-3 py-2">Sample values</th><th className="px-3 py-2">Import as</th><th className="px-3 py-2"><span className="inline-flex items-center gap-1"><Lock className="size-3" />Sensitive</span></th></tr>
              </thead>
              <tbody className="divide-y">
                {headers.map((h, i) => (
                  <tr key={h}>
                    <td className="px-3 py-2 font-medium text-slate-800">{h}</td>
                    <td className="max-w-72 truncate px-3 py-2 text-slate-500">{data.rows.slice(0, 3).map((r) => r[i]).filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-2">
                      <select className={cn(sel, mapping[h] === "phone" && "border-rose-300 bg-rose-50")} value={mapping[h] ?? "extra"} aria-label={`Import ${h} as`}
                        onChange={(e) => {
                          const f = e.target.value as Field;
                          setMapping((m) => {
                            const next = { ...m };
                            // phone, name etc. map to one column only: move it
                            if (f !== "extra" && f !== "ignore") for (const k of Object.keys(next)) if (next[k] === f) next[k] = "extra";
                            next[h] = f;
                            return next;
                          });
                        }}>
                        {FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABEL[f]}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Checkbox checked={sensitive.has(h)} disabled={mapping[h] === "phone" || mapping[h] === "alt_phone" || mapping[h] === "ignore"} aria-label={`${h} is sensitive`}
                        onCheckedChange={(c) => setSensitive((s) => { const n = new Set(s); if (c) n.add(h); else n.delete(h); return n; })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Sensitive columns (PAN, Aadhaar, income…) are encrypted and visible to the Super Admin only. Phone numbers and emails are always encrypted.</p>
          {!phoneHeader && <p className="flex items-center gap-1.5 text-sm text-rose-600"><AlertTriangle className="size-4" />Pick the column that holds the phone number.</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(0)}><ArrowLeft className="size-4" />Back</Button>
            <Button onClick={() => runPreview()} disabled={!phoneHeader || busy}>{busy ? "Checking numbers…" : <>Preview<ArrowRight className="size-4" /></>}</Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {(Object.keys(STATUS) as PreviewStatus[]).map((s) => (
              <button key={s} onClick={() => setFilter(filter === s ? "all" : s)}
                className={cn("rounded-xl border bg-white p-3 text-left shadow-sm transition", filter === s && "ring-2 ring-rose-300")}>
                <div className="text-xs text-slate-500">{STATUS[s].label}</div>
                <div className="text-2xl font-semibold text-slate-900">{(counts[s] ?? 0).toLocaleString("en-IN")}</div>
                <div className="text-[11px] text-slate-400">{STATUS[s].hint}</div>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Phone</th>
                  {headers.filter((h) => h !== phoneHeader).slice(0, 4).map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((r) => (
                  <tr key={r.index}>
                    <td className="px-3 py-2 text-slate-400">{rowNo(r.index)}</td>
                    <td className="px-3 py-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS[r.status].tone)}>{STATUS[r.status].label}</span></td>
                    <td className="px-3 py-2">
                      {r.status === "invalid" || r.status === "blank" ? (
                        <Input defaultValue={r.values[phoneHeader!]} className="h-8 w-40 font-mono" aria-label={`Fix phone on row ${rowNo(r.index)}`}
                          onBlur={(e) => { if (e.target.value !== r.values[phoneHeader!]) fixPhone(r.index, e.target.value); }} />
                      ) : <span className="font-mono">{r.phone}{r.alt ? <span className="text-slate-400"> / {r.alt}</span> : null}</span>}
                    </td>
                    {headers.filter((h) => h !== phoneHeader).slice(0, 4).map((h) => <td key={h} className="max-w-48 truncate px-3 py-2 text-slate-600">{r.values[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 200 && <p className="border-t px-3 py-2 text-xs text-slate-500">Showing the first 200 rows of this view.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="size-4" />Back</Button>
            <Button variant="outline" onClick={() => runPreview(data!.rows)} disabled={busy}>Re-check after fixes</Button>
            <Button onClick={() => setStep(3)}>Next<ArrowRight className="size-4" /></Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Duplicates</h2>
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={skipSame} onCheckedChange={(c) => setSkipSame(!!c)} />
              <span>Skip numbers that are already a lead in this process <span className="text-slate-500">({counts.dup_existing ?? 0})</span></span></label>
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={importOther} onCheckedChange={(c) => setImportOther(!!c)} />
              <span>Import numbers that exist in a different process <span className="text-slate-500">({counts.dup_other_process ?? 0})</span></span></label>
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={saveMapping} onCheckedChange={(c) => setSaveMapping(!!c)} />
              <span>Remember this column mapping as “{sourceName}” for next time</span></label>
          </div>
          <div className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Assign to callers</h2>
            <p className="text-sm text-slate-500">Leads are shared out one by one, in turn. Leave empty to assign later.</p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {callers.map((p) => (
                <label key={p.user_id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={assignTo.has(p.user_id)} onCheckedChange={(c) => setAssignTo((s) => { const n = new Set(s); if (c) n.add(p.user_id); else n.delete(p.user_id); return n; })} />
                  {p.full_name} <span className="text-xs text-slate-400">{p.role === "team_leader" ? "Team leader" : "Caller"}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
            <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="size-4" />Back</Button>
            <Button onClick={runImport} disabled={!toImport.length}>Import {toImport.length.toLocaleString("en-IN")} leads</Button>
            <span className="text-sm text-slate-500">{(preview.length - toImport.length).toLocaleString("en-IN")} rows will be skipped.</span>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            {result ? <CheckCircle2 className="size-6 text-emerald-600" /> : <UploadCloud className="size-6 animate-pulse text-rose-600" />}
            <h2 className="text-lg font-semibold">{result ? "Import finished" : "Importing…"}</h2>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
            <div className="h-full bg-rose-600 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="text-sm text-slate-600">
            {progress.imported.toLocaleString("en-IN")} imported · {progress.done.toLocaleString("en-IN")} of {progress.total.toLocaleString("en-IN")} processed
            {progress.failedRows > 0 && <> · <span className="text-rose-600">{progress.failedRows} not imported</span></>}
          </p>
          {progress.errors.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{progress.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          {result && !busy && (
            <div className="flex gap-2">
              <Link href={`/leads?source=${result.sourceId}`} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-white">View imported leads</Link>
              <Button variant="outline" onClick={() => window.location.reload()}>Import another file</Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
