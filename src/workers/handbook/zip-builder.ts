// SLC-039 MT-5 — ZIP-Builder fuer Handbuch-Snapshot
//
// Verwendet `archiver` (bereits Dependency) im "zip"-Mode mit Speichern + Deflate.
// Output: Buffer (komplettes ZIP im Speicher), damit der Worker es per
// adminClient.storage.from('handbook').upload(...) als Blob hochladen kann.
//
// Layout im ZIP: das primaere Set unter "handbuch/" (per Slice-Spec In-Scope);
// SLC-V9.7-B: zusaetzliche benannte Folder-Sets (z.B. "okf/") via extraFolders
// in DASSELBE Archiv, rueckwaerts-kompatibel (bestehender `{files}`-Aufruf
// verhaelt sich byte-identisch).

import archiver from "archiver";

/** Ein benanntes Folder-Set: alle `files` landen unter `root/`. */
export interface ZipFolderSet {
  root: string;
  files: Record<string, string>;
}

export interface ZipBuilderInput {
  files: Record<string, string>;
  rootFolder?: string; // default 'handbuch'
  // SLC-V9.7-B: weitere Ordner (z.B. OKF-Bundle unter "okf/") in EIN ZIP.
  extraFolders?: ZipFolderSet[];
}

export interface ZipBuilderResult {
  buffer: Buffer;
  size: number;
  fileCount: number;
}

export async function buildHandbookZip(input: ZipBuilderInput): Promise<ZipBuilderResult> {
  const root = (input.rootFolder ?? "handbuch").replace(/\/$/, "");
  const folderSets: ZipFolderSet[] = [
    { root, files: input.files },
    ...(input.extraFolders ?? []).map((set) => ({
      root: set.root.replace(/\/$/, ""),
      files: set.files,
    })),
  ];
  const fileCount = folderSets.reduce(
    (sum, set) => sum + Object.keys(set.files).length,
    0,
  );

  return new Promise<ZipBuilderResult>((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("warning", (err) => {
      if ((err as { code?: string }).code === "ENOENT") {
        // benign warning
        return;
      }
      reject(err);
    });
    archive.on("error", (err) => reject(err));
    archive.on("end", () => {
      const buffer = Buffer.concat(chunks);
      resolve({
        buffer,
        size: buffer.length,
        fileCount,
      });
    });

    for (const set of folderSets) {
      for (const [filename, content] of Object.entries(set.files)) {
        archive.append(content, { name: `${set.root}/${filename}` });
      }
    }
    void archive.finalize();
  });
}
