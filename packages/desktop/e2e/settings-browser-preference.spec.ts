import { expect, test } from "../../app/e2e/support/fixtures";
import { gotoAppShell, openSettings } from "../../app/e2e/support/helpers/app";
import { openSettingsSection } from "../../app/e2e/support/helpers/settings";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { installDesktopRuntime } from "./support/runtime";

test("link browser menu choice persists after reopening settings", async ({ page }) => {
  await installDesktopRuntime(page, { serverId: getServerId() });
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "general");
  await page
    .getByRole("button", { name: "Open links in: Default OS browser", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Built-in browser", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open links in: Built-in browser", exact: true }),
  ).toBeVisible();
  await page.reload();
  await openSettings(page);
  await openSettingsSection(page, "general");
  await expect(
    page.getByRole("button", { name: "Open links in: Built-in browser", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open links in: Built-in browser", exact: true }).click();
  await page.getByRole("menuitem", { name: "Default OS browser", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open links in: Default OS browser", exact: true }),
  ).toBeVisible();
});
