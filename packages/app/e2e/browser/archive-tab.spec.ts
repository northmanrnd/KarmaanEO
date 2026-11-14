import { expectAgentIdle } from "../support/helpers/agent-stream";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";
import { seedMockAgentWorkspace, openAgentRoute } from "../support/helpers/mock-agent";
import {
  fillComposerDraft,
  expectComposerDraft,
  expectComposerVisible,
  submitMessage,
} from "../support/helpers/composer";
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "../support/fixtures";
import { getServerId } from "../support/helpers/server-id";
import { connectSeedClient } from "../support/helpers/seed-client";
import { createTempGitRepo } from "../support/helpers/workspace";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";
import {
  archiveAgentFromDaemon,
  archiveAgentFromSessions,
  clickSessionRow,
  createIdleAgent,
  expectArchivedAgentFocused,
  expectSessionRowArchived,
  expectSessionRowVisible,
  expectWorkspaceArchiveOutcome,
  expectWorkspaceTabHidden,
  fetchAgentArchivedAt,
  openSessions,
  openWorkspaceWithAgents,
  primeAdditionalPage,
  resetSeededPageState,
  reloadWorkspace,
} from "../support/helpers/archive-tab";
import { expectAgentTabActive } from "../support/helpers/launcher";

test.describe("Archive tab reconciliation", () => {
  let client: Awaited<ReturnType<typeof connectSeedClient>>;
  let tempRepo: { path: string; cleanup: () => Promise<void> };
  let projectId: string;
  let workspaceId: string;

  test.describe.configure({ timeout: 300_000 });

  test.beforeAll(async () => {
    tempRepo = await createTempGitRepo("archive-tab-");
    client = await connectSeedClient();
    const created = await client.createWorkspace({
      source: { kind: "directory", path: tempRepo.path },
    });
    if (!created.workspace) {
      throw new Error(created.error ?? `Failed to create workspace ${tempRepo.path}`);
    }
    projectId = created.workspace.projectId;
    workspaceId = created.workspace.id;
  });

  test.afterAll(async () => {
    await client?.removeProject(projectId).catch(() => undefined);
    await client?.close().catch(() => undefined);
    await tempRepo?.cleanup();
  });

  test("non-UI archive prunes the archived tab across open pages and reload", async ({ page }) => {
    const archived = await createIdleAgent(client, {
      cwd: tempRepo.path,
      workspaceId,
      title: `cli-archive-${randomUUID().slice(0, 8)}`,
    });
    const surviving = await createIdleAgent(client, {
      cwd: tempRepo.path,
      workspaceId,
      title: `cli-control-${randomUUID().slice(0, 8)}`,
    });
    const passivePage = await page.context().newPage();

    try {
      await primeAdditionalPage(passivePage);
      await resetSeededPageState(page);
      await resetSeededPageState(passivePage);
      await openSessions(page);
      await expectSessionRowVisible(page, archived.title);
      await expectSessionRowVisible(page, surviving.title);
      await openSessions(passivePage);
      await expectSessionRowVisible(passivePage, archived.title);
      await expectSessionRowVisible(passivePage, surviving.title);
      await openWorkspaceWithAgents(page, [archived, surviving]);
      await openWorkspaceWithAgents(passivePage, [archived, surviving]);
      await archiveAgentFromDaemon(client, archived.id);
      await expectWorkspaceArchiveOutcome(page, {
        archivedAgentId: archived.id,
        survivingAgentId: surviving.id,
      });
      await expectWorkspaceArchiveOutcome(passivePage, {
        archivedAgentId: archived.id,
        survivingAgentId: surviving.id,
      });
      await reloadWorkspace(passivePage, surviving.workspaceId);
      await expectWorkspaceTabHidden(passivePage, archived.id);
    } finally {
      await passivePage.close();
    }
  });

  test("Sessions archive prunes the archived tab across open pages", async ({ page }) => {
    const archived = await createIdleAgent(client, {
      cwd: tempRepo.path,
      workspaceId,
      title: `ui-archive-${randomUUID().slice(0, 8)}`,
    });
    const surviving = await createIdleAgent(client, {
      cwd: tempRepo.path,
      workspaceId,
      title: `ui-control-${randomUUID().slice(0, 8)}`,
    });
    const passivePage = await page.context().newPage();

    try {
      await primeAdditionalPage(passivePage);
      await resetSeededPageState(page);
      await resetSeededPageState(passivePage);
      await openWorkspaceWithAgents(page, [archived, surviving]);
      await openWorkspaceWithAgents(passivePage, [archived, surviving]);
      await openSessions(page);
      await archiveAgentFromSessions(page, { agentId: archived.id, title: archived.title });
      await reloadWorkspace(page, surviving.workspaceId);
      await expectWorkspaceTabHidden(page, archived.id);
      await expectWorkspaceArchiveOutcome(passivePage, {
        archivedAgentId: archived.id,
        survivingAgentId: surviving.id,
      });
    } finally {
      await passivePage.close();
    }
  });

  test("clicking an archived session navigates without unarchiving it", async ({ page }) => {
    const archived = await createIdleAgent(client, {
      cwd: tempRepo.path,
      workspaceId,
      title: `unarchive-archived-${randomUUID().slice(0, 8)}`,
    });
    const surviving = await createIdleAgent(client, {
      cwd: tempRepo.path,
      workspaceId,
      title: `unarchive-control-${randomUUID().slice(0, 8)}`,
    });

    await resetSeededPageState(page);
    await openWorkspaceWithAgents(page, [archived, surviving]);
    await archiveAgentFromDaemon(client, archived.id);
    const archivedAt = await fetchAgentArchivedAt(client, archived.id);
    expect(archivedAt).not.toBeNull();
    await openSessions(page);
    await expectSessionRowArchived(page, archived.title);

    await clickSessionRow(page, archived.title);

    await expectArchivedAgentFocused(page, archived.id);
    await expectAgentTabActive(page, archived.id);
    expect(await fetchAgentArchivedAt(client, archived.id)).toBe(archivedAt);

    await expect(page).toHaveURL(buildHostWorkspaceRoute(getServerId(), archived.workspaceId), {
      timeout: 30_000,
    });
  });
});

test("reopens the complete agent with Command Shift T after close and reload", async ({ page }) => {
  test.setTimeout(90_000);
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "reopen-tab-",
    title: "Restored original agent",
  });
  try {
    page.on("dialog", (dialog) => dialog.accept());
    let failNextRestore = true;
    let directoryRequests = 0;
    await page.routeWebSocket(daemonWsRoutePattern(), (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => {
        const envelope = JSON.parse(String(message));
        const request = envelope.type === "session" ? envelope.message : null;
        if (request?.type === "fetch_agents_request") directoryRequests += 1;
        if (
          failNextRestore &&
          request?.type === "refresh_agent_request" &&
          request.agentId === agent.agentId
        ) {
          failNextRestore = false;
          ws.send(
            JSON.stringify({
              type: "session",
              message: {
                type: "rpc_error",
                payload: {
                  requestId: request.requestId,
                  requestType: request.type,
                  error: "Cannot restore agent yet. Retry reopening the tab.",
                  code: "agent_refresh_failed",
                },
              },
            }),
          );
        } else {
          server.send(message);
        }
      });
      server.onMessage((message) => ws.send(message));
    });
    await openAgentRoute(page, agent);
    await expectComposerVisible(page);
    await submitMessage(page, "Retain this chat history.");
    await agent.client.waitForFinish(agent.agentId, 30_000);
    await expect(
      page.getByTestId("user-message").filter({ hasText: "Retain this chat history." }),
    ).toHaveAttribute("aria-busy", "false");
    await expect(page.getByText("(end of synthetic stream)", { exact: true })).toBeVisible();
    await expectAgentIdle(page);
    await fillComposerDraft(page, "Retain this unsent draft.");
    await page
      .getByTestId(`workspace-tab-agent_${agent.agentId}`)
      .filter({ visible: true })
      .click({ button: "right" });
    await page.getByTestId(`workspace-tab-context-agent_${agent.agentId}-close`).click();
    await expectWorkspaceTabHidden(page, agent.agentId);
    await expect.poll(() => fetchAgentArchivedAt(agent.client, agent.agentId)).not.toBeNull();
    const requestsBeforeReload = directoryRequests;
    await page.reload();
    await expect.poll(() => directoryRequests).toBeGreaterThan(requestsBeforeReload);
    await expect(
      page.getByTestId("workspace-tabs-row").filter({ visible: true }).first(),
    ).toBeVisible();
    await page.keyboard.press("Meta+Shift+t");
    await expect(page.getByTestId("reopen-tab-error")).toContainText("Cannot restore agent yet");
    await expectWorkspaceTabHidden(page, agent.agentId);
    await page.keyboard.press("Meta+Shift+t");
    await expectComposerVisible(page);
    await expectComposerDraft(page, "Retain this unsent draft.");
    await expect(
      page.getByTestId("user-message").filter({ hasText: "Retain this chat history." }),
    ).toBeVisible();
    await expectAgentTabActive(page, agent.agentId);
    expect(await fetchAgentArchivedAt(agent.client, agent.agentId)).toBeNull();
    await expect(
      page.getByText("Restored original agent", { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("(end of synthetic stream)", { exact: true })).toBeVisible();
    await expect(page.getByTestId("reopen-tab-pending")).toHaveCount(0);
    await expect(page.getByTestId("terminal-surface")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("restored-agent.png") });
  } finally {
    await agent.cleanup();
  }
});
