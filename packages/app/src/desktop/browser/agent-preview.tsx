import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { getDesktopHost } from "@/desktop/host";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { browserActivityKey, useBrowserActivity } from "./automation/activity";
import { useBrowserStore } from "./store";

export function AgentBrowserPreview({
  serverId,
  workspaceId,
  agentId,
}: {
  serverId: string;
  workspaceId: string;
  agentId: string;
}) {
  const activity = useBrowserActivity(
    (state) => state.byAgent[browserActivityKey(serverId, agentId)],
  );
  const browser = useBrowserStore((state) =>
    activity ? state.browsersById[activity.browserId] : undefined,
  );
  const paused = useBrowserActivity((state) =>
    activity ? state.paused[activity.browserId] === true : false,
  );
  const visible = useRetainedPanelActive();
  const [expanded, setExpanded] = useState(true);
  const [frame, setFrame] = useState<{ browserId: string; uri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const browserId = browser?.browserId;
  useEffect(() => {
    const execute = getDesktopHost()?.browser?.executeAutomationCommand;
    if (!browserId || !visible || !expanded || !execute) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const capture = async () => {
      try {
        const result = await execute({
          type: "browser.automation.execute.request",
          requestId: `preview-${browserId}-${Date.now()}`,
          workspaceId,
          command: { command: "screenshot", args: { browserId, fullPage: false } },
        });
        if (!active) return;
        if (result.ok && result.result.command === "screenshot") {
          setFrame({ browserId, uri: `data:image/png;base64,${result.result.dataBase64}` });
          setError(null);
        } else if (!result.ok) setError(result.error.message);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (active) timer = setTimeout(capture, 2000);
      }
    };
    void capture();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [browserId, workspaceId, visible, expanded]);
  const source = useMemo(() => (frame ? { uri: frame.uri } : undefined), [frame]);
  const toggleExpanded = useCallback(() => setExpanded((value) => !value), []);
  const togglePaused = useCallback(() => {
    if (browserId) useBrowserActivity.getState().setPaused(browserId, !paused);
  }, [browserId, paused]);
  const open = useCallback(() => {
    if (!browserId) return;
    const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
    if (workspaceKey)
      useWorkspaceLayoutStore.getState().openTab({
        workspaceKey,
        target: { kind: "browser", browserId },
        intent: "reveal",
      });
  }, [serverId, workspaceId, browserId]);
  if (!browser || !activity) return null;
  return (
    <View style={styles.card} testID="agent-browser-preview">
      <View style={styles.toolbar}>
        <Text style={styles.title} numberOfLines={1}>
          {browser.title || browser.url}
        </Text>
        <Button size="xs" variant="ghost" onPress={toggleExpanded}>
          {expanded ? "Hide preview" : "Show preview"}
        </Button>
        <Button size="xs" variant="ghost" onPress={togglePaused}>
          {paused ? "Resume automation" : "Pause automation"}
        </Button>
        <Button size="xs" variant="ghost" onPress={open}>
          Open tab
        </Button>
      </View>
      {expanded ? (
        <View style={styles.preview}>
          {frame?.browserId === browser.browserId ? (
            <Image
              source={source}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel="Agent browser tab preview"
            />
          ) : (
            <Text style={styles.muted}>Loading browser preview…</Text>
          )}
          <Text style={styles.muted} numberOfLines={1}>
            {paused ? "Automation paused" : browser.url}
          </Text>
          {error ? (
            <Text style={styles.muted} numberOfLines={1}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create((theme) => ({
  card: { borderBottomWidth: 1, borderColor: theme.colors.border, padding: theme.spacing[2] },
  toolbar: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
  title: { flex: 1, color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  preview: { gap: theme.spacing[1], paddingTop: theme.spacing[2] },
  image: { height: 160, width: "100%", backgroundColor: theme.colors.surface1 },
  muted: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
}));
