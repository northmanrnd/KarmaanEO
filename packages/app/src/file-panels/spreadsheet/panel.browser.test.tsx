import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { utils, write } from "xlsx";
import { WorkbookView } from "./panel";
import { readWorkbook } from "./model";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

it("renders XLSX values, switches sheets and refreshes changed bytes", async () => {
  await page.viewport(1000, 700);
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    ["Material", "Quantity", "Unit cost"],
    ["Duct", 120, 12.5],
    ["Grille", 8, 45],
  ]);
  sheet.C2.z = "$0.00";
  utils.book_append_sheet(book, sheet, "Estimate");
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([["Field notes"], ["Verify ceiling height"]]),
    "Notes",
  );
  const workbook = readWorkbook(new Uint8Array(write(book, { type: "array", bookType: "xlsx" })));
  container = document.createElement("div");
  container.style.cssText = "width:900px;height:500px;display:flex;background:#fff";
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<WorkbookView workbook={workbook} />));
  await expect.element(page.getByText("$12.50", { exact: true })).toBeVisible();
  await page.screenshot();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect.element(page.getByText("Verify ceiling height", { exact: true })).toBeVisible();
  const changed = structuredClone(workbook);
  changed.Sheets.Notes = utils.aoa_to_sheet([["Updated by agent"]]);
  act(() => root?.render(<WorkbookView workbook={changed} />));
  await expect.element(page.getByText("Updated by agent", { exact: true })).toBeVisible();
  expect(container.querySelectorAll("script")).toHaveLength(0);
});
