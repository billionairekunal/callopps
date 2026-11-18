import { normalizeHeaders } from "./detect";

/** Grid (blank rows kept, so row numbers match the spreadsheet) → headers + data rows with their real row numbers. */
export function gridToRows(grid: string[][], headerRow: number) {
  const hi = Math.max(0, headerRow - 1);
  if (grid.length <= hi) throw new Error("The file has no rows below the header row.");
  const body = grid.slice(hi + 1).map((r, i) => ({ r, n: hi + 2 + i })).filter(({ r }) => r.some((c) => String(c ?? "").trim()));
  const width = Math.max(grid[hi].length, ...body.map(({ r }) => r.length));
  return {
    headers: normalizeHeaders(Array.from({ length: width }, (_, i) => grid[hi][i] ?? "")),
    rows: body.map(({ r }) => Array.from({ length: width }, (_, i) => String(r[i] ?? "").trim())),
    rowNumbers: body.map(({ n }) => n),
  };
}
