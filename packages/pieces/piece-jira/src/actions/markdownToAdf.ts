import { z } from 'zod';

import { adfDoc, markdownToAdf as convert } from '../adf.js';
import { defineAction } from '../define.js';

export const markdownToAdf = defineAction({
  slug: 'markdownToAdf',
  description:
    "Convert markdown to Jira's ADF. Not needed before writing: rich-text inputs take markdown directly.",
  input: z.object({ markdown: z.string() }),
  output: adfDoc,
  idempotent: true,
  run({ input }) {
    return Promise.resolve(convert(input.markdown));
  },
});
