import { create } from "zustand";
import type {
  BrowserAutomationExecuteRequest,
  BrowserAutomationExecuteResponse,
} from "@getpaseo/protocol/browser-automation/rpc-schemas";

export interface BrowserActivity {
  browserId: string;
  command: string;
  updatedAt: number;
}
export const browserActivityKey = (serverId: string, agentId: string) =>
  JSON.stringify([serverId, agentId]);

export const useBrowserActivity = create<{
  byAgent: Record<string, BrowserActivity>;
  paused: Record<string, boolean>;
  setPaused: (browserId: string, paused: boolean) => void;
}>((set) => ({
  byAgent: {},
  paused: {},
  setPaused: (browserId, paused) =>
    set((state) => ({ paused: { ...state.paused, [browserId]: paused } })),
}));

export function recordBrowserActivity(
  serverId: string | undefined,
  request: BrowserAutomationExecuteRequest,
  payload: BrowserAutomationExecuteResponse["payload"],
) {
  if (!serverId || !request.agentId || !payload.ok || !("browserId" in payload.result)) return;
  const { browserId } = payload.result;
  useBrowserActivity.setState((state) => {
    const byAgent = { ...state.byAgent };
    const paused = { ...state.paused };
    if (request.command.command === "close_tab") {
      for (const [key, value] of Object.entries(byAgent))
        if (value.browserId === browserId) delete byAgent[key];
      delete paused[browserId];
    } else {
      byAgent[browserActivityKey(serverId, request.agentId!)] = {
        browserId,
        command: request.command.command,
        updatedAt: Date.now(),
      };
    }
    return { byAgent, paused };
  });
}
