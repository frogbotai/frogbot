'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

import { useComposerEditor } from './context.js';

/** Whether a key event belongs to an IME composition; Safari sends Enter as 229 after `compositionend`. */
export function composing(event: KeyboardEvent | null) {
  return Boolean(event && (event.isComposing || event.keyCode === 229));
}

export function KeybindingsPlugin() {
  const [editor] = useLexicalComposerContext();
  const context = useComposerEditor();

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) => {
            if (event?.shiftKey || composing(event) || editor.isComposing()) return false;

            event?.preventDefault();
            context.current.submit();

            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_ESCAPE_COMMAND,
          (event) => {
            if (!context.current.escape()) return false;

            event.preventDefault();

            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          (event) => {
            const ctrlG =
              event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              !event.shiftKey &&
              event.key.toLowerCase() === 'g';

            if (!ctrlG || !context.current.escape()) return false;

            event.preventDefault();

            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [context, editor],
  );

  return null;
}
