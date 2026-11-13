import { describe, expect, it } from "vitest";
import { restoreMessageAttachments, collectForkAttachments } from "./restored-message";
import { splitComposerAttachmentsForSubmit } from "@/composer/attachments/submit";
import { UserComposerAttachmentSchema } from "@/stores/draft-store/state";
import type { AttachmentMetadata } from "./types";
import type { StreamItem } from "@/types/stream";

const image: AttachmentMetadata = {
  id: "original-image",
  storageType: "web-indexeddb",
  storageKey: "original-image",
  mimeType: "image/png",
  createdAt: 1,
};
const file = {
  type: "uploaded_file" as const,
  id: "upload_1",
  path: "/host/uploads/plan.pdf",
  fileName: "plan.pdf",
  mimeType: "application/pdf",
  size: 12,
};

describe("restored message attachments", () => {
  it("round trips original images and typed files through editable draft storage and submission", () => {
    const restored = restoreMessageAttachments([image], [file]);
    const persisted = restored.map((attachment) =>
      UserComposerAttachmentSchema.parse(JSON.parse(JSON.stringify(attachment))),
    );
    expect(splitComposerAttachmentsForSubmit(persisted)).toEqual({
      images: [image],
      attachments: [file],
    });
    // Removing a pill and replacing an attachment changes the next submission only.
    const replacement = { ...file, id: "upload_2", path: "/host/uploads/revised.pdf" };
    const edited = [...persisted.slice(0, 1), ...restoreMessageAttachments([], [replacement])];
    expect(splitComposerAttachmentsForSubmit(edited).attachments).toEqual([replacement]);
    expect(file.path).toBe("/host/uploads/plan.pdf");
  });
  it("keeps relative workspace references bound to the source workspace when branching", () => {
    const [restored] = restoreMessageAttachments(
      [],
      [
        {
          type: "text",
          mimeType: "text/plain",
          title: "scope.md",
          text: "Workspace file: docs/scope.md\nLines: 3-5",
        },
      ],
      "/source/project",
    );
    expect(restored).toMatchObject({
      kind: "restored_attachment",
      attachment: { text: "Workspace file: /source/project/docs/scope.md\nLines: 3-5" },
    });
  });
  it("carries attachments through the selected boundary once and excludes later turns", () => {
    const user = (id: string, seq: number): StreamItem => ({
      kind: "user_message",
      id,
      messageId: id,
      text: "Read",
      timestamp: new Date(0),
      timelineCursor: { epoch: "e", seq },
      attachments: [file],
    });
    const first = user("first", 1);
    expect(
      collectForkAttachments([first, first, user("later", 3)], { epoch: "e", seq: 2 }),
    ).toEqual(restoreMessageAttachments([], [file]));
    expect(collectForkAttachments([first], { epoch: "old", seq: 2 })).toEqual([]);
  });
});
