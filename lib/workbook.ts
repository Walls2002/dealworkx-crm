import "server-only";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { parseCsv } from "./csv";

export type Sheet = { name: string; header: string[]; rows: string[][] };

const MAX_ROWS = 20_000;

/** A cell as display text: rich text, hyperlinks, formula results and dates all become plain strings. */
function text(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("hyperlink" in value) return String(value.hyperlink ?? "");
    if ("result" in value) return text(value.result as ExcelJS.CellValue);
    if ("error" in value) return "";
    return "";
  }
  return String(value);
}

/** Read every sheet of an .xlsx, or the single sheet of a .csv. The first non-empty row is the header. */
export async function readWorkbook(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const [header = [], ...rows] = parseCsv(await file.text());
    return [{ name: file.name.replace(/\.csv$/i, ""), header: header.map((h) => h.trim()), rows: rows.slice(0, MAX_ROWS) }];
  }
  if (!name.endsWith(".xlsx")) throw new Error("Upload an Excel workbook (.xlsx) or a CSV file.");

  // The streaming reader, not wb.xlsx.load: on a 12 MB Apollo export it takes ~3 s and ~75 MB of memory
  // instead of ~10 s and ~400 MB, because it never builds the styled in-memory workbook.
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(Buffer.from(await file.arrayBuffer())), {
    sharedStrings: "cache",
    hyperlinks: "ignore", // a linked cell then reads as its text, which is the URL in these exports
    styles: "ignore",
    worksheets: "emit",
    entries: "emit",
  });
  const sheets: Sheet[] = [];
  try {
    for await (const ws of reader) {
      let header: string[] | null = null;
      const rows: string[][] = [];
      for await (const row of ws) {
        // row.values is 1-indexed and sparse; Array.from fills the holes so blank cells keep their column.
        const cells = Array.from((row.values as ExcelJS.CellValue[]).slice(1), (v) => text(v).trim());
        if (!cells.some(Boolean)) continue;
        if (!header) header = cells;
        else if (rows.length < MAX_ROWS) rows.push(cells);
      }
      const name = (ws as unknown as { name: string }).name;
      if (header) sheets.push({ name, header, rows });
    }
  } catch {
    throw new Error("That file couldn't be opened as an Excel workbook. Save it as .xlsx and try again.");
  }
  // Hidden sheets are skipped, as before. The sheet list is only complete once the whole file has been read.
  const model = (reader as unknown as { model?: { sheets?: { name: string; state?: string }[] } }).model;
  const hidden = new Set((model?.sheets ?? []).filter((s) => s.state && s.state !== "visible").map((s) => s.name));
  const visible = sheets.filter((s) => !hidden.has(s.name));
  if (!visible.length) throw new Error("The workbook has no sheets with data.");
  return visible;
}
