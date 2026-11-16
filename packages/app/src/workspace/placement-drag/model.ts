import type {
  SidebarProjectEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/sidebar-workspaces-view-model";
import type { WorkspaceTab } from "@/workspace-tabs/model";

export type PlacementDragSource =
  | { kind: "tab"; serverId: string; workspaceId: string; tab: WorkspaceTab }
  | { kind: "workspace"; workspace: SidebarWorkspacePlacement };
export type PlacementDropTarget =
  | {
      kind: "workspace";
      workspace: SidebarWorkspacePlacement;
      project: SidebarProjectEntry | null;
      after: boolean;
    }
  | { kind: "project"; project: SidebarProjectEntry }
  | { kind: "new-workspace"; project: SidebarProjectEntry };

export function placementServerId(source: PlacementDragSource): string {
  return source.kind === "tab" ? source.serverId : source.workspace.serverId;
}

export function destinationProject(source: PlacementDragSource, target: PlacementDropTarget) {
  const project = target.project;
  const host = project?.hosts.find((entry) => entry.serverId === placementServerId(source));
  if (!host)
    throw new Error(
      "Choose a destination on the same host. Moving sessions between hosts is not supported.",
    );
  return host;
}

export function reorderedWorkspaceKeys(
  keys: readonly string[],
  sourceKey: string,
  targetKey?: string,
  after = false,
): string[] {
  if (sourceKey === targetKey) return [...keys];
  const result = keys.filter((key) => key !== sourceKey);
  const index = targetKey ? result.indexOf(targetKey) : -1;
  result.splice(index < 0 ? result.length : index + Number(after), 0, sourceKey);
  return result;
}
