import { CONTINUED_FROM_AGENT_ID_LABEL } from "@getpaseo/protocol/agent-labels";
import type { Locator, Page } from "@playwright/test";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { expect, test } from "../support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../support/helpers/mock-agent";
import { seedWorkspace } from "../support/helpers/seed-client";
import { connectDaemonClient } from "../support/helpers/daemon-client-loader";
import { getServerId } from "../support/helpers/server-id";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";

async function drag(page: Page, from: Locator, to: Locator, after = false) {
  await expect(async () => {
    await from.scrollIntoViewIfNeeded();
  }).toPass({ timeout: 10_000 });
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("Missing drag endpoints");
  await page.mouse.move(a.x + Math.min(a.width / 2, 80), a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + Math.min(a.width / 2, 80) + 12, a.y + a.height / 2, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * (after ? 0.8 : 0.3), { steps: 15 });
  await expect(to).toHaveAttribute("data-placement-hover", "true");
  await page.screenshot({ path: "/private/tmp/placement-drag-preview.png" });
  await page.mouse.up();
}

test("tabs move between projects, create a destination from the plus button and preserve ownership after reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const source = await seedMockAgentWorkspace({
    repoPrefix: "drag-source-",
    title: "Move my work",
    initialPrompt: "Remember the original task",
  });
  const destination = await seedWorkspace({ repoPrefix: "drag-destination-" });
  const client = await connectDaemonClient<DaemonClient>({ clientIdPrefix: "placement-drag" });
  const serverId = getServerId();
  try {
    await source.client.waitForFinish(source.agentId, 30_000);
    const original = await client.fetchAgent(source.agentId);
    await openAgentRoute(page, source);
    await waitForSidebarHydration(page);
    const tab = () =>
      page.getByTestId(`workspace-tab-agent_${source.agentId}`).filter({ visible: true }).first();
    await expect(tab()).toBeVisible();
    await page.screenshot({ path: "/private/tmp/placement-before.png" });
    await drag(
      page,
      tab(),
      page.getByTestId(`placement-workspace-${serverId}:${destination.workspaceId}`),
    );
    await expect
      .poll(async () => (await client.fetchAgent(source.agentId))?.agent.workspaceId)
      .toBe(destination.workspaceId);
    await expect(tab()).toBeVisible();
    await page.reload();
    await expect(tab()).toBeVisible();
    const plus = page.getByTestId(`placement-new-workspace-${destination.projectKey}`).first();
    await page.getByTestId(`sidebar-project-row-${destination.projectKey}`).hover();
    await drag(page, tab(), plus);
    await expect
      .poll(async () => (await client.fetchAgent(source.agentId))?.agent.workspaceId)
      .not.toBe(destination.workspaceId);
    const moved = (await client.fetchAgent(source.agentId))!.agent;
    expect(moved.id).toBe(source.agentId);
    expect(moved.cwd).toBe(original!.agent.cwd);
    expect(moved.lastUserMessageAt).toBe(original!.agent.lastUserMessageAt);
    const workspaces = await client.fetchWorkspaces();
    expect(workspaces.entries.find((entry) => entry.id === moved.workspaceId)?.projectId).toBe(
      destination.projectId,
    );
    await page.reload();
    await expect(tab()).toBeVisible();
    await page.screenshot({ path: "/private/tmp/placement-after.png" });
  } finally {
    await client.close();
    await source.cleanup();
    await destination.cleanup();
  }
});

test("workspaces drag between projects and reorder persistently without changing their working directories", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const source = await seedMockAgentWorkspace({
    repoPrefix: "drag-workspace-",
    title: "Workspace task",
  });
  const destination = await seedWorkspace({ repoPrefix: "drag-project-" });
  const client = await connectDaemonClient<DaemonClient>({ clientIdPrefix: "placement-workspace" });
  const serverId = getServerId();
  try {
    const extra = await destination.client.createWorkspace({
      source: { kind: "directory", path: destination.repoPath, projectId: destination.projectId },
      title: "Extra workspace",
    });
    if (!extra.workspace) throw new Error("Missing seeded workspace");
    await openAgentRoute(page, source);
    await waitForSidebarHydration(page);
    const moving = page.getByTestId(`placement-workspace-${serverId}:${source.workspaceId}`);
    const header = page.getByTestId(`placement-project-${destination.projectKey}`);
    await drag(page, moving, header);
    await expect
      .poll(
        async () =>
          (await client.fetchWorkspaces()).entries.find((entry) => entry.id === source.workspaceId)
            ?.projectId,
      )
      .toBe(destination.projectId);
    await expect(
      header.locator("..").getByTestId(`placement-workspace-${serverId}:${source.workspaceId}`),
    ).toBeVisible();
    const target = page.getByTestId(`placement-workspace-${serverId}:${destination.workspaceId}`);
    await drag(page, moving, target);
    const group = page.getByRole("group", {
      name: destination.projectKey.split("/").pop(),
      exact: true,
    });
    const order = async () =>
      group
        .locator('[data-testid^="placement-workspace-"]')
        .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")));
    await expect
      .poll(order)
      .toEqual(
        expect.arrayContaining([
          `placement-workspace-${serverId}:${source.workspaceId}`,
          `placement-workspace-${serverId}:${destination.workspaceId}`,
        ]),
      );
    await expect
      .poll(async () => {
        const keys = await order();
        return (
          keys.indexOf(`placement-workspace-${serverId}:${source.workspaceId}`) -
          keys.indexOf(`placement-workspace-${serverId}:${destination.workspaceId}`)
        );
      })
      .toBeLessThan(0);
    const expected = await order();
    expect(expected.indexOf(`placement-workspace-${serverId}:${source.workspaceId}`)).toBeLessThan(
      expected.indexOf(`placement-workspace-${serverId}:${destination.workspaceId}`),
    );
    await page.reload();
    await expect.poll(order).toEqual(expected);
    expect(
      (await client.fetchWorkspaces()).entries.find((entry) => entry.id === source.workspaceId)
        ?.workspaceDirectory,
    ).toBe(source.cwd);
    await page.screenshot({ path: "/private/tmp/placement-workspaces.png" });
  } finally {
    await client.close();
    await source.cleanup();
    await destination.cleanup();
  }
});

test("rejected agent moves leave the source and workspace count intact", async ({ page }) => {
  test.setTimeout(120_000);
  const source = await seedMockAgentWorkspace({
    repoPrefix: "drag-rejected-",
    title: "Linked continuation",
  });
  const client = await connectDaemonClient<DaemonClient>({ clientIdPrefix: "placement-rejected" });
  try {
    const parent = await client.createAgent({
      provider: "mock",
      cwd: source.cwd,
      workspaceId: source.workspaceId,
      title: "Earlier work",
      modeId: "load-test",
      model: "e2e-fast-stream",
    });
    await client.updateAgent(source.agentId, {
      labels: { [CONTINUED_FROM_AGENT_ID_LABEL]: parent.id },
    });
    await openAgentRoute(page, source);
    await waitForSidebarHydration(page);
    const before = (await client.fetchWorkspaces()).entries.length;
    const tab = page
      .getByTestId(`workspace-tab-agent_${source.agentId}`)
      .filter({ visible: true })
      .first();
    const plus = page.locator('[data-testid^="placement-new-workspace-"]').first();
    await page.locator('[data-testid^="sidebar-project-row-"]').first().hover();
    await drag(page, tab, plus);
    await expect(
      page.getByText("Remove continuation links before moving this agent.", { exact: true }),
    ).toBeVisible();
    expect((await client.fetchAgent(source.agentId))?.agent.workspaceId).toBe(source.workspaceId);
    expect((await client.fetchWorkspaces()).entries).toHaveLength(before);
    await expect(tab).toBeVisible();
  } finally {
    await client.close();
    await source.cleanup();
  }
});
