// V8 SLC-150 — Public API fuer Mandanten-Report V2 Renderer.

export { renderMandantenReportV2Pdf, MandantenReportV2Document } from "./renderer";
export type {
  RendererInput,
  MandantInfo,
  StbInfo,
  RenderOptions,
} from "./types";
export { validateRendererInput } from "./types";
