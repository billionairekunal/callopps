import { test, expect } from "vitest";
import { buildPreview } from "@/lib/leads/preview";

const headers = ["Phone", "Name"];
const mapping = { Phone: "phone", Name: "name" } as const;

test("classifies ok, invalid, blank, dup in file, existing and other process", () => {
  const rows = [
    ["9876543210", "A"], ["98765 43210", "A again"], ["12345", "Bad"], ["", "Blank"],
    ["9111111111", "Existing same"], ["9222222222", "Existing other"], ["9333333333", "New"],
  ];
  const existing = new Map([["9111111111", { processNames: ["SGI"] }], ["9222222222", { processNames: ["BNI"] }]]);
  const p = buildPreview(rows, headers, { ...mapping }, existing, "SGI");
  expect(p.map((r) => r.status)).toEqual(["ok", "dup_file", "invalid", "blank", "dup_existing", "dup_other_process", "ok"]);
  expect(p[0]).toMatchObject({ index: 0, phone: "9876543210", values: { Phone: "9876543210", Name: "A" } });
  expect(p[2].reason).toBe("too_short");
});
test("with no target process any existing lead is dup_existing", () => {
  const p = buildPreview([["9222222222", "X"]], headers, { ...mapping }, new Map([["9222222222", { processNames: ["BNI"] }]]), null);
  expect(p[0].status).toBe("dup_existing");
});
test("alternate number from a split cell", () => {
  const p = buildPreview([["9876543210/9123456789", "A"]], headers, { ...mapping }, new Map(), null);
  expect(p[0]).toMatchObject({ phone: "9876543210", alt: "9123456789", status: "ok" });
});

test("a phone existing in several processes counts as same-process if any match", () => {
  const p = buildPreview([["9111111111", "X"]], headers, { ...mapping }, new Map([["9111111111", { processNames: ["BNI", "SGI"] }]]), "SGI");
  expect(p[0].status).toBe("dup_existing");
});
test("a per-row process column decides the duplicate bucket", () => {
  const h = ["Phone", "College"], m = { Phone: "phone", College: "process" } as const;
  const existing = new Map([["9111111111", { processNames: ["SGI"] }], ["9222222222", { processNames: ["SGI"] }]]);
  const p = buildPreview([["9111111111", "SGI"], ["9222222222", "BNI"]], h, { ...m }, existing, null);
  expect(p.map((r) => r.status)).toEqual(["dup_existing", "dup_other_process"]);
});
