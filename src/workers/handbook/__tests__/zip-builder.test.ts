// SLC-039 MT-5 — Tests fuer den ZIP-Builder
//
// Verwendet ein simples ZIP-Local-Header-Parsing zur Verifikation, damit der Test
// keine zusaetzliche Decompress-Dependency braucht. Wir pruefen nur die Filenames
// in den Local Headers (die unkomprimierten Pfade), nicht die entpackten Inhalte.

import { describe, expect, it } from "vitest";
import { buildHandbookZip } from "../zip-builder";

function listZipFilenames(buffer: Buffer): string[] {
  const names: string[] = [];
  const sig = 0x04034b50; // PK\x03\x04 — Local File Header
  let offset = 0;
  while (offset < buffer.length - 4) {
    if (buffer.readUInt32LE(offset) !== sig) {
      offset += 1;
      continue;
    }
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const name = buffer
      .subarray(offset + 30, offset + 30 + nameLen)
      .toString("utf8");
    names.push(name);
    offset += 30 + nameLen + extraLen + compressedSize;
  }
  return names;
}

describe("buildHandbookZip", () => {
  it("packt alle Files unter 'handbuch/' Praefix", async () => {
    const result = await buildHandbookZip({
      files: {
        "INDEX.md": "# Index",
        "01_section.md": "# Section",
      },
    });
    const names = listZipFilenames(result.buffer);
    expect(names).toContain("handbuch/INDEX.md");
    expect(names).toContain("handbuch/01_section.md");
    expect(result.fileCount).toBe(2);
  });

  it("erlaubt benutzerdefinierten rootFolder", async () => {
    const result = await buildHandbookZip({
      files: { "x.md": "hallo" },
      rootFolder: "alt",
    });
    const names = listZipFilenames(result.buffer);
    expect(names).toContain("alt/x.md");
  });

  it("liefert validen ZIP-Buffer (Magic Bytes + Groesse > 0)", async () => {
    const result = await buildHandbookZip({
      files: { "INDEX.md": "# Hallo Welt" },
    });
    expect(result.buffer.length).toBeGreaterThan(20);
    expect(result.buffer.readUInt32LE(0)).toBe(0x04034b50); // PK\x03\x04 Local File Header
    expect(result.size).toBe(result.buffer.length);
  });

  it("akzeptiert leere Files-Map und liefert minimales ZIP", async () => {
    const result = await buildHandbookZip({ files: {} });
    expect(result.fileCount).toBe(0);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("ist deterministisch fuer gleiche Eingabe (Filenames gleich)", async () => {
    const a = await buildHandbookZip({
      files: { "INDEX.md": "x", "01_a.md": "y" },
    });
    const b = await buildHandbookZip({
      files: { "INDEX.md": "x", "01_a.md": "y" },
    });
    expect(listZipFilenames(a.buffer).sort()).toEqual(
      listZipFilenames(b.buffer).sort(),
    );
  });
});
