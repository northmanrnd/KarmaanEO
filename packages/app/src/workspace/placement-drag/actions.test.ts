import { describe, expect, it, vi } from "vitest";
import type {
  SidebarProjectEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/sidebar-workspaces-view-model";
import { applyPlacementDrop, type PlacementMovePorts } from "./actions";
import { reorderedWorkspaceKeys, type PlacementDragSource } from "./model";

function workspace(
  id: string,
  projectViewKey = "p1",
  serverId = "host",
): SidebarWorkspacePlacement {
  return {
    workspaceKey: `${serverId}:${id}`,
    serverId,
    workspaceId: id,
    projectViewKey,
    projectName: projectViewKey,
    projectKind: "directory",
    workspaceKind: "directory",
    name: id,
  };
}
function project(id: string): SidebarProjectEntry {
  return {
    viewKey: id,
    projectName: id,
    projectKind: "directory",
    iconWorkingDir: `/repo/${id}`,
    hosts: [
      {
        serverId: "host",
        projectId: id,
        iconWorkingDir: `/repo/${id}`,
        worktreeSupport: "unsupported",
      },
    ],
    workspaces: [workspace(`${id}-a`, id), workspace(`${id}-b`, id)],
  };
}
function ports() {
  return {
    client: {
      moveAgent: vi.fn(async () => undefined),
      moveWorkspace: vi.fn(async () => undefined),
      createWorkspace: vi.fn<PlacementMovePorts["client"]["createWorkspace"]>(),
      archiveWorkspace: vi.fn<PlacementMovePorts["client"]["archiveWorkspace"]>(),
    },
    transferTab: vi.fn(),
    order: vi.fn(),
    validateAgent: vi.fn(),
    workspaceCreated: vi.fn(),
  } satisfies PlacementMovePorts;
}
const source: PlacementDragSource = {
  kind: "tab",
  serverId: "host",
  workspaceId: "original",
  tab: { tabId: "tab-1", target: { kind: "agent", agentId: "agent-1" }, createdAt: 1 },
};

describe("placement drops", () => {
  it("moves authoritative agent ownership before transferring its existing tab", async () => {
    const p = ports();
    const destination = workspace("destination", "p2");
    await applyPlacementDrop(
      source,
      { kind: "workspace", workspace: destination, project: project("p2"), after: false },
      p,
    );
    expect(p.client.moveAgent).toHaveBeenCalledWith("agent-1", "destination");
    expect(p.transferTab).toHaveBeenCalledWith(source, "destination");
    expect(p.client.moveAgent.mock.invocationCallOrder[0]).toBeLessThan(
      p.transferTab.mock.invocationCallOrder[0]!,
    );
  });
  it("keeps the original tab when the daemon rejects a move", async () => {
    const p = ports();
    p.client.moveAgent.mockRejectedValueOnce(new Error("running"));
    await expect(
      applyPlacementDrop(
        source,
        { kind: "workspace", workspace: workspace("next"), project: project("p1"), after: false },
        p,
      ),
    ).rejects.toThrow("running");
    expect(p.transferTab).not.toHaveBeenCalled();
  });
  it("creates an empty workspace in the selected project without creating a replacement agent", async () => {
    const p = ports();
    p.client.createWorkspace.mockResolvedValueOnce({ workspace: { id: "created" } } as Awaited<
      ReturnType<PlacementMovePorts["client"]["createWorkspace"]>
    >);
    await applyPlacementDrop(source, { kind: "new-workspace", project: project("p2") }, p);
    expect(p.client.createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ source: { kind: "directory", path: "/repo/p2", projectId: "p2" } }),
    );
    expect(p.client.createWorkspace.mock.calls[0]![0].agent).toBeUndefined();
    expect(p.client.moveAgent).toHaveBeenCalledWith("agent-1", "created");
  });
  it("cleans up an empty new workspace if the move fails", async () => {
    const p = ports();
    p.client.createWorkspace.mockResolvedValueOnce({ workspace: { id: "created" } } as Awaited<
      ReturnType<PlacementMovePorts["client"]["createWorkspace"]>
    >);
    p.client.moveAgent.mockRejectedValueOnce(new Error("family linked"));
    await expect(
      applyPlacementDrop(source, { kind: "new-workspace", project: project("p2") }, p),
    ).rejects.toThrow("family linked");
    expect(p.client.archiveWorkspace).toHaveBeenCalledWith("created");
    expect(p.transferTab).not.toHaveBeenCalled();
  });
  it("checks local move barriers before creating a destination", async () => {
    const p = ports();
    p.validateAgent.mockImplementation(() => {
      throw new Error("running");
    });
    await expect(
      applyPlacementDrop(source, { kind: "new-workspace", project: project("p1") }, p),
    ).rejects.toThrow("running");
    expect(p.client.createWorkspace).not.toHaveBeenCalled();
  });
  it("reorders within a project without changing server ownership", async () => {
    const p = ports();
    const destination = project("p1");
    await applyPlacementDrop(
      { kind: "workspace", workspace: destination.workspaces[0]! },
      {
        kind: "workspace",
        workspace: destination.workspaces[1]!,
        project: destination,
        after: true,
      },
      p,
    );
    expect(p.order).toHaveBeenCalledWith("p1", ["host:p1-b", "host:p1-a"]);
    expect(p.client.moveWorkspace).not.toHaveBeenCalled();
  });
  it("moves a workspace into another project before saving its destination order", async () => {
    const p = ports();
    await applyPlacementDrop(
      { kind: "workspace", workspace: workspace("original") },
      { kind: "project", project: project("p2") },
      p,
    );
    expect(p.client.moveWorkspace).toHaveBeenCalledWith("original", "p2");
    expect(p.order).toHaveBeenCalledWith("p2", ["host:p2-a", "host:p2-b", "host:original"]);
  });
  it("does not persist a misleading order when a workspace move fails", async () => {
    const p = ports();
    p.client.moveWorkspace.mockRejectedValueOnce(new Error("worktree backing migration"));
    await expect(
      applyPlacementDrop(
        { kind: "workspace", workspace: workspace("original") },
        { kind: "project", project: project("p2") },
        p,
      ),
    ).rejects.toThrow("backing migration");
    expect(p.order).not.toHaveBeenCalled();
  });
  it("rejects host changes before any mutation", async () => {
    const p = ports();
    await expect(
      applyPlacementDrop(
        source,
        {
          kind: "workspace",
          workspace: workspace("next", "p1", "other"),
          project: project("p1"),
          after: false,
        },
        p,
      ),
    ).rejects.toThrow("same host");
    expect(p.client.moveAgent).not.toHaveBeenCalled();
  });
  it("retains hidden keys and inserts before or after the drop target", () => {
    expect(reorderedWorkspaceKeys(["a", "hidden", "b"], "a", "b", false)).toEqual([
      "hidden",
      "a",
      "b",
    ]);
    expect(reorderedWorkspaceKeys(["a", "hidden", "b"], "a", "b", true)).toEqual([
      "hidden",
      "b",
      "a",
    ]);
  });
  it("moves draft content without creating an agent", async () => {
    const p = ports();
    const draft: PlacementDragSource = {
      ...source,
      tab: { ...source.tab, target: { kind: "draft", draftId: "draft-1" } },
    };
    await applyPlacementDrop(
      draft,
      { kind: "workspace", workspace: workspace("next"), project: project("p1"), after: false },
      p,
    );
    expect(p.client.moveAgent).not.toHaveBeenCalled();
    expect(p.transferTab).toHaveBeenCalledWith(draft, "next");
  });
  it("rejects workspace-bound tabs before creating a destination", async () => {
    const p = ports();
    const terminal: PlacementDragSource = {
      ...source,
      tab: { ...source.tab, target: { kind: "terminal", terminalId: "terminal-1" } },
    };
    await expect(
      applyPlacementDrop(terminal, { kind: "new-workspace", project: project("p1") }, p),
    ).rejects.toThrow("Only agent, draft and file");
    expect(p.client.createWorkspace).not.toHaveBeenCalled();
  });
  it("reports an empty destination left behind if cleanup is rejected", async () => {
    const p = ports();
    p.client.createWorkspace.mockResolvedValueOnce({ workspace: { id: "created" } } as Awaited<
      ReturnType<PlacementMovePorts["client"]["createWorkspace"]>
    >);
    p.client.moveAgent.mockRejectedValueOnce(new Error("family linked"));
    p.client.archiveWorkspace.mockResolvedValueOnce({ error: "archive blocked" } as Awaited<
      ReturnType<PlacementMovePorts["client"]["archiveWorkspace"]>
    >);
    await expect(
      applyPlacementDrop(source, { kind: "new-workspace", project: project("p1") }, p),
    ).rejects.toThrow("empty destination workspace could not be removed");
    expect(p.transferTab).not.toHaveBeenCalled();
  });
});
