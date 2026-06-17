import {
  normalizeFirstName,
  normalizeLastName,
  normalizeSingleFieldCreator,
} from "./nameEngine";

export type CreatorOptions = {
  /** Whether to process single-field creators (institutions) */
  processSingleFieldCreators: boolean;
  /** Normalization mode: "name" | "title" | "skip" */
  mode: "name" | "title" | "skip";
  /** Exception words to preserve */
  exceptions: string[];
  /** If true, don't save */
  dryRun: boolean;
};

export type CreatorChange = {
  index: number;
  fieldMode: 0 | 1;
  field: "firstName" | "lastName";
  before: string;
  after: string;
};

export async function processCreators(
  item: Zotero.Item,
  options: CreatorOptions,
): Promise<CreatorChange[]> {
  if (options.mode === "skip") return [];

  const creators = item.getCreators();
  const changes: CreatorChange[] = [];

  for (let i = 0; i < creators.length; i++) {
    const creator = creators[i];

    if (creator.fieldMode === 1) {
      // Single-field creator (usually institution)
      if (!options.processSingleFieldCreators) continue;

      const before = creator.lastName ?? "";
      if (!before) continue;

      const after = normalizeSingleFieldCreator(before);
      if (after !== before) {
        changes.push({
          index: i,
          fieldMode: 1,
          field: "lastName",
          before,
          after,
        });
        if (!options.dryRun) {
          creators[i] = { ...creator, lastName: after };
        }
      }
    } else {
      // Two-field person creator
      // First name
      if (creator.firstName) {
        const before = creator.firstName;
        const after = normalizeFirstName(before);
        if (after !== before) {
          changes.push({
            index: i,
            fieldMode: 0,
            field: "firstName",
            before,
            after,
          });
          if (!options.dryRun) {
            creators[i] = { ...creators[i], firstName: after };
          }
        }
      }

      // Last name
      if (creator.lastName) {
        const before = creator.lastName;
        const after = normalizeLastName(before);
        if (after !== before) {
          changes.push({
            index: i,
            fieldMode: 0,
            field: "lastName",
            before,
            after,
          });
          if (!options.dryRun) {
            creators[i] = { ...creators[i], lastName: after };
          }
        }
      }
    }
  }

  if (changes.length > 0 && !options.dryRun) {
    try {
      item.setCreators(creators);
    } catch {
      // Set error — skip
    }
  }

  return changes;
}
