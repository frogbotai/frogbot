import { type lexicalHTMLField as upstreamLexicalHTMLField } from '@payloadcms/richtext-lexical';
import { convertLexicalToHTMLAsync } from '@payloadcms/richtext-lexical/html-async';
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical';
import type { Field, FieldHookArgs } from 'frogbot';

import { resolveConfig } from '../../../../../utilities/resolveConfig.js';
import { getFrogBotPopulateFn } from '../../../utilities/frogbotPopulateFn.js';

type Args = Parameters<typeof upstreamLexicalHTMLField>[0];
type AfterReadArgs = FieldHookArgs & {
  currentDepth?: number;
  depth?: number;
  draft?: boolean;
  showHiddenFields?: boolean;
};

export function lexicalHTMLField(args: Args): Field {
  const { converters, hidden = true, htmlFieldName, lexicalFieldName, storeInDB = false } = args;
  const afterRead = async ({
    currentDepth,
    depth,
    draft,
    overrideAccess,
    req,
    showHiddenFields,
    siblingData,
  }: AfterReadArgs) => {
    const data = siblingData[lexicalFieldName] as SerializedEditorState | undefined;

    if (!data) return '';

    const resolvedDepth = depth ?? (await resolveConfig(req.frogbot.config)).defaultDepth;
    const populate = await getFrogBotPopulateFn({
      currentDepth: currentDepth ?? 0,
      depth: resolvedDepth,
      draft: draft ?? false,
      overrideAccess: overrideAccess ?? false,
      req,
      showHiddenFields: showHiddenFields ?? false,
    });

    return convertLexicalToHTMLAsync({
      className: 'frogbot-richtext',
      converters,
      data,
      populate,
    });
  };
  const field: Field = {
    name: htmlFieldName,
    type: 'code',
    admin: { editorOptions: { language: 'html' }, hidden },
    hooks: { afterRead: [afterRead] },
  };

  if (!storeInDB) {
    field.hooks!.beforeChange = [
      ({ siblingData }) => {
        delete siblingData[htmlFieldName];

        return null;
      },
    ];
  }

  return field;
}
