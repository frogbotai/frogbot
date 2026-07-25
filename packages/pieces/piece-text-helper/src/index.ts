import * as textHelperModule from '@activepieces/piece-text-helper';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const textHelperActions = [
  'concat', 'replace', 'split', 'find', 'markdown_to_html', 'html_to_markdown', 'stripHtml', 'slugify',
  'defaultValue', 'json_to_ascii_table', 'extract_from_html',
] as const;

export const textHelper = createActivepiecesPiece({
  module: textHelperModule,
  service: 'text_helper',
  credentialType: 'none',
  defaultActions: textHelperActions,
});
