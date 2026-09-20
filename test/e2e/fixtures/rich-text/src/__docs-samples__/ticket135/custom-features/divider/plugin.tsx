'use client';

import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
} from '@frogbotai/richtext-lexical/lexical';
import { useLexicalComposerContext } from '@frogbotai/richtext-lexical/lexical/react/LexicalComposerContext';
import { $insertNodeToNearestRoot } from '@frogbotai/richtext-lexical/lexical/utils';
import { useEffect } from 'react';

import { $createDividerNode } from './nodes/DividerNode';

export const INSERT_DIVIDER_COMMAND: LexicalCommand<void> = createCommand('INSERT_DIVIDER_COMMAND');

export function DividerPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        INSERT_DIVIDER_COMMAND,
        () => {
          const selection = $getSelection();

          if (!$isRangeSelection(selection)) {
            return false;
          }

          $insertNodeToNearestRoot($createDividerNode());

          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    [editor],
  );

  return null;
}
