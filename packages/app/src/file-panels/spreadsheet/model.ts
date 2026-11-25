import { read, utils, type WorkBook, type WorkSheet } from "xlsx";

export function readWorkbook(bytes: Uint8Array | string): WorkBook {
  return read(bytes, {
    type: typeof bytes === "string" ? "string" : "array",
    cellFormula: true,
    cellText: true,
    cellStyles: true,
  });
}

export function sheetRange(sheet: WorkSheet) {
  return utils.decode_range(sheet["!ref"] ?? "A1");
}

export function cellText(sheet: WorkSheet, row: number, column: number): string {
  const cell = sheet[utils.encode_cell({ r: row, c: column })];
  if (!cell) return "";
  if (cell.v == null) return cell.f ? `=${cell.f}` : "";
  return cell.w ?? utils.format_cell(cell);
}

export function columnLabel(column: number): string {
  return utils.encode_col(column);
}
