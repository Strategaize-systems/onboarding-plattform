// V10.5 SLC-191 — Exit-/Devil's-Advocate-Report: Barrel.
// Exportiert Typen + Loader/Builder + Owner-Dependence-Index + Renderer.
// (SLC-192 erweitert um positioning/coverage.)

export type {
  ExitReportInput,
  OwnerDepQuestion,
  DiagnosisSubtopic,
} from "./types";
export { buildExitReportInput, loadExitReportInput, answerKey } from "./data";
export {
  computeOwnerDependenceIndex,
  type OwnerDependenceIndex,
  type OwnerDepDimension,
  type OwnerDepLevel,
  type Ampel,
} from "./owner-dependence";
export { buildBuyerFindings, type BuyerFinding } from "./framing";
export { EXIT_SPUR_COPY, MAKLER_DISCLAIMER_COPY, type SpurBlock } from "./positioning";
export {
  buildCoverageSection,
  type CoverageSection,
  type CoverageItem,
  type CoverageReason,
  type CoverageStatus,
} from "./coverage";
export { renderExitReportPdf } from "./renderer";
