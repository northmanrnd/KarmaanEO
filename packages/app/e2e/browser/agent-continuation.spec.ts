import { selectModel } from "../support/helpers/app";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { connectDaemonClient } from "../support/helpers/daemon-client-loader";
import { expect, test } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import {
  composerLocator as composerInput,
  expectComposerVisible,
  fillComposerDraft,
} from "../support/helpers/composer";

import { CONTINUED_FROM_AGENT_ID_LABEL } from "@getpaseo/protocol/agent-labels";

test("continuation drafts retain editable handoff across reload and link on first send", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const source = await seedMockAgentWorkspace({
    repoPrefix: "continuation-",
    title: "Original work",
    initialPrompt: "Keep the original goal and progress",
  });
  const client = await connectDaemonClient<DaemonClient>({ clientIdPrefix: "continuation-test" });
  try {
    await source.client.waitForFinish(source.agentId, 30_000);
    const original = await client.fetchAgent(source.agentId);
    await openAgentRoute(page, source);
    await expectComposerVisible(page);
    await page.getByTestId("agent-continue").click();
    await expect(page.getByTestId("continuation-draft-notice")).toBeVisible();
    await expect(
      page.getByTestId("composer-restored-attachment-pill").filter({ hasText: "Chat history" }),
    ).toBeVisible();
    await expect(composerInput(page)).toHaveValue(/Continue the work/);
    const before = await client.fetchAgents();
    expect(
      before.entries.filter((entry) => entry.agent.workspaceId === source.workspaceId),
    ).toHaveLength(1);
    await fillComposerDraft(page, "Finish the remaining work; preserve the earlier decisions.");
    await page.reload();
    await expect(page.getByTestId("continuation-draft-notice")).toBeVisible();
    await expect(composerInput(page)).toHaveValue(
      "Finish the remaining work; preserve the earlier decisions.",
    );
    await expect(
      page.getByTestId("composer-restored-attachment-pill").filter({ hasText: "Chat history" }),
    ).toBeVisible();
    await page
      .getByTestId("composer-restored-attachment-pill")
      .filter({ hasText: "Chat history" })
      .click();
    await expect(page.getByTestId("restored-attachment-preview")).toContainText(
      "Keep the original goal and progress",
    );
    await page.keyboard.press("Escape");
    await selectModel(page, "Ten second stream");
    await page.screenshot({ path: "/private/tmp/karmaaneo-continuation-draft.png" });
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(
      page.getByTestId("agent-continuation-source").filter({ visible: true }),
    ).toContainText("Original work", { timeout: 30_000 });
    const after = await client.fetchAgents();
    const successor = after.entries.find(
      (entry) => entry.agent.labels[CONTINUED_FROM_AGENT_ID_LABEL] === source.agentId,
    )?.agent;
    expect(successor?.workspaceId).toBe(source.workspaceId);
    expect(successor?.provider).toBe("mock");
    expect(successor?.model).toBe("ten-second-stream");
    expect((await client.fetchAgent(source.agentId))?.agent.lastUserMessageAt).toBe(
      original?.agent.lastUserMessageAt,
    );
    await page.getByTestId("agent-continuation-source").filter({ visible: true }).click();
    await expect(page.getByTestId(`agent-continuation-next-${successor!.id}`)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId(`agent-continuation-next-${successor!.id}`)).toBeVisible();
    await page.screenshot({ path: "/private/tmp/karmaaneo-continuation-linked.png" });
  } finally {
    await client.close();
    await source.cleanup();
  }
});

test("existing agents can be linked, reject a cycle, and remove the link", async ({ page }) => {
  test.setTimeout(120_000);
  const source = await seedMockAgentWorkspace({
    repoPrefix: "continuation-manual-",
    title: "Earlier agent",
  });
  const client = await connectDaemonClient<DaemonClient>({ clientIdPrefix: "continuation-test" });
  try {
    const later = await client.createAgent({
      provider: "mock",
      cwd: source.cwd,
      workspaceId: source.workspaceId,
      title: "Later agent",
      modeId: "load-test",
      model: "e2e-fast-stream",
    });
    await openAgentRoute(page, { workspaceId: source.workspaceId, agentId: later.id });
    await expectComposerVisible(page);
    await page.getByTestId("agent-continuation-link").filter({ visible: true }).click();
    await page.getByTestId(`agent-continuation-option-${source.agentId}`).click();
    await expect(
      page.getByTestId("agent-continuation-source").filter({ visible: true }),
    ).toContainText("Earlier agent");
    await page.reload();
    await expect(
      page.getByTestId("agent-continuation-source").filter({ visible: true }),
    ).toContainText("Earlier agent");
    await page.getByTestId("agent-continuation-source").filter({ visible: true }).click();
    await expect(page.getByTestId(`agent-continuation-next-${later.id}`)).toBeVisible();
    await page.getByTestId("agent-continuation-link").filter({ visible: true }).click();
    await page.getByTestId(`agent-continuation-option-${later.id}`).click();
    await expect(page.getByTestId("agent-continuation-picker-error")).toContainText("cycle");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByTestId(`agent-continuation-next-${later.id}`).click();
    await page.getByTestId("agent-continuation-unlink").filter({ visible: true }).click();
    await expect(
      page.getByTestId("agent-continuation-source").filter({ visible: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByTestId("agent-continuation-source").filter({ visible: true }),
    ).toHaveCount(0);
  } finally {
    await client.close();
    await source.cleanup();
  }
});
