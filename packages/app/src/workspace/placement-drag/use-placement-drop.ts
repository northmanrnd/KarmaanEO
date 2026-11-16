import { useCallback, useRef } from "react";
import { useToast } from "@/contexts/toast-context";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { normalizeWorkspaceDescriptor, useSessionStore } from "@/stores/session-store";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { getContinuedFromAgentId } from "@getpaseo/protocol/agent-labels";
import { applyPlacementDrop } from "./actions";
import { placementServerId, type PlacementDragSource, type PlacementDropTarget } from "./model";

export function usePlacementDrop() {
  const toast = useToast();
  const busy = useRef(false);
  return useCallback(
    async (source: PlacementDragSource, target: PlacementDropTarget) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const serverId = placementServerId(source);
        const runtime = getHostRuntimeStore();
        const client = runtime.getClient(serverId);
        if (!client) throw new Error("Connect to the host before moving tabs or workspaces.");
        await applyPlacementDrop(source, target, {
          client,
          validateAgent(agentId) {
            const session = useSessionStore.getState().sessions[serverId];
            if (session?.serverInfo?.features?.placementMoves !== true)
              throw new Error("Update the host before moving agents between workspaces.");
            const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
            if (agent?.turn.phase === "open")
              throw new Error("Wait for the current turn to finish before moving this agent.");
            if (agent?.parentAgentId)
              throw new Error("Detach this agent from its parent before moving it.");
            const relatives = [
              ...(session?.agents.values() ?? []),
              ...(session?.agentDetails.values() ?? []),
            ];
            if (relatives.some((entry) => entry.parentAgentId === agentId))
              throw new Error("Detach this agent's children before moving it.");
            if (relatives.some((entry) => getContinuedFromAgentId(entry.labels) === agentId))
              throw new Error("Remove continuation links before moving this agent.");
            if (getContinuedFromAgentId(agent?.labels))
              throw new Error("Remove continuation links before moving this agent.");
          },
          workspaceCreated(workspace) {
            if (workspace)
              runtime.acceptWorkspaceSnapshots(serverId, [normalizeWorkspaceDescriptor(workspace)]);
          },
          order(projectViewKey, keys) {
            const store = useSidebarOrderStore.getState();
            const remainder = store
              .getWorkspaceOrder(projectViewKey)
              .filter((key) => !keys.includes(key));
            store.setWorkspaceOrder(projectViewKey, [...keys, ...remainder]);
            useSidebarViewStore.getState().setWorkspaceSort("manual");
          },
          transferTab(tabSource, workspaceId) {
            const store = useWorkspaceLayoutStore.getState();
            const key = `${serverId}:${workspaceId}`;
            const id = store.openTab({
              workspaceKey: key,
              target: tabSource.tab.target,
              intent: "reveal",
            });
            if (!id) throw new Error("Could not open the moved tab in the destination workspace.");
            if (tabSource.tab.state !== undefined) store.setTabState(key, id, tabSource.tab.state);
            store.closeTab(`${serverId}:${tabSource.workspaceId}`, tabSource.tab.tabId);
            navigateToWorkspace({ serverId, workspaceId, target: tabSource.tab.target });
          },
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        busy.current = false;
      }
    },
    [toast],
  );
}
