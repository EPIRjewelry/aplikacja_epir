/**
 * Minimalne typy struktury Google Docs API (documents.get) — tylko pola używane przez konwerter.
 * @see https://developers.google.com/docs/api/reference/rest/v1/documents
 */

export type DocsTextStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  link?: { url?: string };
};

export type DocsTextRun = {
  content?: string;
  textStyle?: DocsTextStyle;
};

export type DocsParagraphElement = {
  textRun?: DocsTextRun;
  inlineObjectElement?: unknown;
  equation?: unknown;
};

export type DocsParagraphStyle = {
  namedStyleType?: string;
  headingId?: string;
  bullet?: {
    listId?: string;
    nestingLevel?: number;
  };
};

export type DocsParagraph = {
  elements?: DocsParagraphElement[];
  paragraphStyle?: DocsParagraphStyle;
};

export type DocsTableCell = {
  content?: DocsStructuralElement[];
};

export type DocsTableRow = {
  tableCells?: DocsTableCell[];
};

export type DocsTable = {
  tableRows?: DocsTableRow[];
};

export type DocsStructuralElement = {
  paragraph?: DocsParagraph;
  table?: DocsTable;
  sectionBreak?: unknown;
  tableOfContents?: unknown;
};

export type GoogleDocument = {
  title?: string;
  documentId?: string;
  body?: { content?: DocsStructuralElement[] };
};
