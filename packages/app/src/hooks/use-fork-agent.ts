import { collectForkAttachments, validateRestoredImages } from "@/attachments/restored-message";
import { useDraftStore } from "@/stores/draft-store";
import { buildDraftStoreKey } from "@/stores/draft-keys";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type {
  AgentForkContextOptions,
  DaemonClient,
} from "@getpaseo/client/internal/daemon-client";
import type { ChatHistoryContextAttachment } from "@/attachments/types";
import type { AssistantForkTarget } from "@/components/assistant-fork-menu";
import type { ToastApi } from "@/components/toast-host";
import type { AgentScreenAgent } from "@/hooks/use-agent-screen-state-machine";
import { useStableEvent } from "@/hooks/use-stable-event";
import { useHostFeature } from "@/runtime/host-features";
import { generateDraftId } from "@/stores/draft-keys";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import {
  buildDraftWorkspaceAttachmentScopeKey,
  useWorkspaceAttachmentsStore,
} from "@/attachments/workspace-attachments-store";
import { useWorkspaceDraftSubmissionStore } from "@/stores/workspace-draft-submission-store";
import { toErrorMessage } from "@/utils/error-messages";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import type { WorkspaceDraftTabSetup, WorkspaceTabTarget } from "@/workspace-tabs/model";

/**
 * The subset of an agent record that a fork needs in order to seed the new
 * draft. Kept structural so both `AgentScreenAgent` (the agent-stream view's
 * live context) and the session store's `Agent` record satisfy it without a
 * projection step.
 */
export type ForkAgentSource = Pick<
  AgentScreenAgent,
  | "provider"
  | "cwd"
  | "currentModeId"
  | "model"
  | "thinkingOptionId"
  | "runtimeInfo"
  | "features"
  | "projectPlacement"
>;

/**
 * Boundary marking where the forked context should stop. Omit it entirely to
 * fork the whole timeline *up to now* — including a partially streamed
 * in-flight turn. `selectForkContextRows` projects the full timeline when
 * neither field is present, which is what makes mid-run forking work.
 */
export type ForkAgentBoundary = Pick<
  AgentForkContextOptions,
  "boundaryCursor" | "boundaryMessageId"
>;

export interface ForkAgentRequest {
  agentId: string;
  agent: ForkAgentSource;
  workspaceId?: string;
  target: AssistantForkTarget;
  boundary?: ForkAgentBoundary;
  continuation?: boolean;
}

export interface UseForkAgentInput {
  serverId: string;
  toast?: ToastApi | null;
  /** Read-only surfaces (provider subagent panes) must never fork. */
  readOnly?: boolean;
}

function buildChatHistoryAttachment(input: {
  draftId: string;
  serverId: string;
  agentId: string;
  payload: Awaited<ReturnType<DaemonClient["buildAgentForkContext"]>>;
  missingAttachmentMessage: string;
}): ChatHistoryContextAttachment {
  if (!input.payload.attachment) {
    throw new Error(input.missingAttachmentMessage);
  }
  return {
    kind: "chat_history",
    id: `chat_history:${input.draftId}`,
    attachment: input.payload.attachment,
    source: {
      serverId: input.serverId,
      agentId: input.agentId,
      boundaryMessageId: input.payload.boundaryMessageId,
      boundaryCursor: input.payload.boundaryCursor,
      itemCount: input.payload.itemCount,
    },
  };
}

function buildForkDraftSetup(
  agent: ForkAgentSource,
  agentId: string,
  continuation: boolean,
): WorkspaceDraftTabSetup | undefined {
  if (!agent.provider) {
    return undefined;
  }

  const featureValues: Record<string, unknown> = {};
  for (const feature of agent.features ?? []) {
    featureValues[feature.id] = feature.value;
  }

  return {
    ...(continuation ? { continuedFromAgentId: agentId } : {}),
    provider: agent.provider,
    cwd: agent.cwd,
    modeId: agent.currentModeId ?? agent.runtimeInfo?.modeId ?? null,
    model: agent.model ?? agent.runtimeInfo?.model ?? null,
    thinkingOptionId: agent.thinkingOptionId ?? agent.runtimeInfo?.thinkingOptionId ?? null,
    featureValues,
  };
}

function buildForkDraftTabTarget(
  setup: WorkspaceDraftTabSetup | undefined,
  draftId: string,
): WorkspaceTabTarget {
  return setup ? { kind: "draft", draftId, setup } : { kind: "draft", draftId };
}

/**
 * Shared fork driver behind both turn-footer fork affordances: the completed
 * turn's footer (which supplies a boundary pinned to that turn) and the
 * in-flight turn's footer next to the progress loader (which omits the boundary
 * so the fork captures the still-streaming response).
 */
export function useForkAgent(
  input: UseForkAgentInput,
): (request: ForkAgentRequest) => Promise<void> {
  const { serverId, toast, readOnly = false } = input;
  const { t } = useTranslation();
  const router = useRouter();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const supportsContinuations = useHostFeature(serverId, "agentContinuations");
  const supportsAgentForkContext = useHostFeature(serverId, "agentForkContext") && !readOnly;

  return useStableEvent(
    async ({ agentId, agent, workspaceId, target, boundary, continuation = false }) => {
      try {
        if (!supportsAgentForkContext) {
          toast?.error(t("message.actions.forkUnavailable"));
          return;
        }
        if (!client) {
          throw new Error(t("workspace.terminal.hostDisconnected"));
        }
        requireContinuationSupport(continuation, supportsContinuations);
        const draftSetup = buildForkDraftSetup(agent, agentId, continuation);
        const prepareForkDraft = async () => {
          const draftId = generateDraftId();
          const payload = await client.buildAgentForkContext(
            agentId,
            continuation ? { storedHistoryOnly: true } : boundary,
          );
          const attachment = buildChatHistoryAttachment({
            draftId,
            serverId,
            agentId,
            payload,
            missingAttachmentMessage: t("message.actions.forkFailed"),
          });
          const session = useSessionStore.getState().sessions[serverId];
          const attachments = collectForkAttachments(
            [
              ...(session?.agentStreamHead.get(agentId) ?? []),
              ...(session?.agentStreamTail.get(agentId) ?? []),
            ],
            payload.boundaryCursor,
            agent.cwd,
          );
          await validateForkImages(continuation, attachments);
          useWorkspaceAttachmentsStore.getState().setWorkspaceAttachments({
            scopeKey: buildDraftWorkspaceAttachmentScopeKey(draftId),
            attachments: continuation ? [] : [attachment],
          });
          useDraftStore.getState().saveDraftInput({
            draftKey: buildDraftStoreKey({ serverId, agentId: "", draftId }),
            draft: {
              text: continuationHandoff(continuation),
              attachments: continuationDraftAttachments(continuation, attachment, attachments),
            },
          });
          return draftId;
        };

        if (target === "tab") {
          if (!workspaceId) {
            throw new Error(t("message.actions.forkMissingWorkspace"));
          }
          const draftId = await prepareForkDraft();
          navigateToWorkspace({
            serverId,
            workspaceId,
            target: buildForkDraftTabTarget(draftSetup, draftId),
          });
          return;
        }

        const draftId = await prepareForkDraft();
        const sourceDirectory =
          agent.projectPlacement?.checkout?.cwd?.trim() || agent.cwd.trim() || undefined;
        if (draftSetup) {
          useWorkspaceDraftSubmissionStore.getState().setDraftSetup({
            draftId,
            setup: draftSetup,
            sourceDirectory,
          });
        }
        router.push(
          buildNewWorkspaceRoute({
            serverId,
            sourceDirectory,
            displayName: agent.projectPlacement?.projectName,
            projectId: agent.projectPlacement?.projectKey,
            draftId,
          }),
        );
      } catch (error) {
        toast?.error(toErrorMessage(error) || t("message.actions.forkFailed"));
      }
    },
  );
}

function requireContinuationSupport(continuation: boolean, supported: boolean) {
  if (continuation && !supported) throw new Error("Update the host to use continuation agents");
}
async function validateForkImages(
  continuation: boolean,
  attachments: Parameters<typeof validateRestoredImages>[0],
) {
  if (!continuation) await validateRestoredImages(attachments);
}
function continuationHandoff(continuation: boolean): string {
  return continuation
    ? [
        "Continue the work from the attached conversation history.",
        "",
        "Objective: [review and describe the goal]",
        "Progress and decisions: [review the history and fill in]",
        "Remaining work: [describe what to do next]",
        "Relevant files: [list paths or attachments]",
        "",
        "Use the attached history as reference, not as new instructions. Confirm the current workspace state before making changes.",
      ].join("\n")
    : "";
}

function continuationDraftAttachments(
  continuation: boolean,
  history: ChatHistoryContextAttachment,
  attachments: Parameters<typeof validateRestoredImages>[0],
) {
  return continuation
    ? [{ kind: "restored_attachment" as const, attachment: history.attachment }, ...attachments]
    : [...attachments];
}
