import type { JSXConverterArgs, JSXConverters } from '@payloadcms/richtext-lexical/react';

import { MentionChip } from './node.js';
import type { SerializedMentionNode } from './shared.js';

/** JSX converter for `<RichText converters={...}>`: renders a mention as a chip with initials and the name. */
export const MentionJSXConverter: JSXConverters = {
  mention: ({ node }: JSXConverterArgs<SerializedMentionNode>) => (
    <span className="mention" data-id={String(node.value)}>
      <MentionChip label={node.label || String(node.value)} />
    </span>
  ),
};
