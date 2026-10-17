'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, PASTE_COMMAND } from 'lexical';
import { useEffect } from 'react';

import { useComposerEditor } from './context.js';

export const PASTE_ATTACHMENT_LENGTH = 650;

export function PastePlugin() {
  const [editor] = useLexicalComposerContext();
  const context = useComposerEditor();

  useEffect(
    () =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const attachments = context.current.attachments;
          const clipboard = 'clipboardData' in event ? event.clipboardData : null;

          if (!attachments || !clipboard) return false;

          const files = Array.from(clipboard.files ?? []);

          if (files.length > 0) {
            if (!attachments.storage) return false;

            event.preventDefault();
            attachments.add(files);

            return true;
          }

          const text = clipboard.getData('text/plain') || clipboard.getData('text');

          if (text.length <= PASTE_ATTACHMENT_LENGTH) return false;

          event.preventDefault();
          attachments.addPaste(text);

          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [context, editor],
  );

  return null;
}
