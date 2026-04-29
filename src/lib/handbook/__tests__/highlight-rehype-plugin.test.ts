// SLC-045 MT-1 — Tests fuer das Highlight-rehype-Plugin.
// Wir testen die Tree-Mutation direkt auf einem minimalen HAST-Tree.

import { describe, it, expect } from "vitest";
import { highlightRehypePlugin } from "../highlight-rehype-plugin";

interface NodeLike {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: NodeLike[];
}

function runPlugin(tree: NodeLike, query: string, sectionId = "s1") {
  const factory = highlightRehypePlugin({
    query,
    sectionId,
    counter: { value: 0 },
  });
  const transformer = factory();
  // unified-Konvention: Plugin-Factory-Pattern, transformer(tree, file)
  // wird als sync gerufen — hier reicht direkt der Aufruf.
  // @ts-expect-error — minimal HAST mock, transformer hat any-Signatur
  transformer(tree);
  return tree;
}

function makeRoot(children: NodeLike[]): NodeLike {
  return { type: "root", children };
}

describe("highlightRehypePlugin", () => {
  it("macht nichts bei Query unter 3 Zeichen", () => {
    const tree = makeRoot([{ type: "text", value: "Hello world" }]);
    runPlugin(tree, "He");
    expect(tree.children).toHaveLength(1);
    expect(tree.children?.[0].type).toBe("text");
    expect(tree.children?.[0].value).toBe("Hello world");
  });

  it("wrappt Treffer in <mark>", () => {
    const tree = makeRoot([{ type: "text", value: "Hello world" }]);
    runPlugin(tree, "world");
    const children = tree.children ?? [];
    expect(children).toHaveLength(2);
    expect(children[0]).toMatchObject({ type: "text", value: "Hello " });
    expect(children[1]).toMatchObject({
      type: "element",
      tagName: "mark",
    });
    expect(children[1].children?.[0].value).toBe("world");
  });

  it("vergibt eindeutige IDs pro Treffer", () => {
    const tree = makeRoot([{ type: "text", value: "Foo Foo Foo" }]);
    runPlugin(tree, "Foo", "abc");
    const marks = (tree.children ?? []).filter((c) => c.tagName === "mark");
    expect(marks).toHaveLength(3);
    expect(marks.map((m) => m.properties?.id)).toEqual([
      "match-abc-0",
      "match-abc-1",
      "match-abc-2",
    ]);
  });

  it("ueberspringt <code>-Bloecke", () => {
    const tree = makeRoot([
      {
        type: "element",
        tagName: "code",
        children: [{ type: "text", value: "find this" }],
      },
      { type: "text", value: " find this outside" },
    ]);
    runPlugin(tree, "find");
    // Code-Inhalt unveraendert
    const codeChild = tree.children?.[0].children?.[0];
    expect(codeChild?.type).toBe("text");
    expect(codeChild?.value).toBe("find this");
    // Aussen wurde markiert
    const outerChildren = tree.children?.slice(1) ?? [];
    expect(outerChildren.some((c) => c.tagName === "mark")).toBe(true);
  });

  it("ueberspringt <pre>-Bloecke", () => {
    const tree = makeRoot([
      {
        type: "element",
        tagName: "pre",
        children: [
          {
            type: "element",
            tagName: "code",
            children: [{ type: "text", value: "find this in code" }],
          },
        ],
      },
    ]);
    runPlugin(tree, "find");
    const pre = tree.children?.[0];
    const codeText = pre?.children?.[0].children?.[0];
    expect(codeText?.value).toBe("find this in code");
    expect(codeText?.type).toBe("text");
  });

  it("matcht case-insensitive aber preserviert original-Case im <mark>", () => {
    const tree = makeRoot([{ type: "text", value: "Hello WORLD welt" }]);
    runPlugin(tree, "world");
    const mark = tree.children?.find((c) => c.tagName === "mark");
    expect(mark?.children?.[0].value).toBe("WORLD");
  });

  it("rekursiv: matched in nested <p><strong>...</strong></p>", () => {
    const tree = makeRoot([
      {
        type: "element",
        tagName: "p",
        children: [
          {
            type: "element",
            tagName: "strong",
            children: [{ type: "text", value: "important text" }],
          },
        ],
      },
    ]);
    runPlugin(tree, "important");
    const strong = tree.children?.[0].children?.[0];
    expect(strong?.children?.some((c) => c.tagName === "mark")).toBe(true);
  });
});
