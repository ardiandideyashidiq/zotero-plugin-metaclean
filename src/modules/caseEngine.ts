import type { CaseMode, NormalizeGroup } from "./fieldRegistry";
import { DEFAULT_MODE, getFieldGroup } from "./fieldRegistry";

// ── Small words preserved in title case ──────────────────────────
const SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "but",
  "or",
  "for",
  "nor",
  "yet",
  "so",
  "of",
  "in",
  "on",
  "at",
  "to",
  "by",
  "with",
  "from",
  "via",
  "as",
  "if",
  "is",
  "it",
  "its",
  "per",
  "than",
  "that",
  "up",
  "vs",
  "vs.",
  "versus",
]);

// ── Helpers ──────────────────────────────────────────────────────

export function trimAndCollapseSpaces(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?")}\]])/g, "$1")
    .replace(/([([{"-])\s+/g, "$1");
}

export function isNonLatin(text: string): boolean {
  // CJK, Arabic, Cyrillic, Greek, Hebrew, etc.
  return /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0600-\u06ff\u0400-\u04ff\u0370-\u03ff\u0590-\u05ff\u1100-\u11ff\ua000-\ua4cf\u3130-\u318f\ua960-\ua97f]/.test(
    text,
  );
}

export function detectAllCaps(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 3) return false;
  const upper = letters.replace(/[A-Z]/g, "");
  return upper.length / letters.length < 0.4; // >60% uppercase
}

// ── Core transforms ──────────────────────────────────────────────

export function toUpperCase(text: string): string {
  return text.toUpperCase();
}

export function toLowerCase(text: string): string {
  return text.toLowerCase();
}

export function toTitleCase(text: string, exceptions: string[]): string {
  const excSet = new Set(exceptions.map((e) => e.toLowerCase()));
  const acronymPattern = /[A-Z]{2,}(?:s)?/g;

  // Preserve acronym positions before transformation
  const acronyms: Array<{ index: number; text: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = acronymPattern.exec(text)) !== null) {
    acronyms.push({ index: match.index, text: match[0] });
  }

  const words = text.toLowerCase().split(/(\s+)/);
  const result = words.map((word, i) => {
    // Don't modify whitespace
    if (/^\s+$/.test(word)) return word;

    const isFirst =
      i === 0 || (i > 0 && /^\s+$/.test(words[i - 1]) && words[i - 2] == null);

    if (isFirst) {
      // Always capitalize first word
      return capitalizeWord(word);
    }

    // Check small words
    const stripped = word.replace(/^[^\w]/, "").replace(/[^\w]$/, "");
    if (stripped.length > 0 && SMALL_WORDS.has(stripped)) {
      return word;
    }

    // Check exception words
    if (excSet.has(stripped.toLowerCase())) {
      return restoreCase(word, stripped, exceptions);
    }

    return capitalizeWord(word);
  });

  let transformed = result.join("");

  // Restore preserved acronyms
  for (const acro of acronyms) {
    const before = transformed.slice(0, acro.index);
    const after = transformed.slice(acro.index + acro.text.length);
    transformed = before + acro.text + after;
  }

  return transformed;
}

export function toSentenceCase(text: string, exceptions: string[]): string {
  const excSet = new Set(exceptions.map((e) => e.toLowerCase()));

  let result = text.toLowerCase();

  // Capitalize first letter
  result = result.replace(/^[a-z]/, (c) => c.toUpperCase());

  // Capitalize after period (new sentences)
  result = result.replace(/(\.\s+)([a-z])/g, (_, space, letter) => {
    return space + letter.toUpperCase();
  });

  // Restore exception words (case-insensitive match, word boundaries)
  for (const exc of exceptions) {
    const escaped = exc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("\\b" + escaped + "\\b", "gi");
    result = result.replace(re, exc);
  }

  // Restore known acronyms (2+ uppercase letters)
  result = result.replace(/\b([A-Z])([A-Z]+)\b/g, (match) =>
    match.toUpperCase(),
  );

  return result;
}

export function smartCase(
  value: string,
  fieldName: string,
  mode?: CaseMode,
  exceptions?: string[],
): { text: string; mode: CaseMode } {
  const exc = exceptions ?? [];
  const group = getFieldGroup(fieldName);

  if (mode && mode !== "smart") {
    return { text: applyMode(value, mode, exc), mode };
  }

  const defaultMode = DEFAULT_MODE[group];
  return { text: applyMode(value, defaultMode, exc), mode: defaultMode };
}

function applyMode(text: string, mode: CaseMode, exceptions: string[]): string {
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
      return toSentenceCase(text, exceptions); // fallback
  }
}

function capitalizeWord(word: string): string {
  if (word.length === 0) return word;
  // Handle punctuation-prefixed words like "("
  const prefix = word.match(/^[^\w]+/)?.[0] ?? "";
  const core = word.slice(prefix.length);
  const suffix = core.match(/[^\w]+$/)?.[0] ?? "";
  const base = core.slice(0, core.length - suffix.length);
  if (!base) return word;
  return prefix + base[0].toUpperCase() + base.slice(1).toLowerCase() + suffix;
}

function restoreCase(
  word: string,
  stripped: string,
  exceptions: string[],
): string {
  for (const exc of exceptions) {
    if (exc.toLowerCase() === stripped.toLowerCase()) {
      const prefix = word.slice(0, word.indexOf(stripped));
      const suffix = word.slice(prefix.length + stripped.length);
      return prefix + exc + suffix;
    }
  }
  return word;
}
