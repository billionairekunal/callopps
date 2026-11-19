import { test, expect } from "vitest";
import JSZip from "jszip";
import { docxGrid } from "@/lib/leads/docx";

const cell = (t: string, span = 1) => `<w:tc><w:tcPr>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}</w:tcPr><w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p></w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;
const table = (...rows: string[]) => `<w:tbl><w:tblPr/>${rows.join("")}</w:tbl>`;
async function docx(body: string) {
  const z = new JSZip();
  z.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Lead list</w:t></w:r></w:p>${body}</w:body></w:document>`);
  return z.generateAsync({ type: "arraybuffer" });
}

test("reads the table's cells, decoding entities and joining runs and paragraphs", async () => {
  const xml = table(row(cell("Name"), cell("Mobile")), row(cell("Ravi &amp; Co"), `<w:tc><w:p><w:r><w:t>98765</w:t></w:r><w:r><w:t>43210</w:t></w:r></w:p></w:tc>`),
    row(`<w:tc><w:p><w:r><w:t>Asha</w:t></w:r></w:p><w:p><w:r><w:t>Patil</w:t></w:r></w:p></w:tc>`, cell("9123456789")));
  expect(await docxGrid(await docx(xml))).toEqual([["Name", "Mobile"], ["Ravi & Co", "9876543210"], ["Asha Patil", "9123456789"]]);
});
test("merged cells keep the columns lined up", async () => {
  const xml = table(row(cell("Name"), cell("City"), cell("Mobile")), row(cell("Ravi", 2), cell("9876543210")));
  expect(await docxGrid(await docx(xml))).toEqual([["Name", "City", "Mobile"], ["Ravi", "", "9876543210"]]);
});
test("a list split across tables with the same header becomes one list; otherwise the biggest table wins", async () => {
  const h = row(cell("Name"), cell("Mobile"));
  const same = table(h, row(cell("A"), cell("1"))) + "<w:p/>" + table(h, row(cell("B"), cell("2")));
  expect(await docxGrid(await docx(same))).toEqual([["Name", "Mobile"], ["A", "1"], ["B", "2"]]);
  const diff = table(row(cell("x")), row(cell("y"))) + table(h, row(cell("A"), cell("1")), row(cell("B"), cell("2")));
  expect((await docxGrid(await docx(diff)))[0]).toEqual(["Name", "Mobile"]);
});
test("a document without tables is explained", async () => {
  await expect(docxGrid(await docx("<w:p/>"))).rejects.toThrow(/no table/i);
});

test("a lead table inside a layout table keeps every row", async () => {
  const inner = table(row(cell("Name"), cell("Mobile")), row(cell("A"), cell("1")), row(cell("B"), cell("2")), row(cell("C"), cell("3")));
  const outer = `<w:tbl><w:tblPr/>${row(cell("Letterhead"))}<w:tr><w:tc><w:p/>${inner}</w:tc></w:tr></w:tbl>`;
  expect(await docxGrid(await docx(outer))).toEqual([["Name", "Mobile"], ["A", "1"], ["B", "2"], ["C", "3"]]);
});
test("vertically merged cells repeat the value above; gridBefore keeps columns aligned", async () => {
  const vm = (t: string, start: boolean) => `<w:tc><w:tcPr><w:vMerge${start ? ' w:val="restart"' : ""}/></w:tcPr><w:p>${t ? `<w:r><w:t>${t}</w:t></w:r>` : ""}</w:p></w:tc>`;
  const xml = `<w:tbl w:rsid="1">${row(cell("Name"), cell("City"))}${row(cell("A"), vm("Pune", true))}${row(cell("B"), vm("", false))}` +
    `<w:tr><w:trPr><w:gridBefore w:val="1"/></w:trPr>${cell("Mumbai")}</w:tr></w:tbl>`;
  expect(await docxGrid(await docx(xml))).toEqual([["Name", "City"], ["A", "Pune"], ["B", "Pune"], ["", "Mumbai"]]);
});
test("tables nested two levels deep don't corrupt the outer table", async () => {
  const deep = table(row(cell("Name"), cell("Mobile")), row(cell("A"), cell("1")), row(cell("B"), cell("2")));
  const mid = `<w:tbl>${row(cell("x"))}<w:tr><w:tc>${deep}</w:tc></w:tr></w:tbl>`;
  const outer = `<w:tbl>${row(cell("top"))}<w:tr><w:tc>${mid}</w:tc></w:tr>${row(cell("bottom"))}</w:tbl>`;
  expect(await docxGrid(await docx(outer))).toEqual([["Name", "Mobile"], ["A", "1"], ["B", "2"]]);
});
