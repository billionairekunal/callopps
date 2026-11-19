"use client";
import { useState } from "react";

type Point = { day: string; followups: number; wins: number };
const SERIES = [{ key: "followups", label: "Follow-ups", color: "#2a78d6" }, { key: "wins", label: "Wins", color: "#eb6834" }] as const;
const W = 720, H = 220, L = 36, R = 64, T = 12, B = 28;

/** Follow-ups vs Wins per day: one axis (both are counts), two 2px lines, legend + end labels, crosshair tooltip. */
export function TrendChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="text-sm text-slate-500">No days in range.</p>;
  const max = Math.max(1, ...data.flatMap((d) => [d.followups, d.wins]));
  const nice = Math.ceil(max / 4) * 4 || 4;
  const x = (i: number) => L + (data.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (data.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);
  const step = Math.max(1, Math.ceil(data.length / 8));
  const h = hover == null ? null : data[hover];
  // End labels: keep them at least 12px apart so equal values don't overprint.
  const ends = SERIES.map((s) => y(data[data.length - 1][s.key]));
  if (Math.abs(ends[0] - ends[1]) < 12) ends[1] = ends[0] + (ends[1] >= ends[0] && ends[0] + 12 <= H - B ? 12 : -12);
  return (
    <div className="relative">
      <div className="mb-2 flex gap-4 text-xs text-slate-600">
        {SERIES.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Follow-ups and wins per day" onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(nice * f)} y2={y(nice * f)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 6} y={y(nice * f) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{Math.round(nice * f)}</text>
          </g>
        ))}
        {data.map((d, i) => i % step === 0 && <text key={d.day} x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">{d.day.slice(8)}/{d.day.slice(5, 7)}</text>)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#94a3b8" strokeWidth={1} />}
        {SERIES.map((s, si) => (
          <g key={s.key}>
            <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={data.map((d, i) => `${x(i)},${y(d[s.key])}`).join(" ")} />
            {hover != null && <circle cx={x(hover)} cy={y(data[hover][s.key])} r={4} fill={s.color} stroke="white" strokeWidth={2} />}
            <text x={x(data.length - 1) + 8} y={ends[si] + 4} className="fill-slate-600 text-[11px]">{s.label}</text>
          </g>
        ))}
        {data.map((d, i) => (
          <rect key={d.day} x={x(i) - (W - L - R) / Math.max(1, data.length - 1) / 2} y={T} width={(W - L - R) / Math.max(1, data.length - 1)} height={H - T - B}
            fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-6 rounded-md border bg-white px-2.5 py-1.5 text-xs shadow-md" style={{ left: `${(x(hover!) / W) * 100}%`, transform: "translateX(-50%)" }}>
          <div className="font-medium text-slate-900">{h.day}</div>
          <div className="text-slate-600">Follow-ups {h.followups} · Wins {h.wins}</div>
        </div>
      )}
      <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full max-w-sm"><thead><tr className="text-left"><th>Day</th><th>Follow-ups</th><th>Wins</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.followups}</td><td>{d.wins}</td></tr>)}</tbody></table>
      </details>
    </div>
  );
}
