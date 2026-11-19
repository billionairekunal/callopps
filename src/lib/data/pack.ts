import JSZip from "jszip";
import { toCsv, type Sheet } from "@/lib/reports/export";

/** S13 typed confirmation: "DELETE <centre name>", exactly. */
export const purgeConfirmed = (typed: string, orgName: string) => typed.trim() === `DELETE ${orgName.trim()}`;

export function rowsToSheet(name: string, rows: Record<string, unknown>[]): Sheet {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const val = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : (v as string | number));
  return { name, columns, rows: rows.map((r) => columns.map((c) => val(r[c]))) };
}

export async function zipSheets(sheets: Sheet[], readme: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("README.txt", readme);
  // One table per file; no section title line, so each CSV opens cleanly in Excel.
  for (const s of sheets) zip.file(`${s.name}.csv`, "﻿" + toCsv([{ ...s, name: "" }]));
  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}
