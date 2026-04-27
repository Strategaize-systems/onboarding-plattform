// SLC-039 MT-5 — ZIP-Builder fuer Handbuch-Snapshot
//
// Verwendet `archiver` (bereits Dependency) im "zip"-Mode mit Speichern + Deflate.
// Output: Buffer (komplettes ZIP im Speicher), damit der Worker es per
// adminClient.storage.from('handbook').upload(...) als Blob hochladen kann.
//
// Layout im ZIP: alle Files unter "handbuch/" (per Slice-Spec In-Scope).

import archiver from "archiver";

export interface ZipBuilderInput {
  files: Record<string, string>;
  rootFolder?: string; // default 'handbuch'
}

export interface ZipBuilderResult {
  buffer: Buffer;
  size: number;
  fileCount: number;
}

export async function buildHandbookZip(input: ZipBuilderInput): Promise<ZipBuilderResult> {
  const root = (input.rootFolder ?? "handbuch").replace(/\/$/, "");
  const entries = Object.entries(input.files);

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
        fileCount: entries.length,
      });
    });

    for (const [filename, content] of entries) {
      archive.append(content, { name: `${root}/${filename}` });
    }
    void archive.finalize();
  });
}
