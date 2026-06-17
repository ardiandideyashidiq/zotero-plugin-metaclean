import type { CaseMode, NormalizeGroup } from "./fieldRegistry";
import { DEFAULT_MODE, getFieldGroup } from "./fieldRegistry";
import {
  trimAndCollapseSpaces,
  isNonLatin,
  toUpperCase,
  toLowerCase,
  toTitleCase,
  toSentenceCase,
  detectAllCaps,
} from "./caseEngine";

export type NormalizeResult = {
  changed: boolean;
  before: string;
  after: string;
  reason: string;
};

export function normalizeValue(params: {
  value: string;
  fieldName: string;
  mode?: CaseMode;
  exceptions?: string[];
}): NormalizeResult {
  const { value, fieldName, mode, exceptions } = params;
  const exc = exceptions ?? [];
  const before = value;

  if (!before) {
    return { changed: false, before, after: before, reason: "empty" };
  }

  // Universal: trim and collapse spaces
  let after = trimAndCollapseSpaces(before);

  // Skip non-Latin text
  if (isNonLatin(after)) {
    return { changed: false, before, after: before, reason: "non-latin" };
  }

  const group = getFieldGroup(fieldName);
  const effectiveMode = mode ?? DEFAULT_MODE[group];

  // Route by field group
  switch (group) {
    case "titleLike":
      after = normalizeTitleLike(after, effectiveMode, exc);
      break;
    case "publicationLike":
      after = normalizePublicationLike(after, effectiveMode, exc);
      break;
    case "publisherLike":
      after = normalizePublisherLike(after, effectiveMode, exc);
      break;
    case "placeLike":
      after = normalizePlaceLike(after, effectiveMode, exc);
      break;
    case "identifierLike":
      after = normalizeIdentifierLike(after, effectiveMode);
      break;
    default:
      // skip — no transformation
      return { changed: false, before, after: before, reason: "skipped" };
  }

  const changed = after !== before;
  const reason = changed ? `${group}: ${effectiveMode}` : "unchanged";

  return { changed, before, after, reason };
}

// ── Per-group normalizers ────────────────────────────────────────

function normalizeTitleLike(
  text: string,
  mode: CaseMode,
  exceptions: string[],
): string {
  let result: string;

  // Heuristic: if detectAllCaps, force sentence case unless explicitly upper
  if (detectAllCaps(text) && mode !== "upper") {
    // First lowercase entirely, then apply the mode
    const lowered = text.toLowerCase();
    result = applyCaseMode(lowered, mode, exceptions, "sentence");
    return result;
  }

  result = applyCaseMode(text, mode, exceptions, "sentence");
  return result;
}

function normalizePublicationLike(
  text: string,
  mode: CaseMode,
  exceptions: string[],
): string {
  if (detectAllCaps(text) && mode !== "upper") {
    return applyCaseMode(text.toLowerCase(), mode, exceptions, "title");
  }
  return applyCaseMode(text, mode, exceptions, "title");
}

function normalizePublisherLike(
  text: string,
  mode: CaseMode,
  exceptions: string[],
): string {
  if (detectAllCaps(text) && mode !== "upper") {
    return applyCaseMode(text.toLowerCase(), mode, exceptions, "title");
  }
  return applyCaseMode(text, mode, exceptions, "title");
}

function normalizePlaceLike(
  text: string,
  mode: CaseMode,
  exceptions: string[],
): string {
  if (detectAllCaps(text) && mode !== "upper") {
    return applyCaseMode(text.toLowerCase(), mode, exceptions, "title");
  }
  return applyCaseMode(text, mode, exceptions, "title");
}

function normalizeIdentifierLike(text: string, mode: CaseMode): string {
  // Identifiers: trim only by default
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  return text; // trim-only (already done above)
}

// ── Helpers ──────────────────────────────────────────────────────

function applyCaseMode(
  text: string,
  mode: CaseMode,
  exceptions: string[],
  smartFallback: "sentence" | "title",
): string {
  switch (mode) {
    case "upper":
      return toUpperCase(text);
    case "lower":
      return toLowerCase(text);
    case "title":
      return toTitleCase(text, exceptions);
    case "sentence":
      return toSentenceCase(text, exceptions);
    case "smart":
      // Use the fallback from the group default
      return smartFallback === "title"
        ? toTitleCase(text, exceptions)
        : toSentenceCase(text, exceptions);
  }
}
