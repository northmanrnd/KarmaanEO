import { dispatchPreferredLink } from "./link-destination";
import { isElectronRuntime } from "@/desktop/host";
import { loadAppSettingsFromStorage } from "@/hooks/use-settings";
import { useSessionStore } from "@/stores/session-store";
import { createWorkspaceBrowser } from "@/desktop/browser/store";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { isHttpUrl } from "./http-url";
import { openExternalUrl } from "./open-external-url";

/** Ordinary document/chat links follow the preference; explicitly external actions keep theirs. */
export async function openPreferredLink(
  url: string,
  context: { serverId?: string; workspaceRoot?: string },
) {
  if (!isHttpUrl(url)) return;
  const settings = await loadAppSettingsFromStorage();
  if (
    settings.linkBrowser === "in-app" &&
    isElectronRuntime() &&
    context.serverId &&
    context.workspaceRoot
  ) {
    const workspace = [
      ...(useSessionStore.getState().sessions[context.serverId]?.workspaces.values() ?? []),
    ]
      .filter(
        (entry) =>
          context.workspaceRoot === entry.workspaceDirectory ||
          context.workspaceRoot?.startsWith(`${entry.workspaceDirectory}/`),
      )
      .sort((a, b) => b.workspaceDirectory.length - a.workspaceDirectory.length)[0];
    if (workspace) {
      const serverId = context.serverId;
      await dispatchPreferredLink(url, settings.linkBrowser, {
        openInApp: (initialUrl) => {
          const { browserId } = createWorkspaceBrowser({ initialUrl });
          navigateToWorkspace({
            serverId,
            workspaceId: workspace.id,
            target: { kind: "browser", browserId },
          });
        },
        openExternal: openExternalUrl,
      });
      return;
    }
  }
  await dispatchPreferredLink(url, settings.linkBrowser, { openExternal: openExternalUrl });
}
