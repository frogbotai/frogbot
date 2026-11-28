import { defineErrors } from 'frogbot';

/** The import and export plugin's error codes. */
export const importExportError = defineErrors({
  'import-export.unknown-import-collection': {
    status: 404,
    title: 'Unknown import collection.',
    hint: 'Send the request to an import collection the plugin added.',
  },
  'import-export.import-not-allowed': {
    status: 403,
    title: "This user can't import.",
    hint: 'Use an account that can create imports.',
    exit: 3,
  },
  'import-export.collection-not-importable': {
    status: 400,
    title: "This collection can't be imported here.",
    hint: 'Pick a collection from `data.allowed`, or one this import collection serves.',
    exit: 2,
  },
  'import-export.file-data-missing': {
    status: 400,
    title: 'No file data provided.',
    hint: 'Send the file base64-encoded as `fileData`.',
    exit: 2,
  },
  'import-export.unsupported-format': {
    status: 400,
    title: 'Unsupported file format.',
    hint: 'Send `format` as "csv" or "json".',
    exit: 2,
  },
  'import-export.file-unreadable': {
    status: 400,
    title: "The file couldn't be read.",
    hint: 'Fix the file named in `detail`, then send it again.',
    exit: 2,
  },
  'import-export.ai-model-missing': {
    status: 404,
    title: 'No AI model is configured.',
    hint: 'Set `ai.smallModel` or `ai.defaultModel` in the config.',
  },
  'import-export.ai-suggestion-failed': {
    status: 502,
    title: 'AI suggestion failed.',
    hint: 'Retry, or match the columns by hand. The server log has the model error.',
    retryable: true,
  },
  'import-export.collection-not-exportable': {
    status: 400,
    title: "This collection can't be exported here.",
    hint: 'Pick a collection this export collection serves.',
    exit: 2,
  },
  'import-export.export-not-allowed': {
    status: 403,
    title: "This user can't export this collection.",
    hint: 'Use an account that can read the collection.',
    exit: 3,
  },
});
