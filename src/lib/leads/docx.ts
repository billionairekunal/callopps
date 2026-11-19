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

/** Every table at any depth as [start, end) offsets, found by counting nesting (lazy regexes stop at an inner </w:tbl>). */
function tableRanges(xml: string): [number, number][] {
  const out: [number, number][] = [], open: number[] = [];
  for (const m of xml.matchAll(/<w:tbl[\s>]|<\/w:tbl>/g)) {
    if (m[0].startsWith("</")) { const st = open.pop(); if (st != null) out.push([st, m.index! + m[0].length]); }
    else open.push(m.index!);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

function tableRows(xml: string): string[][] {
  const grid: string[][] = [];
  for (const [tr] of xml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)) {
    const row: string[] = Array(Number(/<w:gridBefore w:val="(\d+)"/.exec(tr)?.[1] ?? 0)).fill("");
    for (const [tc] of tr.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)) {
      const span = Number(/<w:gridSpan w:val="(\d+)"/.exec(tc)?.[1] ?? 1);
      // A vertical-merge continuation repeats the value above (a city or process merged down the column).
      const continued = /<w:vMerge(?![^>]*w:val="restart")[^>]*\/?>/.test(tc);
      const text = continued ? grid.at(-1)?.[row.length] ?? "" : cellText(tc);
      row.push(text, ...Array(Math.max(0, span - 1)).fill("")); // merged cells keep later columns in place
    }
    grid.push(row);
  }
  return grid;
}

/** D11: a lead list typed as a Word table (.docx). Returns the grid like a spreadsheet. */
export async function docxGrid(data: ArrayBuffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(data);
  const doc = await zip.file("word/document.xml")?.async("string");
  if (!doc) throw new Error("This doesn't look like a Word document.");
  const ranges = tableRanges(doc);
  // Each table is read without the tables nested inside it; those are read as tables of their own.
  const tables = ranges.map(([a, b]) => {
    let xml = doc.slice(a, b);
    const inside = ranges.filter(([c, d]) => c > a && d < b);
    const direct = inside.filter(([c, d]) => !inside.some(([e, f]) => e < c && f > d)); // grandchildren go with their parent
    for (const [c, d] of direct.sort((x, y) => y[0] - x[0])) xml = xml.slice(0, c - a) + xml.slice(d - a);
    return tableRows(xml);
  }).filter((t) => t.length);
  if (!tables.length) throw new Error("This Word file has no table. Put the leads in a table (one row per lead) and try again.");
  const head = tables[0][0].join("");
  if (tables.length > 1 && tables.every((t) => t[0].join("") === head)) // one list continued across pages
    return [tables[0][0], ...tables.flatMap((t) => t.slice(1))];
  // The lead list is the table with the most rows; on a tie, the wider one (layout tables are usually one column).
  const width = (t: string[][]) => Math.max(...t.map((r) => r.length));
  return tables.reduce((a, b) => (b.length > a.length || (b.length === a.length && width(b) > width(a)) ? b : a));
}
