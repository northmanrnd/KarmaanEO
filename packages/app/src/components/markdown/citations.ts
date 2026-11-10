import { classifyAssistantFileLink } from "@/assistant-file-links/parse";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Nodes } from "mdast";

/** Convert Codex output directives to ordinary links; code examples remain literal. */
export function normalizeCodexFileCitations(source: string): string {
  if (!source.includes(":codex-file-citation{")) return source;
  const protectedRanges: { start: number; end: number }[] = [];
  function visit(node: Nodes) {
    if (["code", "inlineCode", "html", "link", "image", "definition"].includes(node.type)) {
      if (node.position)
        protectedRanges.push({
          start: node.position.start.offset!,
          end: node.position.end.offset!,
        });
    } else if ("children" in node) node.children.forEach(visit);
  }
  visit(fromMarkdown(source));
  return source.replace(
    /(?<![\\\w]):codex-file-citation\{([^}\n]*)\}/g,
    (raw, attributes: string, offset: number) => {
      if (protectedRanges.some(({ start, end }) => offset >= start && offset < end)) return raw;
      const values = new Map<string, string>();
      const attribute = /\s*([\w-]+)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*/gy;
      let cursor = 0;
      while (cursor < attributes.length) {
        attribute.lastIndex = cursor;
        const match = attribute.exec(attributes);
        if (!match || values.has(match[1])) return raw;
        const quoted = match[2];
        let value: string;
        try {
          value = quoted.startsWith('"')
            ? JSON.parse(quoted)
            : quoted.slice(1, -1).replace(/\\'/g, "'");
        } catch {
          return raw;
        }
        values.set(match[1], value);
        cursor = attribute.lastIndex;
      }
      const path = values.get("path")?.trim();
      if (!path) return raw;
      const link = singleMarkdownLink(path);
      const target = link ? link.url : path;
      if (/^https?:\/\//i.test(target)) {
        try {
          if (!new URL(target).hostname) return raw;
        } catch {
          return raw;
        }
      } else if (classifyAssistantFileLink(target, { explicitLink: true })?.kind !== "directFile")
        return raw;
      if (/[<>\r\n]/.test(target)) return raw;
      if (link) return path;
      const label = (
        values.get("title") ||
        target.split(/[\\/]/).findLast((segment) => segment.length > 0) ||
        target
      ).replace(/[\\`*_[\]<>]/g, "\\$&");
      return `[${label}](<${target.replace(/ /g, "%20")}>)`;
    },
  );
}

function singleMarkdownLink(source: string) {
  const tree = fromMarkdown(source);
  const block = tree.children[0];
  if (tree.children.length !== 1 || block?.type !== "paragraph" || block.children.length !== 1)
    return null;
  const child = block.children[0];
  return child.type === "link" ? child : null;
}
