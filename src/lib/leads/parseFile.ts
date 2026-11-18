"use client";
import Papa from "papaparse";
import { cellText } from "./cellText";
import { normalizeHeaders } from "./detect";

export const MAX_FILE_MB = 50;
export type Parsed = { headers: string[]; rows: string[][] };

/** Read a CSV or XLSX lead file in the browser. `headerRow` is 1-based. */
export async function parseFile(file: File, headerRow = 1): Promise<Parsed> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Files up to ${MAX_FILE_MB} MB are supported.`);
  const name = file.name.toLowerCase();
  let grid: string[][];
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    grid = await new Promise((res, rej) =>
      Papa.parse<string[]>(file, { skipEmptyLines: "greedy", complete: (r) => res(r.data.map((row) => row.map((c) => String(c ?? "").trim()))), error: rej }));
  } else if (name.endsWith(".xlsx")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("This workbook has no sheets.");
    grid = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[]).slice(1); // ExcelJS rows are 1-indexed
      grid.push(vals.map(cellText));
    });
  } else if (name.endsWith(".xls")) {
    throw new Error("Old .xls files aren't supported yet. Open it in Excel and save as .xlsx or .csv.");
  } else if (name.endsWith(".doc") || name.endsWith(".docx")) {
    throw new Error("Word files come in a later release. Copy the table into Excel and save as .xlsx.");
  } else {
    throw new Error("Upload a .csv or .xlsx file.");
  }
  const hi = Math.max(0, headerRow - 1);
  if (grid.length <= hi) throw new Error("The file has no rows below the header row.");
  const width = Math.max(...grid.slice(hi, hi + 200).map((r) => r.length));
  const headers = normalizeHeaders(Array.from({ length: width }, (_, i) => grid[hi][i] ?? ""));
  const rows = grid.slice(hi + 1).filter((r) => r.some((c) => c)).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  return { headers, rows };
}
