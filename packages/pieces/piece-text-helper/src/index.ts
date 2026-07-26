import * as textHelperModule from '@activepieces/piece-text-helper';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const textHelperActions = [
  'concat', 'replace', 'split', 'find', 'markdown_to_html', 'html_to_markdown', 'stripHtml', 'slugify',
  'defaultValue', 'json_to_ascii_table', 'extract_from_html',
] as const;
export const textHelperScopes = [] as const;

export function createTextHelper(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: textHelperModule,
    service: "text_helper",
    credentialType: "none",
    defaultActions: textHelperActions,
    scopes: textHelperScopes,
    config,
  });
  return Object.assign(piece, {
    /** Concatenate: Concatenate two or more texts */
    concat: piece.tool("concat"),
    /** Replace: Replaces all instances of any word, character or phrase in text, with another. */
    replace: piece.tool("replace"),
    /** Split: Split a text by a delimiter */
    split: piece.tool("split"),
    /** Find: Find substring (Regex or Text). */
    find: piece.tool("find"),
    /** Markdown to HTML: Convert markdown to HTML */
    markdownToHtml: piece.tool("markdown_to_html"),
    /** HTML to Markdown: Convert HTML to Markdown */
    htmlToMarkdown: piece.tool("html_to_markdown"),
    /** Remove HTML Tags: Removes every HTML tag and returns plain text */
    stripHtml: piece.tool("stripHtml"),
    /** Slugify: Slugifies strings. */
    slugify: piece.tool("slugify"),
    /** Use Default Value if Input is Empty: Checks your input and returns the default value, if the input is an empty text or list */
    defaultValue: piece.tool("defaultValue"),
    /** List to Text Table: Convert a list of items to a text table */
    jsonToAsciiTable: piece.tool("json_to_ascii_table"),
    /** Extract from HTML: Extract specific elements or data from an HTML document. */
    extractFromHtml: piece.tool("extract_from_html"),
  });
}
