import "server-only";
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

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("That file couldn't be opened as an Excel workbook. Save it as .xlsx and try again.");
  }
  const sheets: Sheet[] = [];
  wb.eachSheet((ws) => {
    if (ws.state !== "visible") return;
    let header: string[] | null = null;
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      // row.values is 1-indexed and sparse; Array.from fills the holes so blank cells keep their column.
      const cells = Array.from((row.values as ExcelJS.CellValue[]).slice(1), (v) => text(v).trim());
      if (!cells.some(Boolean)) return;
      if (!header) header = cells;
      else if (rows.length < MAX_ROWS) rows.push(cells);
    });
    if (header) sheets.push({ name: ws.name, header, rows });
  });
  if (!sheets.length) throw new Error("The workbook has no sheets with data.");
  return sheets;
}
