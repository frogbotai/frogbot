import type { Field } from 'payload';
import { z } from 'zod';

const id = z.union([z.string(), z.number()]);

/**
 * The block tools' inputs. `collection` lists `choices` when there are any, so a client sees the
 * valid slugs in `tools/list`.
 */
export function blockInputs(choices: readonly string[]) {
  const [first, ...rest] = choices;
  const collection = (first === undefined ? z.string() : z.enum([first, ...rest])).describe(
    'The collection slug.',
  );

  const target = {
    collection,
    id: id.describe('The document id.'),
    locale: z.string().optional().describe('The locale to read and write, for localized fields.'),
  };

  const blockId = id.describe('The id of the block, from listBlocks.');

  return {
    target,
    blockId,
    write: {
      ...target,
      draft: z
        .boolean()
        .optional()
        .describe(
          'On a collection with drafts, save as a draft (the default) or pass false to publish. Ignored otherwise.',
        ),
    },
    position: {
      field: z
        .string()
        .optional()
        .describe(
          'The path of the blocks field, from listBlocks, such as layout or layout.2.columns.',
        ),
      index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('With field: the position in that field, from 0. Defaults to the end.'),
      before: blockId.optional().describe('Place it right before the block with this id.'),
      after: blockId.optional().describe('Place it right after the block with this id.'),
    },
  };
}

/** Whether config fields hold a blocks field, at any depth outside blocks. */
export function hasBlocks(fields: readonly Field[]): boolean {
  return fields.some((field) => {
    if (field.type === 'blocks') return true;

    if (field.type === 'tabs') return field.tabs.some((tab) => hasBlocks(tab.fields));

    return 'fields' in field && Array.isArray(field.fields) && hasBlocks(field.fields);
  });
}
