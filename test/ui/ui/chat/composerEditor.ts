import { act, fireEvent, screen } from '@testing-library/react';

import {
  $createMentionNode,
  type MentionValue,
} from '../../../../packages/ui/src/chat/composer/mention-node';
import {
  $readPrompt,
  $writePrompt,
  emptyPrompt,
} from '../../../../packages/ui/src/chat/composer/prompt';
import { $getRoot, type LexicalEditor } from '../../../../packages/ui/src/exports/lexical';

type EditorElement = HTMLElement & { __lexicalEditor?: LexicalEditor };

export function composerInput(name = 'Message') {
  return screen.getByRole('textbox', { name });
}

export function composerEditor(element: HTMLElement = composerInput()) {
  const editor = (element as EditorElement).__lexicalEditor;

  if (!editor) throw new Error('The element is not a Lexical editor root');

  return editor;
}

export function composerText(element: HTMLElement = composerInput()) {
  return composerEditor(element).getEditorState().read($readPrompt).text;
}

export function type(text: string, element: HTMLElement = composerInput()) {
  const editor = composerEditor(element);

  act(() => {
    editor.update(() => $getRoot().selectEnd().insertRawText(text), { discrete: true });
  });
}

export function insertMention(mention: MentionValue, element: HTMLElement = composerInput()) {
  const editor = composerEditor(element);

  act(() => {
    editor.update(
      () =>
        $getRoot()
          .selectEnd()
          .insertNodes([$createMentionNode(mention)]),
      {
        discrete: true,
      },
    );
  });
}

export function composerPrompt(element: HTMLElement = composerInput()) {
  return composerEditor(element).getEditorState().read($readPrompt);
}

export function clear(element: HTMLElement = composerInput()) {
  const editor = composerEditor(element);

  act(() => {
    editor.update(() => $writePrompt(emptyPrompt), { discrete: true });
  });
}

export function press(key: string, init: KeyboardEventInit = {}, element = composerInput()) {
  fireEvent.keyDown(element, { key, ...init });
}

export function paste(clipboardData: Partial<DataTransfer>, element = composerInput()) {
  return fireEvent.paste(element, { clipboardData });
}
