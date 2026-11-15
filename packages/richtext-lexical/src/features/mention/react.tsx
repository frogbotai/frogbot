import type { JSXConverterArgs, JSXConverters } from '@payloadcms/richtext-lexical/react';

import { mentionText, type SerializedMentionNode } from './shared.js';

/** JSX converter for `<RichText converters={...}>`: renders a mention as `@Sam`. */
export const MentionJSXConverter: JSXConverters = {
  mention: ({ node }: JSXConverterArgs<SerializedMentionNode>) => (
    <span className="mention" data-id={String(node.value)}>
      {mentionText(node)}
    </span>
  ),
};
