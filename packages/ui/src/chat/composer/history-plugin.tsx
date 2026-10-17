'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import { COMMAND_PRIORITY_NORMAL, KEY_ARROW_DOWN_COMMAND, KEY_ARROW_UP_COMMAND } from 'lexical';
import { useEffect } from 'react';

import { useComposerEditor } from './context.js';
import { $caretOffset, $readPrompt, $writePrompt, emptyPrompt } from './prompt.js';

export function PromptHistoryPlugin() {
  const [editor] = useLexicalComposerContext();
  const context = useComposerEditor();

  useEffect(() => {
    let index = -1;

    const move = (event: KeyboardEvent | null, direction: 1 | -1) => {
      const history = context.current.history;

      if (!history || event?.altKey || event?.ctrlKey || event?.metaKey || event?.shiftKey) {
        return false;
      }

      const entries = history.entries();
      const { caret, text } = editor.getEditorState().read(() => ({
        caret: $caretOffset(),
        text: $readPrompt().text,
      }));

      const browsing = index >= 0;
      const atEdge = caret === 0 || caret === text.length;

      if (browsing ? !atEdge : direction === -1 || text.length > 0) return false;

      const next = index + direction;

      if (next >= entries.length || next < -1) return false;

      const prompt = next === -1 ? emptyPrompt : entries[next];

      if (!prompt) return false;

      event?.preventDefault();
      index = next;
      editor.update(() => $writePrompt(prompt), { tag: 'history-merge' });

      return true;
    };

    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => move(event, 1),
        COMMAND_PRIORITY_NORMAL,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => move(event, -1),
        COMMAND_PRIORITY_NORMAL,
      ),
      editor.registerTextContentListener((text) => {
        if (!text) index = -1;
      }),
    );
  }, [context, editor]);

  return null;
}
