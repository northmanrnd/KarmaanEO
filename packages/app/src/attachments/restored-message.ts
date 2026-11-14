import { buildAbsoluteExplorerPath } from "@/utils/explorer-paths";
import { getAttachmentStore } from "./store";
import type { AgentAttachment } from "@getpaseo/protocol/messages";
import type { AttachmentMetadata, UserComposerAttachment } from "./types";
import type { StreamItem } from "@/types/stream";

/** Retain exact submitted payloads; provider transcripts cannot reconstruct every resource. */
export function restoreMessageAttachments(
  images: readonly AttachmentMetadata[] = [],
  attachments: readonly AgentAttachment[] = [],
  sourceRoot?: string,
): UserComposerAttachment[] {
  return [
    ...images.map((metadata): UserComposerAttachment => ({ kind: "image", metadata })),
    ...attachments.map((attachment): UserComposerAttachment => {
      if (
        sourceRoot &&
        attachment.type === "text" &&
        attachment.text.startsWith("Workspace file: ")
      ) {
        const [first, ...rest] = attachment.text.split("\n");
        const absolute = buildAbsoluteExplorerPath({
          workspaceRoot: sourceRoot,
          entryPath: first.slice("Workspace file: ".length),
        });
        return {
          kind: "restored_attachment",
          attachment: { ...attachment, text: [`Workspace file: ${absolute}`, ...rest].join("\n") },
        };
      }
      return { kind: "restored_attachment", attachment };
    }),
  ];
}

export function collectForkAttachments(
  items: readonly StreamItem[],
  boundary?: { epoch: string; seq: number } | null,
  sourceRoot?: string,
): UserComposerAttachment[] {
  const seen = new Set<string>();
  const attachments: UserComposerAttachment[] = [];
  for (const item of items) {
    if (item.kind !== "user_message") continue;
    if (
      boundary &&
      (!item.timelineCursor ||
        item.timelineCursor.epoch !== boundary.epoch ||
        item.timelineCursor.seq > boundary.seq)
    )
      continue;
    const key = item.clientMessageId ?? item.messageId ?? item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    attachments.push(...restoreMessageAttachments(item.images, item.attachments, sourceRoot));
  }
  return attachments;
}

/** Check before mutating provider history; missing image data must never be silently omitted. */
export async function validateRestoredImages(attachments: readonly UserComposerAttachment[]) {
  const images = attachments.filter((attachment) => attachment.kind === "image");
  if (!images.length) return;
  const store = await getAttachmentStore();
  for (const image of images) {
    try {
      await store.encodeBase64({ attachment: image.metadata });
    } catch {
      throw new Error(
        `Image "${image.metadata.fileName || image.metadata.id}" is no longer available. Reattach it before continuing.`,
      );
    }
  }
}
