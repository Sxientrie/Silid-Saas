export const SILID_PACKAGE_NAME = "@silid/testing" as const;
export {
  buildAcceptanceReport,
  normalizeSentence,
  parseAcceptanceInputs,
  parseResultsFile,
  reportVerdict,
} from "./acceptance-report.js";
export type {
  AcceptanceReportModel,
  CapabilityResult,
  CapabilityResultRecord,
  GateResult,
} from "./acceptance-report.js";
