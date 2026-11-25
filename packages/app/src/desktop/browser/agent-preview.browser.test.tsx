import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { AgentBrowserPreview } from "./agent-preview";
import { browserActivityKey, useBrowserActivity } from "./automation/activity";
import { useBrowserStore } from "./store";
const navigation = vi.hoisted(() => ({ openTab: vi.fn() }));
vi.mock("@/stores/workspace-layout-store", () => ({
  useWorkspaceLayoutStore: { getState: () => navigation },
}));
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  delete window.paseoDesktop;
  useBrowserActivity.setState({ byAgent: {}, paused: {} });
  useBrowserStore.setState({ browsersById: {} });
});

it("previews without changing tabs and opens the same tab on request", async () => {
  await page.viewport(1000, 700);
  const browserId = useBrowserStore.getState().createBrowser({ initialUrl: "https://example.com" });
  useBrowserStore.getState().updateBrowser(browserId, { title: "Agent working page" });
  useBrowserActivity.setState({
    byAgent: {
      [browserActivityKey("server", "agent")]: {
        browserId,
        command: "new_tab",
        updatedAt: Date.now(),
      },
    },
  });
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 400;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#f4f5f6";
  context.fillRect(0, 0, 800, 400);
  context.fillStyle = "#222";
  context.font = "32px sans-serif";
  context.fillText("The agent's browser tab", 40, 90);
  context.font = "20px sans-serif";
  context.fillText("Background work keeps your chat in place.", 40, 140);
  const dataBase64 = canvas.toDataURL("image/png").split(",")[1];
  let captures = 0;
  window.paseoDesktop = {
    browser: {
      executeAutomationCommand: async (request) => {
        captures++;
        return {
          requestId: request.requestId,
          ok: true,
          result: {
            command: "screenshot",
            browserId,
            mimeType: "image/png",
            dataBase64,
            width: 800,
            height: 400,
          },
        };
      },
    },
  };
  const workspaceKey = buildWorkspaceTabPersistenceKey({
    serverId: "server",
    workspaceId: "workspace",
  })!;
  container = document.createElement("div");
  container.style.cssText = "width:900px;background:#fff";
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(<AgentBrowserPreview serverId="server" workspaceId="workspace" agentId="agent" />),
  );
  await expect.element(page.getByRole("img", { name: "Agent browser tab preview" })).toBeVisible();
  expect(captures).toBe(1);
  expect(navigation.openTab).not.toHaveBeenCalled();
  await page.screenshot();
  await page.getByRole("button", { name: "Pause automation", exact: true }).click();
  expect(useBrowserActivity.getState().paused[browserId]).toBe(true);
  await page.getByRole("button", { name: "Resume automation", exact: true }).click();
  expect(useBrowserActivity.getState().paused[browserId]).toBe(false);
  await page.getByRole("button", { name: "Hide preview", exact: true }).click();
  await expect
    .element(page.getByRole("img", { name: "Agent browser tab preview" }))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "Open tab", exact: true }).click();
  expect(navigation.openTab).toHaveBeenCalledWith({
    workspaceKey,
    target: { kind: "browser", browserId },
    intent: "reveal",
  });
});
