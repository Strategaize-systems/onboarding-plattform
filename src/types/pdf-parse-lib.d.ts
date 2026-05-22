// SLC-141 MT-2 (FEAT-060) — Module-Shim fuer pdf-parse/lib/pdf-parse.js.
//
// pdf-parse exportiert seinen Default ueber `index.js`, das beim Module-Load
// eine Demo-PDF einlesen will (ENOENT bei uns). Workaround: lib-File direkt
// importieren. @types/pdf-parse deklariert nur das Hauptmodul, nicht den
// lib-Pfad — daher dieser kleine Shim, der die gleiche Signatur exposed.

declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseOptions {
    pagerender?: (pageData: unknown) => string;
    max?: number;
    version?: string;
  }
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
    text: string;
  }
  function pdfParse(
    dataBuffer: Buffer,
    options?: PdfParseOptions,
  ): Promise<PdfParseResult>;
  export default pdfParse;
}
