// SLC-045 MT-1 — Custom rehype-Plugin: wrappt Treffer der Suchquery in
// <mark>-Elemente innerhalb von Text-Nodes. Code-Bloecke (`<code>`/`<pre>`)
// werden uebersprungen, damit Markdown-Code nicht zerschossen wird.
//
// Das Plugin wird pro Render via `rehypePlugins={[[plugin, { query, snapshotId, sectionKey }]]}`
// instanziert — die Query muss als Option uebergeben werden, weil rehype-Plugins
// im React-Tree neu evaluiert werden, sobald sich die Props aendern. Die ID-Praefixe
// fuer `<mark id="match-...">` ermoeglichen Scroll-to-Match aus der Treffer-Liste.

interface HighlightOptions {
  query: string;
  /** Praefix fuer die DOM-ID jedes <mark>. Default "match". */
  idPrefix?: string;
  /**
   * Optionaler Section-Identifier (sectionKey). Wird in die DOM-ID
   * mit eingewoben: `${idPrefix}-${sectionId}-${index}`. Macht Treffer-Listen
   * eindeutig adressierbar pro Section. Wenn nicht gesetzt, wird nur der
   * Plugin-internen counter verwendet.
   */
  sectionId?: string;
  /**
   * Optional: Counter-Object damit Treffer-Indizes ueber mehrere Render-Calls
   * (mehrere Sections in einer Page) konsistent bleiben.
   * Wird vom Caller bereitgestellt und vom Plugin per Mutation hochgezaehlt.
   */
  counter?: { value: number };
}

interface HastTextNode {
  type: "text";
  value: string;
}

interface HastElementNode {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

type HastNode = HastTextNode | HastElementNode | { type: string; children?: HastNode[] };

const SKIPPED_TAGS = new Set(["code", "pre", "script", "style"]);

export function highlightRehypePlugin(options: HighlightOptions) {
  return () => {
    return (tree: HastNode) => {
      const query = (options.query ?? "").trim();
      if (!query || query.length < 3) return;

      const lowerQuery = query.toLowerCase();
      const counter = options.counter ?? { value: 0 };
      const sectionPart = options.sectionId ? `${options.sectionId}-` : "";
      const idPrefix = options.idPrefix ?? "match";

      visit(tree, lowerQuery, query.length, (textNode) => {
        return splitTextNodeWithMark(textNode, lowerQuery, query.length, () => {
          const id = `${idPrefix}-${sectionPart}${counter.value}`;
          counter.value += 1;
          return id;
        });
      });
    };
  };
}

function visit(
  node: HastNode,
  lowerQuery: string,
  queryLen: number,
  replace: (textNode: HastTextNode) => HastNode[] | null,
): void {
  if (!("children" in node) || !node.children) return;

  if (node.type === "element") {
    const el = node as HastElementNode;
    if (el.tagName && SKIPPED_TAGS.has(el.tagName.toLowerCase())) return;
  }

  const newChildren: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      const textNode = child as HastTextNode;
      const replaced = replace(textNode);
      if (replaced) {
        newChildren.push(...replaced);
      } else {
        newChildren.push(textNode);
      }
    } else {
      visit(child, lowerQuery, queryLen, replace);
      newChildren.push(child);
    }
  }
  node.children = newChildren;
}

function splitTextNodeWithMark(
  textNode: HastTextNode,
  lowerQuery: string,
  queryLen: number,
  nextId: () => string,
): HastNode[] | null {
  const value = textNode.value ?? "";
  const lowerValue = value.toLowerCase();
  if (!lowerValue.includes(lowerQuery)) return null;

  const out: HastNode[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const matchAt = lowerValue.indexOf(lowerQuery, cursor);
    if (matchAt === -1) {
      if (cursor < value.length) {
        out.push({ type: "text", value: value.slice(cursor) });
      }
      break;
    }
    if (matchAt > cursor) {
      out.push({ type: "text", value: value.slice(cursor, matchAt) });
    }
    const id = nextId();
    out.push({
      type: "element",
      tagName: "mark",
      properties: {
        id,
        className: ["handbook-search-match"],
        "data-match-id": id,
      },
      children: [{ type: "text", value: value.slice(matchAt, matchAt + queryLen) }],
    } as HastElementNode);
    cursor = matchAt + queryLen;
  }

  return out;
}
