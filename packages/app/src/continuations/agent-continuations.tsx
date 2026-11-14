import { useRetainedPanelActive } from "@/components/retained-panel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import {
  CONTINUED_FROM_AGENT_ID_LABEL,
  getContinuedFromAgentId,
} from "@getpaseo/protocol/agent-labels";
import type { AgentSnapshotPayload } from "@getpaseo/protocol/messages";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { useForkAgent, type ForkAgentSource } from "@/hooks/use-fork-agent";
import type { ToastApi } from "@/components/toast-host";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";

export function AgentContinuations({
  serverId,
  workspaceId,
  agentId,
  agent,
  toast,
}: {
  serverId: string;
  workspaceId: string;
  agentId: string;
  agent: ForkAgentSource;
  toast: ToastApi;
}) {
  const { t } = useTranslation();
  const active = useRetainedPanelActive();
  const supported = useHostFeature(serverId, "agentContinuations");
  const client = useHostRuntimeClient(serverId);
  const agents = useSessionStore((state) => state.sessions[serverId]?.agents);
  const details = useSessionStore((state) => state.sessions[serverId]?.agentDetails);
  const [stored, setStored] = useState<AgentSnapshotPayload[]>([]);
  const [picker, setPicker] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fork = useForkAgent({ serverId, toast });
  const refresh = useCallback(async () => {
    if (!client || !supported) return;
    const all: AgentSnapshotPayload[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.fetchAgents({
        filter: { includeArchived: true },
        page: { limit: 200, cursor },
      });
      all.push(
        ...page.entries
          .map((entry) => entry.agent)
          .filter((entry) => entry.workspaceId === workspaceId),
      );
      cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
    } while (cursor);
    setStored(all);
  }, [client, supported, workspaceId]);
  useEffect(() => {
    if (active) void refresh().catch((err) => setError(String(err)));
  }, [refresh, active]);
  const records = useMemo(() => {
    const result = new Map(
      stored.map((record) => [
        record.id,
        {
          id: record.id,
          title: record.title,
          labels: record.labels,
          workspaceId: record.workspaceId,
        },
      ]),
    );
    for (const record of [...(details?.values() ?? []), ...(agents?.values() ?? [])]) {
      result.set(record.id, {
        id: record.id,
        title: record.title,
        labels: record.labels,
        workspaceId: record.workspaceId,
      });
    }
    return result;
  }, [stored, agents, details]);
  const sourceId = getContinuedFromAgentId(records.get(agentId)?.labels);
  const successors = [...records.values()].filter(
    (record) => getContinuedFromAgentId(record.labels) === agentId,
  );
  const candidates = [...records.values()].filter(
    (record) => record.id !== agentId && record.workspaceId === workspaceId,
  );
  const open = useCallback(
    (id: string) => {
      navigateToWorkspace({ serverId, workspaceId, target: { kind: "agent", agentId: id } });
    },
    [serverId, workspaceId],
  );
  const link = useCallback(
    async (source: string) => {
      if (!client || pending) return;
      setPending(true);
      setError(null);
      try {
        await client.updateAgent(agentId, { labels: { [CONTINUED_FROM_AGENT_ID_LABEL]: source } });
        await refresh();
        setPicker(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPending(false);
      }
    },
    [client, pending, agentId, refresh],
  );
  const startContinuation = useCallback(async () => {
    setPending(true);
    try {
      await fork({ agentId, agent, workspaceId, target: "tab", continuation: true });
    } finally {
      setPending(false);
    }
  }, [fork, agentId, agent, workspaceId]);
  const openPicker = useCallback(() => {
    setError(null);
    setPicker(true);
    void refresh().catch((err) => setError(String(err)));
  }, [refresh]);
  const closePicker = useCallback(() => {
    if (!pending) setPicker(false);
  }, [pending]);
  const unlink = useCallback(() => {
    void link("");
  }, [link]);
  const selectSource = useCallback(
    (id: string) => {
      void link(id);
    },
    [link],
  );
  const header = useMemo(() => ({ title: t("continuations.mark") }), [t]);
  if (!supported) return null;
  return (
    <View style={styles.container} testID="agent-continuations">
      <View style={styles.row}>
        <Button
          size="sm"
          variant="ghost"
          testID="agent-continue"
          disabled={pending}
          onPress={startContinuation}
        >
          {t("continuations.continue")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          testID="agent-continuation-link"
          disabled={pending}
          onPress={openPicker}
        >
          {t("continuations.mark")}
        </Button>
      </View>
      {sourceId ? (
        <View style={styles.row}>
          <ContinuationLinkButton
            id={sourceId}
            testID="agent-continuation-source"
            onSelect={open}
            label={t("continuations.from", {
              title: records.get(sourceId)?.title || sourceId.slice(0, 8),
            })}
          />
          <Button
            size="sm"
            variant="ghost"
            testID="agent-continuation-unlink"
            disabled={pending}
            onPress={unlink}
          >
            {t("continuations.unlink")}
          </Button>
        </View>
      ) : null}
      {successors.map((next) => (
        <ContinuationLinkButton
          key={next.id}
          id={next.id}
          testID={`agent-continuation-next-${next.id}`}
          onSelect={open}
          label={t("continuations.to", { title: next.title || next.id.slice(0, 8) })}
        />
      ))}
      {error && !picker ? (
        <Text style={styles.error} testID="agent-continuation-error">
          {error}
        </Text>
      ) : null}
      <AdaptiveModalSheet
        visible={picker}
        onClose={closePicker}
        header={header}
        testID="agent-continuation-picker"
      >
        <View style={styles.body}>
          <Text style={styles.text}>{t("continuations.chooseSource")}</Text>
          {error ? (
            <Text style={styles.error} testID="agent-continuation-picker-error">
              {error}
            </Text>
          ) : null}
          <ScrollView style={styles.list}>
            {candidates.map((candidate) => (
              <ContinuationLinkButton
                key={candidate.id}
                id={candidate.id}
                testID={`agent-continuation-option-${candidate.id}`}
                disabled={pending}
                onSelect={selectSource}
                label={candidate.title || candidate.id.slice(0, 8)}
              />
            ))}
            {!candidates.length ? (
              <Text style={styles.text}>{t("continuations.noCandidates")}</Text>
            ) : null}
          </ScrollView>
          <Button size="sm" variant="secondary" disabled={pending} onPress={closePicker}>
            {t("common.actions.cancel")}
          </Button>
        </View>
      </AdaptiveModalSheet>
    </View>
  );
}

function ContinuationLinkButton({
  id,
  label,
  onSelect,
  testID,
  disabled,
}: {
  id: string;
  label: string;
  onSelect: (id: string) => void;
  testID: string;
  disabled?: boolean;
}) {
  const press = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <Button size="sm" variant="ghost" onPress={press} testID={testID} disabled={disabled}>
      {label}
    </Button>
  );
}

export function ContinuationDraftNotice({ sourceId }: { sourceId?: string }) {
  const { t } = useTranslation();
  if (!sourceId) return null;
  return (
    <View style={styles.container} testID="continuation-draft-notice">
      <Text style={styles.text}>
        {t("continuations.draftNotice", { sourceId: sourceId.slice(0, 8) })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderAccent,
  },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.spacing[1] },
  body: { padding: theme.spacing[4], gap: theme.spacing[3] },
  list: { maxHeight: 320 },
  text: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  error: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
}));
