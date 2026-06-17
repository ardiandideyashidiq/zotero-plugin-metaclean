// ── Particles (kept lowercase when not first) ────────────────────
export const NAME_PARTICLES = new Set([
  "van",
  "von",
  "der",
  "den",
  "de",
  "da",
  "del",
  "della",
  "di",
  "dos",
  "das",
  "do",
  "bin",
  "bint",
  "al",
  "ibn",
  "ben",
  "bar",
  "ap",
  "fitz",
  "nic",
  "o'",
  "mac",
  "mc",
  "san",
  "santa",
  "santo",
  "st.",
  "st",
]);

// ── Suffixes (preserved as-is) ───────────────────────────────────
export const NAME_SUFFIXES = new Set([
  "jr.",
  "jr",
  "sr.",
  "sr",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "ph.d.",
  "phd",
  "m.d.",
  "md",
  "esq.",
  "esq",
]);

// ── Initial-based name pattern ───────────────────────────────────
const INITIAL_PATTERN = /^([A-Z](?:\.|\s)?)(?:\s+([A-Z](?:\.|\s)?))*$/;

/**
 * Normalize a first/middle name, preserving initials and particles.
 */
export function normalizeFirstName(name: string): string {
  if (!name) return name;

  const trimmed = name.trim().replace(/\s+/g, " ");

  // If it's already initials like "J. R. R.", preserve as-is
  if (INITIAL_PATTERN.test(trimmed)) {
    return trimmed
      .split(/\s+/)
      .map((part) => {
        const clean = part.replace(/\.$/, "").toUpperCase();
        return part.endsWith(".") ? clean + "." : clean;
      })
      .join(" ");
  }

  // Otherwise title-case normally
  return trimmed.toLowerCase().split(/\s+/).map(capitalizeWord).join(" ");
}

/**
 * Normalize a last name, preserving particles and suffixes.
 */
export function normalizeLastName(name: string): string {
  if (!name) return name;

  const trimmed = name.trim().replace(/\s+/g, " ");
  const words = trimmed.split(/\s+/);

  const result = words.map((word, i) => {
    const lower = word
      .replace(/[^a-zA-Z'.-]/g, "")
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/\./g, "");

    // Check suffix (keep as-is)
    if (NAME_SUFFIXES.has(lower)) {
      return word; // preserve original formatting
    }

    // Check particle (keep lowercase unless it's the last word)
    const isLastParticle = i < words.length - 1 && NAME_PARTICLES.has(lower);

    if (NAME_PARTICLES.has(lower) && !isLastParticle) {
      // Actually check: if it's a particle and NOT the last real word, keep lowercase
      const nextWord = words[i + 1]?.toLowerCase().replace(/[^a-zA-Z]/g, "");
      if (nextWord && !NAME_SUFFIXES.has(nextWord)) {
        // Check if this particle is in original with uppercase (preserve preference)
        return /^[A-Z]/.test(word) ? capitalizeWord(lower) : lower;
      }
    }

    // Handle hyphenated names: "Martínez-López" → "Martínez-López"
    if (word.includes("-")) {
      return word
        .split("-")
        .map((part) => {
          const pLower = part.toLowerCase().replace(/[^a-zA-Záéíóúüñ]/g, "");
          return capitalizeWord(pLower);
        })
        .join("-")
        .replace(/^[a-záéíóúüñ]/, (c) => c.toUpperCase());
    }

    return capitalizeWord(lower);
  });

  return result.join(" ");
}

/**
 * Normalize a single-field creator (typically an institution).
 * Uses title-like normalization.
 */
export function normalizeSingleFieldCreator(name: string): string {
  if (!name) return name;

  const trimmed = name.trim().replace(/\s+/g, " ");

  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      // Preserve acronyms (2+ uppercase in original)
      if (/^[A-Z]{2,}$/.test(word)) return word;

      const lower = word.toLowerCase().replace(/[^a-zA-Z]/g, "");
      const smallWords = new Set([
        "of",
        "the",
        "and",
        "for",
        "in",
        "on",
        "at",
        "by",
        "with",
        "from",
      ]);
      if (i > 0 && smallWords.has(lower)) return lower;

      return capitalizeWord(lower);
    })
    .join(" ");
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word[0].toUpperCase() + word.slice(1);
}
