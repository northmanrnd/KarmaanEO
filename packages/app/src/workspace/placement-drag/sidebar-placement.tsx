import type { ReactNode } from "react";
import type {
  SidebarProjectEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/sidebar-workspaces-view-model";
export function PlacementProject({
  children,
}: {
  project: SidebarProjectEntry;
  children: ReactNode;
}) {
  return children;
}
export function PlacementProjectHeader({ children }: { children: ReactNode }) {
  return children;
}
export function PlacementNewWorkspace({ children }: { children: ReactNode }) {
  return children;
}
export function PlacementWorkspace({
  children,
}: {
  workspace: SidebarWorkspacePlacement;
  disabled?: boolean;
  children: ReactNode;
}) {
  return children;
}

export function usePlacementWorkspaceDragging() {
  return false;
}

export function usePlacementWorkspaceManaged() {
  return false;
}
