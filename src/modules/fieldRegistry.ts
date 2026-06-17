export type NormalizeGroup =
  | "titleLike"
  | "publicationLike"
  | "publisherLike"
  | "placeLike"
  | "identifierLike"
  | "creatorLike"
  | "skip";

export type CaseMode = "upper" | "lower" | "title" | "sentence" | "smart";

export const FIELD_GROUPS: Record<string, NormalizeGroup> = {
  title: "titleLike",
  shortTitle: "titleLike",
  bookTitle: "titleLike",
  seriesTitle: "titleLike",
  encyclopediaTitle: "titleLike",
  dictionaryTitle: "titleLike",

  publicationTitle: "publicationLike",
  journalAbbreviation: "publicationLike",
  conferenceName: "publicationLike",
  proceedingsTitle: "publicationLike",

  publisher: "publisherLike",
  distributor: "publisherLike",
  institution: "publisherLike",
  university: "publisherLike",
  archive: "publisherLike",
  libraryCatalog: "publisherLike",

  place: "placeLike",
  archiveLocation: "placeLike",

  DOI: "identifierLike",
  ISBN: "identifierLike",
  ISSN: "identifierLike",
  url: "identifierLike",
};

export const DEFAULT_MODE: Record<NormalizeGroup, CaseMode> = {
  titleLike: "sentence",
  publicationLike: "title",
  publisherLike: "title",
  placeLike: "title",
  identifierLike: "smart",
  creatorLike: "smart",
  skip: "smart",
};

export function getFieldGroup(fieldName: string): NormalizeGroup {
  return FIELD_GROUPS[fieldName] ?? "skip";
}

export const ENABLED_FIELDS = Object.keys(FIELD_GROUPS);
