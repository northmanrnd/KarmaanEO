import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import { cellText, columnLabel, readWorkbook, sheetRange } from "./model";

describe("spreadsheet preview", () => {
  it("reads actual XLSX bytes, sheets, number formats and formula caches", () => {
    const book = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ["Item", "Price"],
      ["Duct", 1234.5],
    ]);
    sheet.B2.z = "$#,##0.00";
    sheet.B3 = { t: "n", v: 2469, f: "B2*2" };
    sheet["!ref"] = "A1:B3";
    utils.book_append_sheet(book, sheet, "Estimate");
    utils.book_append_sheet(book, utils.aoa_to_sheet([["Second sheet"]]), "Notes");
    const actual = readWorkbook(new Uint8Array(write(book, { type: "array", bookType: "xlsx" })));
    expect(actual.SheetNames).toEqual(["Estimate", "Notes"]);
    expect(cellText(actual.Sheets.Estimate, 1, 1)).toBe("$1,234.50");
    expect(cellText(actual.Sheets.Estimate, 2, 1)).toBe("2469");
    expect(sheetRange(actual.Sheets.Estimate).e).toEqual({ r: 2, c: 1 });
  });
  it("keeps missing formula values, sparse cells and cell text explicit", () => {
    const sheet = {
      A1: { t: "n" as const, f: "SUM(B1:B3)" },
      B1: { t: "s" as const, v: "<script>alert(1)</script>" },
    };
    expect(cellText(sheet, 0, 0)).toBe("=SUM(B1:B3)");
    expect(cellText(sheet, 1, 0)).toBe("");
    expect(cellText(sheet, 0, 1)).toBe("<script>alert(1)</script>");
    expect(columnLabel(27)).toBe("AB");
  });
});

it("previews delimited source text without rewriting quoted cells", () => {
  const csv = readWorkbook('Item,Quantity\n"Duct, insulated",12\n');
  expect(cellText(csv.Sheets[csv.SheetNames[0]], 1, 0)).toBe("Duct, insulated");
  const tsv = readWorkbook("Item\tQuantity\nGrille\t8\n");
  expect(cellText(tsv.Sheets[tsv.SheetNames[0]], 1, 1)).toBe("8");
});
