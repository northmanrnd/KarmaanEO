import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "../support/fixtures";
import { installLocalDesktopHost } from "../support/helpers/local-desktop-host";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

async function installFinder(page: Page, directory: string, remote = false) {
  await installLocalDesktopHost(page, directory);
  await page.addInitScript(
    ({ remote: remoteHost }) => {
      const host = window.paseoDesktop!;
      const originalInvoke = host.invoke;
      if (remoteHost)
        host.invoke = async (command, ...args) =>
          command === "desktop_daemon_status"
            ? { serverId: "another-host", status: "running" }
            : originalInvoke?.(command, ...args);
      const calls: unknown[] = [];
      Object.assign(window, { finderCalls: calls });
      host.editor = {
        listTargets: async () => [
          {
            id: "finder",
            label: "Finder",
            kind: "file-manager",
            icon: { kind: "symbol", name: "folder" },
          },
        ],
        openTarget: async (input) => {
          if (input.filePath?.endsWith("missing.md")) throw new Error("File not found: missing.md");
          calls.push(input);
        },
      };
    },
    { remote },
  );
}

test("local file link context menu reveals the resolved file and preserves normal opening", async ({
  page,
}) => {
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "finder-links-",
    title: "Finder links",
    featureValues: {
      mockStreamingAssistantResponse:
        "Read [the guide](./docs/my%20guide.md#L7), [missing](./missing.md), or [website](https://example.com/guide.md).",
      mockStreamingAssistantIntervalMs: 5,
    },
  });
  try {
    await mkdir(path.join(agent.cwd, "docs"), { recursive: true });
    await writeFile(
      path.join(agent.cwd, "docs/my guide.md"),
      "# Finder guide\n" + "Text\n".repeat(12),
    );
    await installFinder(page, agent.cwd);
    await openAgentRoute(page, agent);
    await agent.client.sendAgentMessage(agent.agentId, "Show the links");
    await agent.client.waitForFinish(agent.agentId, 30_000);
    const link = page.getByRole("link", { name: "the guide", exact: true });
    await link.click({ button: "right" });
    await expect(
      page.getByRole("menuitem", { name: "Reveal in Finder", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Copy path", exact: true })).toBeVisible();
    // Let the menu enter animation finish before capturing visual evidence.
    await page.waitForTimeout(180);
    await page.screenshot({ path: "/private/tmp/karmaaneo-file-link-finder.png" });
    await page.getByRole("menuitem", { name: "Reveal in Finder", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, "finderCalls")))
      .toEqual([
        {
          editorId: "finder",
          workspacePath: agent.cwd,
          filePath: path.join(agent.cwd, "docs/my guide.md"),
        },
      ]);
    await page.getByRole("link", { name: "missing", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Reveal in Finder", exact: true }).click();
    await expect(page.getByText("File not found: missing.md", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "website", exact: true }).click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Reveal in Finder", exact: true })).toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");
    await link.click();
    await expect(page.getByTestId("file-source-editor")).toBeVisible();
    await expect(page.getByTestId("workspace-tab-file_docs/my guide.md").first()).toBeVisible();
  } finally {
    await agent.cleanup();
  }
});

test("remote file links do not offer the local Finder action", async ({ page }) => {
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "remote-finder-links-",
    title: "Remote links",
    featureValues: {
      mockStreamingAssistantResponse: "Read [the guide](./guide.md).",
      mockStreamingAssistantIntervalMs: 5,
    },
  });
  try {
    await installFinder(page, agent.cwd, true);
    await openAgentRoute(page, agent);
    await agent.client.sendAgentMessage(agent.agentId, "Show the link");
    await agent.client.waitForFinish(agent.agentId, 30_000);
    await page.getByRole("link", { name: "the guide", exact: true }).click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Reveal in Finder", exact: true })).toHaveCount(
      0,
    );
    expect(await page.evaluate(() => Reflect.get(window, "finderCalls"))).toEqual([]);
  } finally {
    await agent.cleanup();
  }
});
