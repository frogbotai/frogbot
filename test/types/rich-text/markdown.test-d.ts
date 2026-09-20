import {
  convertLexicalToMarkdown,
  convertMarkdownToLexical,
  type SanitizedServerEditorConfig,
} from '@frogbotai/richtext-lexical';
import type {
  SerializedEditorState,
  SerializedLexicalNode,
} from '@frogbotai/richtext-lexical/lexical';
import { expectTypeOf } from 'vitest';

declare const data: SerializedEditorState;
declare const editorConfig: SanitizedServerEditorConfig;

const markdown = convertLexicalToMarkdown({ data, editorConfig });
const editorState = convertMarkdownToLexical({ editorConfig, markdown });
const typedEditorState = convertMarkdownToLexical<SerializedLexicalNode>({
  editorConfig,
  markdown,
});

expectTypeOf(markdown).toEqualTypeOf<string>();
expectTypeOf(editorState.root.children).toBeArray();
expectTypeOf(typedEditorState.root.children).toEqualTypeOf<SerializedLexicalNode[]>();
