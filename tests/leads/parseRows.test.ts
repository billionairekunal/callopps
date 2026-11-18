import { test, expect } from "vitest";
import { gridToRows } from "@/lib/leads/gridToRows";

test("header row counts real spreadsheet rows, blanks included; row numbers are kept", () => {
  const grid = [["My Bank list"], [], ["Phone", "Name"], ["9876543210", "A"], [], ["9123456789", "B", "late extra"]];
  const r = gridToRows(grid, 3);
  expect(r.headers).toEqual(["Phone", "Name", "Column 3"]);
  expect(r.rows).toEqual([["9876543210", "A", ""], ["9123456789", "B", "late extra"]]);
  expect(r.rowNumbers).toEqual([4, 6]);
});
