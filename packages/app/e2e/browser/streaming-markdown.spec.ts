import { seedMockAgentWorkspace, openAgentRoute } from "../support/helpers/mock-agent";
import { expect, test } from "../support/fixtures";
import {
  withAcpStreamingMarkdown,
  requestAcpMarkdown,
  expectAcpMarkdown,
  reloadAcpMarkdown,
} from "../support/helpers/acp-streaming-markdown";
import {
  expectFinishedMarkdown,
  expectReloadedMarkdown,
  expectUnfinishedBold,
  expectUnfinishedLink,
  requestStreamingMarkdown,
  withStreamingMarkdown,
} from "../support/helpers/streaming-markdown";

test("formats unfinished Markdown while streaming and preserves the completed rendering", async ({
  page,
}, testInfo) => {
  await withStreamingMarkdown(page, testInfo, async (agent) => {
    await requestStreamingMarkdown(agent);
    await expectUnfinishedBold(page);
    await expectUnfinishedLink(page, agent, testInfo);
    await expectFinishedMarkdown(page, agent, testInfo);
    await expectReloadedMarkdown(page);
  });
});

for (const width of [1100, 390]) {
  test(`ACP plugin chunks preserve Markdown and separate turns at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await withAcpStreamingMarkdown(page, async (agent) => {
      await requestAcpMarkdown(agent);
      await expectAcpMarkdown(page, 1);
      await requestAcpMarkdown(agent);
      await expectAcpMarkdown(page, 2);
      await reloadAcpMarkdown(page, testInfo);
    });
  });
}

test("Codex output citation renders as a link and survives reloading history", async ({ page }) => {
  const url =
    "https://docs.google.com/document/d/1m1aPpaVoCsbc4i2xtMv08VUZa5GQgYEp931imBQjUwA/edit";
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "codex-citation-",
    title: "Citation QA",
    featureValues: {
      mockStreamingAssistantResponse: `:codex-file-citation{path="[Google document](${url})" purpose="output"}`,
      mockStreamingAssistantIntervalMs: 10,
    },
  });
  try {
    await openAgentRoute(page, agent);
    await agent.client.sendAgentMessage(agent.agentId, "Show output");
    await agent.client.waitForFinish(agent.agentId, 30_000);
    const message = page.getByTestId("assistant-message").last();
    await expect(
      message.getByRole("link", { name: "Google document", exact: true }),
    ).toHaveAttribute("href", url);
    await expect(message).not.toContainText(":codex-file-citation");
    await page.reload();
    await expect(
      message.getByRole("link", { name: "Google document", exact: true }),
    ).toHaveAttribute("href", url);
  } finally {
    await agent.cleanup();
  }
});
