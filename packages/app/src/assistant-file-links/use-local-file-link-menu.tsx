import { useCallback, type MouseEvent } from "react";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { useContextMenu } from "@/components/ui/context-menu";
import { FileActionsContextMenuContent } from "@/components/file-actions-menu";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { useToast } from "@/contexts/toast-context";
import { openDesktopTarget, useDesktopOpenTargets } from "@/workspace/desktop-open-targets";
import { useAssistantFileLinkEnvironment } from "./provider";
import { resolveWorkspaceFilePaths } from "@/workspace/file-open";
import { isAbsolutePath } from "@/utils/path";
import type { UseFileLinkResult } from "./use-file-link";

/** Only links on this desktop's own daemon may reveal a host path in the local file manager. */
export function useLocalFileLinkMenu(link: UseFileLinkResult) {
  const environment = useAssistantFileLinkEnvironment();
  const local = useIsLocalDaemon(environment.serverId ?? "");
  const { targets } = useDesktopOpenTargets({
    isLocalExecution: local,
    workspacePath: environment.workspaceRoot,
  });
  const fileManager = targets.find((entry) => entry.kind === "file-manager");
  const menu = useContextMenu();
  const toast = useToast();
  const { t } = useTranslation();
  const available = local && !!fileManager && link.canResolveFile;
  const onContextMenu = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!available) return;
      event.preventDefault();
      event.stopPropagation();
      link.onHoverIn();
      menu.setAnchorRect({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
      menu.setOpen(true);
    },
    [available, link, menu],
  );
  const resolvePath = useCallback(async () => {
    const target = await link.resolveTarget();
    const path =
      target &&
      (isAbsolutePath(target.path) || target.path.startsWith("~/")
        ? target.path
        : resolveWorkspaceFilePaths({
            path: target.path,
            workspaceRoot: environment.workspaceRoot ?? "",
          })?.absolutePath);
    if (!path) throw new Error(t("common.errors.noFileFound", { token: target?.raw ?? "" }));
    return path;
  }, [link, environment.workspaceRoot, t]);
  const reveal = useCallback(() => {
    if (!available || !fileManager) return;
    void resolvePath()
      .then((filePath) =>
        openDesktopTarget({
          editorId: fileManager.id,
          workspacePath: environment.workspaceRoot || filePath,
          filePath,
        }),
      )
      .catch((error) => toast.error(error instanceof Error ? error.message : String(error)));
  }, [available, fileManager, resolvePath, environment.workspaceRoot, toast]);
  const copyPath = useCallback(() => {
    void resolvePath()
      .then((path) => Clipboard.setStringAsync(path))
      .catch((error) => toast.error(error instanceof Error ? error.message : String(error)));
  }, [resolvePath, toast]);
  return {
    onContextMenu,
    content: available ? (
      <FileActionsContextMenuContent
        fileKind="file"
        onOpenFile={link.onPress}
        onCopyPath={copyPath}
        onReveal={reveal}
        revealTargetName={fileManager?.label}
        testIDPrefix="file-link"
      />
    ) : null,
  };
}
