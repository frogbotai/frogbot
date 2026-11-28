import { defineErrors } from 'frogbot';

/** The block tools' error codes. */
export const blockError = defineErrors({
  'mcp.block-invalid': {
    status: 400,
    title: "The block edit doesn't fit the document.",
    hint: "Call listBlocks to see the document's block ids and field paths.",
  },
  'mcp.block-not-saved': {
    status: 409,
    title: "The block change didn't save.",
    hint: 'Call listBlocks to see the document now, then retry.',
    retryable: true,
  },
  'mcp.block-forbidden': {
    status: 403,
    title: "This caller can't edit these blocks.",
    hint: 'Edit blocks in a field this caller can update.',
  },
});
