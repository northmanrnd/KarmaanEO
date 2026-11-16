import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import {
  destinationProject,
  placementServerId,
  reorderedWorkspaceKeys,
  type PlacementDragSource,
  type PlacementDropTarget,
} from "./model";

export interface PlacementMovePorts {
  client: Pick<
    DaemonClient,
    "moveAgent" | "moveWorkspace" | "createWorkspace" | "archiveWorkspace"
  >;
  transferTab(source: Extract<PlacementDragSource, { kind: "tab" }>, workspaceId: string): void;
  order(projectViewKey: string, keys: string[]): void;
  validateAgent(agentId: string): void;
  workspaceCreated(
    workspace: NonNullable<Awaited<ReturnType<DaemonClient["createWorkspace"]>>["workspace"]>,
  ): void;
}

export function requireMovableTab(tab: WorkspaceTab) {
  if (tab.target.kind !== "agent" && tab.target.kind !== "draft" && tab.target.kind !== "file") {
    throw new Error(
      "Only agent, draft and file tabs can move between workspaces. This tab stays in its current workspace.",
    );
  }
}

export async function applyPlacementDrop(
  source: PlacementDragSource,
  target: PlacementDropTarget,
  ports: PlacementMovePorts,
): Promise<void> {
  const serverId = placementServerId(source);
  if (target.kind === "workspace" && target.workspace.serverId !== serverId) {
    throw new Error("Choose a workspace on the same host.");
  }
  if (source.kind === "workspace") {
    if (
      target.kind === "workspace" &&
      source.workspace.workspaceKey === target.workspace.workspaceKey
    )
      return;
    const project = target.project;
    if (!project) throw new Error("Open project grouping to reorder workspaces.");
    const host = destinationProject(source, target);
    if (source.workspace.projectViewKey !== project.viewKey) {
      await ports.client.moveWorkspace(source.workspace.workspaceId, host.projectId);
    }
    ports.order(
      project.viewKey,
      reorderedWorkspaceKeys(
        project.workspaces.map((entry) => entry.workspaceKey),
        source.workspace.workspaceKey,
        target.kind === "workspace" ? target.workspace.workspaceKey : undefined,
        target.kind === "workspace" && target.after,
      ),
    );
    return;
  }
  if (target.kind === "project")
    throw new Error("Drop the tab on a workspace or the project's New workspace button.");
  if (target.kind === "workspace" && source.workspaceId === target.workspace.workspaceId) return;
  requireMovableTab(source.tab);
  if (source.tab.target.kind === "agent") ports.validateAgent(source.tab.target.agentId);
  let workspaceId: string;
  let created = false;
  if (target.kind === "new-workspace") {
    const host = destinationProject(source, target);
    const result = await ports.client.createWorkspace({
      source: { kind: "directory", path: host.iconWorkingDir, projectId: host.projectId },
      idempotencyKey: `tab-drop-${crypto.randomUUID()}`,
    });
    if (!result.workspace) throw new Error("The host did not return the new workspace.");
    workspaceId = result.workspace.id;
    created = true;
    ports.workspaceCreated(result.workspace);
  } else workspaceId = target.workspace.workspaceId;
  try {
    if (source.tab.target.kind === "agent")
      await ports.client.moveAgent(source.tab.target.agentId, workspaceId);
  } catch (error) {
    if (created) {
      await cleanEmptyDestination(ports.client, workspaceId, error);
    }
    throw error;
  }
  ports.transferTab(source, workspaceId);
}

async function cleanEmptyDestination(
  client: PlacementMovePorts["client"],
  workspaceId: string,
  originalError: unknown,
) {
  try {
    const archived = await client.archiveWorkspace(workspaceId);
    if (archived?.error) throw new Error(archived.error);
  } catch (cleanupError) {
    throw new Error(
      `${originalError instanceof Error ? originalError.message : String(originalError)} The empty destination workspace could not be removed; it can be archived from the sidebar.`,
      { cause: cleanupError },
    );
  }
}
