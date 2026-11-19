import JSZip from "jszip";

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" ? 2 : 1), e[1] === "x" ? 16 : 10)) : ENT[e] ?? m);

/** Text of one cell: runs joined, paragraphs/tabs/breaks become spaces. */
function cellText(xml: string) {
  return xml.split(/<\/w:p>/).map((p) =>
    [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br)\b[^>]*\/>/g)].map((m) => (m[1] != null ? decode(m[1]) : " ")).join(""),
  ).map((t) => t.trim()).filter(Boolean).join(" ");
}

function tableRows(xml: string): string[][] {
  return [...xml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map(([tr]) =>
    [...tr.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)].flatMap(([tc]) => {
      const span = Number(/<w:gridSpan w:val="(\d+)"/.exec(tc)?.[1] ?? 1);
      return [cellText(tc), ...Array(Math.max(0, span - 1)).fill("")]; // merged cells keep later columns in place
    }));
}

/**
 * D11: a lead list typed as a Word table (.docx). Returns the grid like a spreadsheet.
 * ponytail: tables nested inside a cell are flattened into that cell; fine for lead lists.
 */
export async function docxGrid(data: ArrayBuffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(data);
  const doc = await zip.file("word/document.xml")?.async("string");
  if (!doc) throw new Error("This doesn't look like a Word document.");
  const tables = [...doc.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map(([t]) => tableRows(t)).filter((t) => t.length);
  if (!tables.length) throw new Error("This Word file has no table. Put the leads in a table (one row per lead) and try again.");
  const head = tables[0][0].join("\u0001");
  if (tables.length > 1 && tables.every((t) => t[0].join("\u0001") === head)) // one list continued across pages
    return [tables[0][0], ...tables.flatMap((t) => t.slice(1))];
  return tables.reduce((a, b) => (b.length > a.length ? b : a));
}
