import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { FileText } from "lucide-react-native";
import { AdaptiveModalSheet } from "./adaptive-modal-sheet";
import { AttachmentLabel, AttachmentPill } from "./attachment-pill";
import type { ComposerAttachment } from "@/attachments/types";

const icon = <FileText size={14} />;
export function RestoredAttachmentPill({
  attachment,
  index,
  disabled,
  onRemove,
  removeLabel,
}: {
  attachment: Extract<ComposerAttachment, { kind: "restored_attachment" }>;
  index: number;
  disabled: boolean;
  onRemove: (index: number) => void;
  removeLabel: string;
}) {
  const payload = attachment.attachment;
  let title = "Attachment";
  if ("title" in payload && payload.title) title = payload.title;
  else if ("fileName" in payload) title = payload.fileName;
  let preview = title;
  if (payload.type === "text") preview = payload.text;
  else if ("path" in payload) preview = payload.path;
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const remove = useCallback(() => onRemove(index), [onRemove, index]);
  const header = useMemo(() => ({ title }), [title]);
  return (
    <>
      <AttachmentPill
        testID="composer-restored-attachment-pill"
        onOpen={open}
        onRemove={remove}
        openAccessibilityLabel={title}
        removeAccessibilityLabel={removeLabel}
        disabled={disabled}
      >
        <AttachmentLabel icon={icon} title={title} subtitle="From previous message" />
      </AttachmentPill>
      <AdaptiveModalSheet
        visible={visible}
        onClose={close}
        header={header}
        testID="restored-attachment-preview"
      >
        <ScrollView style={styles.preview}>
          <View style={styles.body}>
            <Text selectable style={styles.text}>
              {preview}
            </Text>
          </View>
        </ScrollView>
      </AdaptiveModalSheet>
    </>
  );
}
const styles = StyleSheet.create((theme) => ({
  preview: { maxHeight: 500 },
  body: { padding: theme.spacing[4] },
  text: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
}));
