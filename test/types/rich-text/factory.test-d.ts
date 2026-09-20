import {
  convertLexicalToMarkdown,
  editorConfigFactory,
  lexicalEditor,
  type SanitizedServerEditorConfig,
} from '@frogbotai/richtext-lexical';
import type { SerializedEditorState } from '@frogbotai/richtext-lexical/lexical';
import type { Field, FrogbotSanitizedConfig } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const config: Promise<FrogbotSanitizedConfig>;

const editorConfig = await editorConfigFactory.fromEditor({
  config,
  editor: lexicalEditor(),
});

expectTypeOf(editorConfig.resolvedFeatureMap).toBeObject();

declare const field: Extract<Field, { type: 'richText' }>;
declare const data: SerializedEditorState;

const fieldEditorConfig = editorConfigFactory.fromField({ field });

expectTypeOf(fieldEditorConfig).toEqualTypeOf<SanitizedServerEditorConfig>();

convertLexicalToMarkdown({ data, editorConfig: fieldEditorConfig });
