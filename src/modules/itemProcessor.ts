import type { CaseMode, NormalizeGroup } from "./fieldRegistry";
import { getFieldGroup } from "./fieldRegistry";
import { normalizeValue, type NormalizeResult } from "./normalizer";
import { processCreators, type CreatorOptions } from "./creatorProcessor";
import { getPref } from "../utils/prefs";

export type ProcessOptions = {
  mode?: CaseMode;
  dryRun?: boolean;
  addTag?: string | false;
  skipTag?: string | false;
  exceptions?: string[];
  processCreators?: boolean;
  creatorOptions?: Partial<CreatorOptions>;
  verbose?: boolean;
};

export type FieldChange = {
  fieldName: string;
  before: string;
  after: string;
  reason: string;
};

export type FieldInspection = {
  fieldName: string;
  group: string;
  before?: string;
  after?: string;
  reason: string;
};

export type ItemProcessReport = {
  itemID: number;
  itemKey?: string;
  title?: string;
  changed: boolean;
  changes: FieldChange[];
  fields?: FieldInspection[];
  saveError?: string;
};

export type ItemReport = {
  itemID: number;
  itemKey?: string;
  title?: string;
  changed: boolean;
  changes: FieldChange[];
  fields: FieldInspection[];
  skipReason?: string;
  error?: string;
};

export type BatchReport = {
  total: number;
  processed: number;
  skipped: number;
  changed: number;
  errors: number;
  errorItems: Array<{ itemID: number; error: string }>;
  changes: FieldChange[];
  itemReports: ItemReport[];
};

// ── Regular item fields we process ───────────────────────────────
const PROCESS_FIELDS = [
  "title",
  "shortTitle",
  "bookTitle",
  "seriesTitle",
  "encyclopediaTitle",
  "dictionaryTitle",
  "publicationTitle",
  "journalAbbreviation",
  "conferenceName",
  "proceedingsTitle",
  "publisher",
  "distributor",
  "institution",
  "university",
  "archive",
  "libraryCatalog",
  "place",
  "archiveLocation",
  "DOI",
  "ISBN",
  "ISSN",
  "url",
];

// ── Per-group pref helpers ──────────────────────────────────────

const GROUP_ENABLE_PREFS: Record<string, string> = {
  titleLike: "processTitles",
  publicationLike: "processPublications",
  publisherLike: "processPublishers",
  placeLike: "processPlaces",
  identifierLike: "processIdentifiers",
};

const GROUP_MODE_PREFS: Record<string, string> = {
  titleLike: "defaultTitleMode",
  publicationLike: "defaultPublicationMode",
  publisherLike: "defaultPublisherMode",
};

function isGroupEnabled(group: NormalizeGroup): boolean {
  if (group === "creatorLike" || group === "skip") return true;
  const pref = GROUP_ENABLE_PREFS[group];
  if (!pref) return true;
  return getPref(pref as any) !== false;
}

function getGroupMode(group: NormalizeGroup): CaseMode | undefined {
  const pref = GROUP_MODE_PREFS[group];
  if (!pref) return undefined;
  const val = getPref(pref as any) as string;
  if (!val || val === "smart") return undefined;
  return val as CaseMode;
}

export async function processItem(
  item: Zotero.Item,
  options: ProcessOptions,
): Promise<ItemProcessReport | null> {
  if (!item.isRegularItem()) return null;

  // Check skip tag
  if (options.skipTag) {
    const tags = item.getTags();
    if (tags.some((t: any) => t.tag === options.skipTag)) {
      return {
        itemID: item.id,
        changed: false,
        changes: [],
      };
    }
  }

  const exceptions = options.exceptions ?? [];

  const changes: FieldChange[] = [];
  const fields: FieldInspection[] = [];

  for (const fieldName of PROCESS_FIELDS) {
    const group = getFieldGroup(fieldName);
    if (group === "skip") {
      if (options.verbose) {
        fields.push({ fieldName, group, reason: "skip-group" });
      }
      continue;
    }

    // Check per-group enable pref (if not explicitly overridden)
    if (!options.mode && !isGroupEnabled(group)) {
      if (options.verbose) {
        fields.push({ fieldName, group, reason: "group-disabled" });
      }
      continue;
    }

    let before: string;

    try {
      const val = item.getField(fieldName) as string | number | boolean | null;
      before = typeof val === "string" ? val : "";
    } catch {
      if (options.verbose) {
        fields.push({ fieldName, group, reason: "get-field-error" });
      }
      continue;
    }

    if (!before) {
      if (options.verbose) {
        fields.push({ fieldName, group, reason: "empty" });
      }
      continue;
    }

    const fieldMode = options.mode ?? getGroupMode(group);

    const result = normalizeValue({
      value: before,
      fieldName,
      mode: fieldMode,
      exceptions,
    });

    if (options.verbose) {
      fields.push({
        fieldName,
        group,
        before: result.before,
        after: result.after,
        reason: result.reason,
      });
    }

    if (result.changed) {
      changes.push({
        fieldName,
        before: result.before,
        after: result.after,
        reason: result.reason,
      });
    }
  }

  // Process creators
  if (options.processCreators) {
    try {
      const creatorChanges = await processCreators(item, {
        processSingleFieldCreators:
          options.creatorOptions?.processSingleFieldCreators ?? false,
        mode: options.creatorOptions?.mode ?? "name",
        exceptions,
        dryRun: options.dryRun ?? false,
      });

      for (const cc of creatorChanges) {
        changes.push({
          fieldName: `creator[${cc.index}].${cc.field}`,
          before: cc.before,
          after: cc.after,
          reason: "creator-normalized",
        });
      }
    } catch {
      if (options.verbose) {
        fields.push({
          fieldName: "creators",
          group: "creatorLike",
          reason: "process-error",
        });
      }
    }
  }

  if (!changes.length) {
    return {
      itemID: item.id,
      changed: false,
      changes: [],
      fields: options.verbose ? fields : undefined,
    };
  }

  // Apply changes (unless dry run)
  let saveError: string | undefined;
  if (!options.dryRun) {
    for (const change of changes) {
      try {
        if (change.fieldName.startsWith("creator[")) {
          // creatorProcessor already called setCreators
          continue;
        }
        item.setField(change.fieldName, change.after);
      } catch {
        // Skip fields that can't be set
      }
    }

    if (options.addTag) {
      try {
        item.addTag(options.addTag);
      } catch {
        // Skip tag errors
      }
    }

    try {
      await item.saveTx();
    } catch (e) {
      saveError = String(e);
    }
  }

  // Get title for display
  let title: string;
  try {
    title = item.getDisplayTitle() || `Item ${item.id}`;
  } catch {
    title = String(item.id);
  }

  return {
    itemID: item.id,
    itemKey: item.key,
    title,
    changed: true,
    changes,
    fields: options.verbose ? fields : undefined,
    saveError,
  };
}

export async function processSelectedItems(
  options: ProcessOptions,
): Promise<BatchReport> {
  const items = ztoolkit
    .getGlobal("ZoteroPane")
    .getSelectedItems() as Zotero.Item[];
  return processItems(items, options);
}

export async function processCollection(
  collectionID: number,
  options: ProcessOptions,
): Promise<BatchReport> {
  const collection = Zotero.Collections.get(collectionID);
  if (!collection) {
    return emptyBatchReport();
  }

  const itemIDs = collection.getChildItems();
  const items: Zotero.Item[] = [];
  for (const id of itemIDs) {
    try {
      // getChildItems may return item keys or IDs depending on collection type
      const item =
        typeof id === "number"
          ? Zotero.Items.get(id)
          : Zotero.Items.getByLibraryAndKey(0, String(id));
      if (item) items.push(item);
    } catch {
      // skip
    }
  }
  return processItems(items, options);
}

export async function processLibrary(
  libraryID: number,
  options: ProcessOptions,
): Promise<BatchReport> {
  const s = new Zotero.Search();
  s.addCondition("libraryID", "is", String(libraryID));
  s.addCondition("itemType", "isNot", "attachment");
  s.addCondition("itemType", "isNot", "note");

  const ids = await s.search();
  if (!ids) return emptyBatchReport();

  const items: Zotero.Item[] = [];
  for (const id of ids) {
    try {
      items.push(Zotero.Items.get(id as number));
    } catch {
      // skip
    }
  }
  return processItems(items, options);
}

let _lastReport: BatchReport | null = null;

export function getLastReport(): BatchReport | null {
  return _lastReport;
}

export function setLastReport(report: BatchReport): void {
  _lastReport = report;
}

export function clearLastReport(): void {
  _lastReport = null;
}

export async function processItems(
  items: Zotero.Item[],
  options: ProcessOptions,
): Promise<BatchReport> {
  const report: BatchReport = {
    total: items.length,
    processed: 0,
    skipped: 0,
    changed: 0,
    errors: 0,
    errorItems: [],
    changes: [],
    itemReports: [],
  };

  for (const item of items) {
    try {
      const result = await processItem(item, options);
      if (!result) {
        if (options.verbose) {
          report.itemReports.push({
            itemID: item.id,
            changed: false,
            changes: [],
            fields: [],
            skipReason: "non-regular-item",
          });
        }
        report.skipped++;
        continue;
      }
      report.processed++;
      if (result.changed) {
        report.changed++;
        report.changes.push(...result.changes);
      } else {
        report.skipped++;
      }
      if (options.verbose) {
        report.itemReports.push({
          itemID: result.itemID,
          itemKey: result.itemKey,
          title: result.title,
          changed: result.changed,
          changes: result.changes,
          fields: result.fields ?? [],
        });
      }
    } catch (e) {
      report.errors++;
      report.errorItems.push({
        itemID: item.id,
        error: String(e),
      });
      if (options.verbose) {
        report.itemReports.push({
          itemID: item.id,
          changed: false,
          changes: [],
          fields: [],
          error: String(e),
        });
      }
    }
  }

  if (options.verbose) {
    _lastReport = report;
  }

  return report;
}

function emptyBatchReport(): BatchReport {
  return {
    total: 0,
    processed: 0,
    skipped: 0,
    changed: 0,
    errors: 0,
    errorItems: [],
    changes: [],
    itemReports: [],
  };
}
