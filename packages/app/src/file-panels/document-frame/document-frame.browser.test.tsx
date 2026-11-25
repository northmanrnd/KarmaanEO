import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { DocumentFrame } from "./index.web";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let url: string | null = null;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  if (url) URL.revokeObjectURL(url);
});

function fixturePdf() {
  const stream = "BT /F1 24 Tf 50 700 Td (KarmaanEO PDF preview) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return pdf;
}

it("opens PDF bytes in the browser document viewer", async () => {
  await page.viewport(1000, 800);
  url = URL.createObjectURL(new Blob([fixturePdf()], { type: "application/pdf" }));
  container = document.createElement("div");
  container.style.cssText = "width:900px;height:750px;display:flex";
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<DocumentFrame url={url!} testID="pdf-preview" />));
  await expect.element(page.getByTestId("pdf-preview")).toBeVisible();
  const frame = container.querySelector("iframe")!;
  expect(frame.src).toBe(url);
  expect(frame.hasAttribute("sandbox")).toBe(false);
  // Chromium renders its PDF plugin after the iframe load; allow its first painted page for visual evidence.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await page.screenshot();
});
