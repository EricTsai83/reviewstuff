import type { ReviewRequestV1 } from "../review/review-request";
import { escapeJsonText, escapeTerminalText } from "./report-renderer";

const renderReadableRequestJson = (request: ReviewRequestV1): string =>
  JSON.stringify(request, undefined, 2)
    .split("\n")
    .map(escapeTerminalText)
    .join("\n");

export const renderJsonRequestPreview = (request: ReviewRequestV1): string =>
  escapeJsonText(JSON.stringify(request, undefined, 2));

export const renderTerminalRequestPreview = (
  request: ReviewRequestV1,
): string =>
  [
    "Normalized review request preview (not sent):",
    "",
    renderReadableRequestJson(request),
    "",
    "This is the exact redacted, budget-selected ReviewRequestV1 passed to the review engine.",
    "Token counts are estimates; a provider adapter may wrap this request in a provider-specific envelope that is not shown here.",
  ].join("\n");
