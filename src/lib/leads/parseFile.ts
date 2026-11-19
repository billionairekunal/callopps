"use client";
import Papa from "papaparse";
import { cellText } from "./cellText";
import { gridToRows } from "./gridToRows";

export const MAX_FILE_MB = 50;
export type Parsed = { headers: string[]; rows: string[][]; rowNumbers: number[] };

/** Read a CSV, XLSX or Word (.docx table) lead file in the browser. `headerRow` is 1-based. */
export async function parseFile(file: File, headerRow = 1): Promise<Parsed> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Files up to ${MAX_FILE_MB} MB are supported.`);
  const name = file.name.toLowerCase();
  let grid: string[][];
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    grid = await new Promise((res, rej) =>
      // Blank lines are kept so header-row numbers and row ranges match the file; parsed off the main thread.
      Papa.parse<string[]>(file, { worker: true, complete: (r) => res(r.data.map((row) => row.map((c) => String(c ?? "").trim()))), error: rej }));
  } else if (name.endsWith(".xlsx")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("This workbook has no sheets.");
    grid = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[]).slice(1); // ExcelJS rows are 1-indexed
      grid[row.number - 1] = vals.map(cellText); // place by real row number; gaps stay blank
    });
    for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  } else if (name.endsWith(".xls")) {
    throw new Error("Old .xls files aren't supported yet. Open it in Excel and save as .xlsx or .csv.");
  } else if (name.endsWith(".docx")) {
    const { docxGrid } = await import("./docx");
    grid = await docxGrid(await file.arrayBuffer());
  } else if (name.endsWith(".doc")) {
    throw new Error("Old .doc files aren't supported. Open it in Word and save as .docx, or copy the table into Excel.");
  } else {
    throw new Error("Upload a .csv, .xlsx or .docx file.");
  }
  return gridToRows(grid, headerRow);
}
