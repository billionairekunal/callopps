import { test, expect } from "vitest";
import { detectColumns, normalizeHeaders, contactColumns } from "@/lib/leads/detect";

test("normalizeHeaders fills blanks and de-duplicates", () => {
  expect(normalizeHeaders(["", "Name", "Name", " city "])).toEqual(["Column 1", "Name", "Name (2)", "city"]);
});
test("header synonyms", () => {
  const h = ["Mobile No", "Student Name", "Loan Amount", "E-mail ID", "City", "Course", "Alternate Contact"];
  expect(detectColumns(h, [])).toEqual({
    "Mobile No": "phone", "Student Name": "name", "Loan Amount": "extra", "E-mail ID": "email",
    City: "city", Course: "product", "Alternate Contact": "alt_phone",
  });
});
test("data pattern finds phone and email columns with odd headers", () => {
  const h = ["Col A", "Col B", "Col C"];
  const rows = [["9876543210", "a@b.in", "x"], ["+91 91234 56789", "c@d.com", "y"], ["", "e@f.org", "z"]];
  expect(detectColumns(h, rows)).toEqual({ "Col A": "phone", "Col B": "email", "Col C": "extra" });
});
test("a second phone-like column becomes alt_phone", () => {
  const rows = [["9876543210", "9123456789"], ["9988776655", "9090909090"]];
  expect(detectColumns(["P1", "P2"], rows)).toEqual({ P1: "phone", P2: "alt_phone" });
});

test("duplicate-header suffixes never collide", () => {
  expect(normalizeHeaders(["Name", "Name", "Name (2)"])).toEqual(["Name", "Name (3)", "Name (2)"]);
});
test("'Contact Person' / 'Client Name' are names, not phone/process", () => {
  const m = detectColumns(["Contact Person", "Mobile", "Client Name"], [["Asha", "9876543210", "Ravi"]]);
  expect(m).toEqual({ "Contact Person": "name", Mobile: "phone", "Client Name": "extra" });
});
test("extra phone/email columns are flagged as contact columns", () => {
  const h = ["Mobile", "Alt Mobile", "Father Mobile", "Email", "Guardian Email", "Notes"];
  const rows = [["9876543210", "9123456789", "9988776655", "s@b.in", "a@b.in", "hi"]];
  const m = detectColumns(h, rows);
  expect(m["Father Mobile"]).toBe("extra");
  expect(contactColumns(h, rows, m)).toEqual(["Father Mobile", "Guardian Email"]);
});
