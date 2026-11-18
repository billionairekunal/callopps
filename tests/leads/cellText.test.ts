import { test, expect } from "vitest";
import { cellText } from "@/lib/leads/cellText";

test("spreadsheet cells become plain strings", () => {
  expect(cellText(9876543210)).toBe("9876543210");
  expect(cellText(9.87654321e9)).toBe("9876543210");
  expect(cellText(12.5)).toBe("12.5");
  expect(cellText(null)).toBe("");
  expect(cellText({ richText: [{ text: "Asha " }, { text: "Patil" }] })).toBe("Asha Patil");
  expect(cellText({ text: "link", hyperlink: "http://x" })).toBe("link");
  expect(cellText({ formula: "A1", result: 9876543210 })).toBe("9876543210");
  expect(cellText(new Date("2026-11-19T00:00:00Z"))).toBe("2026-11-19");
  expect(cellText(true)).toBe("TRUE");
});
