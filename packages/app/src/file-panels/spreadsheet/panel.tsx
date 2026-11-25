import type { WorkBook } from "xlsx";
import { useFileBytes, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { useCallback, useMemo, useState } from "react";
import { FlatList, ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { FilePanelLoading } from "../loading";
import { cellText, columnLabel, readWorkbook, sheetRange } from "./model";

const ROW_HEIGHT = 30;
const COLUMN_WIDTH = 160;
const COLUMNS_PER_PAGE = 30;

export function SpreadsheetPanel({ file }: PluginFilePanelProps) {
  const bytes = useFileBytes(file);
  const content = bytes.status === "ready" ? bytes.bytes : null;
  const parsed = useMemo(() => {
    if (!content) return null;
    try {
      return { workbook: readWorkbook(content), error: null };
    } catch (error) {
      return { workbook: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [content]);
  if (bytes.status === "loading") return <FilePanelLoading />;
  const error = bytes.status === "error" ? bytes.error.message : parsed?.error;
  if (error) return <Text style={styles.error}>{error}</Text>;
  const workbook = parsed?.workbook;
  if (!workbook) return <FilePanelLoading />;
  return <WorkbookView workbook={workbook} />;
}

export function SpreadsheetTextPreview({ text }: { text: string }) {
  const parsed = useMemo(() => {
    try {
      return { workbook: readWorkbook(text), error: null };
    } catch (error) {
      return { workbook: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [text]);
  if (!parsed.workbook) return <Text style={styles.error}>{parsed.error}</Text>;
  return <WorkbookView workbook={parsed.workbook} />;
}

export function WorkbookView({ workbook }: { workbook: WorkBook }) {
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [columnPage, setColumnPage] = useState(0);
  const name =
    selectedSheet && workbook.Sheets[selectedSheet] ? selectedSheet : workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  const range = sheetRange(sheet ?? {});
  const page = Math.min(columnPage, Math.floor((range.e.c - range.s.c) / COLUMNS_PER_PAGE));
  const firstColumn = range.s.c + page * COLUMNS_PER_PAGE;
  const columns = useMemo(
    () =>
      Array.from(
        { length: Math.min(COLUMNS_PER_PAGE, range.e.c - firstColumn + 1) },
        (_, i) => firstColumn + i,
      ),
    [firstColumn, range.e.c],
  );
  const rows = useMemo(
    () => Array.from({ length: range.e.r - range.s.r + 1 }, (_, i) => range.s.r + i),
    [range.e.r, range.s.r],
  );
  const gridStyle = useMemo(
    () => ({ width: 56 + columns.length * COLUMN_WIDTH, flex: 1 }),
    [columns.length],
  );
  const selectSheet = useCallback((value: string) => {
    setSelectedSheet(value);
    setColumnPage(0);
  }, []);
  const previous = useCallback(() => setColumnPage(page - 1), [page]);
  const next = useCallback(() => setColumnPage(page + 1), [page]);
  const renderRow = useCallback(
    ({ item: row }: { item: number }) => (
      <View style={styles.row}>
        <Text style={styles.rowNumber}>{row + 1}</Text>
        {columns.map((column) => (
          <Text selectable key={column} numberOfLines={1} style={styles.cell}>
            {cellText(sheet ?? {}, row, column)}
          </Text>
        ))}
      </View>
    ),
    [columns, sheet],
  );
  if (!sheet) return <Text style={styles.message}>This workbook has no worksheets.</Text>;
  return (
    <View style={styles.container} testID="spreadsheet-file-preview">
      <View style={styles.toolbar}>
        <ScrollView horizontal style={styles.sheets}>
          {workbook.SheetNames.map((sheetName) => (
            <SheetButton
              key={sheetName}
              name={sheetName}
              selected={name === sheetName}
              onSelect={selectSheet}
            />
          ))}
        </ScrollView>
        <Text style={styles.muted}>Read only</Text>
      </View>
      <ScrollView horizontal style={styles.container} contentContainerStyle={styles.gridContainer}>
        <View style={gridStyle}>
          <View style={styles.row}>
            <Text style={styles.rowNumber}>#</Text>
            {columns.map((column) => (
              <Text key={column} style={styles.header}>
                {columnLabel(column)}
              </Text>
            ))}
          </View>
          <FlatList
            key={name}
            data={rows}
            initialNumToRender={30}
            windowSize={5}
            keyExtractor={rowKey}
            getItemLayout={rowLayout}
            renderItem={renderRow}
          />
        </View>
      </ScrollView>
      <View style={styles.toolbar}>
        <Text style={styles.muted}>
          {rows.length.toLocaleString()} rows · {range.e.c - range.s.c + 1} columns
        </Text>
        {range.e.c - range.s.c >= COLUMNS_PER_PAGE ? (
          <>
            <Button size="xs" variant="ghost" disabled={page === 0} onPress={previous}>
              Previous columns
            </Button>
            <Text style={styles.muted}>
              {columnLabel(firstColumn)}–{columnLabel(columns[columns.length - 1])}
            </Text>
            <Button
              size="xs"
              variant="ghost"
              disabled={columns[columns.length - 1] === range.e.c}
              onPress={next}
            >
              Next columns
            </Button>
          </>
        ) : null}
      </View>
    </View>
  );
}

function SheetButton({
  name,
  selected,
  onSelect,
}: {
  name: string;
  selected: boolean;
  onSelect: (name: string) => void;
}) {
  const select = useCallback(() => onSelect(name), [name, onSelect]);
  return (
    <Button size="xs" variant={selected ? "secondary" : "ghost"} onPress={select}>
      {name}
    </Button>
  );
}
const rowKey = (row: number) => String(row);
const rowLayout = (_: unknown, index: number) => ({
  length: ROW_HEIGHT,
  offset: ROW_HEIGHT * index,
  index,
});

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, minHeight: 0 },
  gridContainer: { flexGrow: 1 },
  sheets: { flex: 1 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[2],
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  row: {
    flexDirection: "row",
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  cell: {
    width: COLUMN_WIDTH,
    paddingHorizontal: theme.spacing[2],
    lineHeight: ROW_HEIGHT - 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  header: {
    width: COLUMN_WIDTH,
    paddingHorizontal: theme.spacing[2],
    lineHeight: ROW_HEIGHT - 1,
    backgroundColor: theme.colors.surface1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  rowNumber: {
    width: 56,
    textAlign: "center",
    lineHeight: ROW_HEIGHT - 1,
    backgroundColor: theme.colors.surface1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  muted: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  message: { padding: theme.spacing[4], color: theme.colors.foreground },
  error: { padding: theme.spacing[4], color: theme.colors.destructive },
}));
