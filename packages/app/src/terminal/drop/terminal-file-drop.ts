import { getClientFilePath } from "@/attachments/client-file-path";
import { getMimeTypeFromPath } from "@/attachments/file-types";
import { readDesktopFileBytes } from "@/attachments/selected-file";
import type { DroppedItem } from "@/components/file-drop/types";
import type { DesktopHostBridge } from "@/desktop/host";
import { readTerminalFile, type TerminalFile } from "../file-paste";

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).findLast((segment) => segment.length > 0) ?? path;
}

async function readDesktopFile(path: string): Promise<TerminalFile> {
  return {
    fileName: fileNameFromPath(path),
    mimeType: getMimeTypeFromPath(path),
    bytes: await readDesktopFileBytes(path),
  };
}

/** How a dropped item reaches the terminal. */
export type TerminalDropDelivery =
  | { kind: "path"; path: string }
  | { kind: "upload"; read: () => Promise<TerminalFile> };

/**
 * A dropped file pastes its own path only when the host is the machine the file
 * sits on. Anywhere else the host cannot read the client's disk, so the bytes are
 * uploaded and the host path is pasted instead. The file's type plays no part.
 */
export function routeTerminalDrop(
  item: DroppedItem,
  input: { hostIsLocal: boolean; bridge: DesktopHostBridge | null },
): TerminalDropDelivery {
  if (item.kind === "desktop-path") {
    return input.hostIsLocal
      ? { kind: "path", path: item.path }
      : { kind: "upload", read: () => readDesktopFile(item.path) };
  }
  const clientPath = input.hostIsLocal ? getClientFilePath(item.file, input.bridge) : null;
  return clientPath
    ? { kind: "path", path: clientPath }
    : { kind: "upload", read: () => readTerminalFile(item.file) };
}
