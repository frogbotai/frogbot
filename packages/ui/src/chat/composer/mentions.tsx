'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, $isTextNode } from 'lexical';

import { type MentionItem, type MentionSource, useComposerEditor } from './context.js';
import { $createMentionNode } from './mention-node.js';
import { ComposerMenu, type ComposerMenuItem } from './menu.js';

const MENTION = /(?:^|\s)@([^\s@]*)$/;

type MentionMenuItem = ComposerMenuItem & { source: MentionSource; item: MentionItem };

async function searchSources(
  sources: readonly MentionSource[],
  query: string,
  signal: AbortSignal,
) {
  const results = await Promise.allSettled(
    sources.map(async (source) => ({ source, items: await source.search(query, { signal }) })),
  );

  return results.flatMap((result) =>
    result.status === 'fulfilled'
      ? result.value.items.map((item): MentionMenuItem => ({
          key: `${result.value.source.id}:${item.id}`,
          label: item.label,
          description: item.description,
          icon: item.icon,
          group: result.value.source.id,
          source: result.value.source,
          item,
        }))
      : [],
  );
}

export function MentionsPlugin() {
  const [editor] = useLexicalComposerContext();
  const context = useComposerEditor();

  return (
    <ComposerMenu<MentionMenuItem>
      label="Mentions"
      match={({ before }) =>
        context.current.mentionSources?.length ? (MENTION.exec(before)?.[1] ?? null) : null
      }
      search={(query, signal) => searchSources(context.current.mentionSources ?? [], query, signal)}
      pick={({ source, item }, query) =>
        editor.update(() => {
          const selection = $getSelection();

          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

          const node = selection.anchor.getNode();
          const offset = selection.anchor.offset;
          const start = offset - query.length - 1;

          if (!$isTextNode(node) || start < 0) return;

          selection.setTextNodeRange(node, start, node, offset);

          const mention = $createMentionNode({
            source: source.id,
            id: item.id,
            label: item.label,
            ...(item.data ? { data: item.data } : {}),
          });

          selection.insertNodes([mention]);
          $getSelection()?.insertText(' ');
        })
      }
    />
  );
}
