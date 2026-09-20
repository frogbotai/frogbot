import type {
  DefaultNodeTypes,
  LexicalEditorViewMap,
  SerializedBlockNode,
  ViewMapBlockComponentProps,
} from '@frogbotai/richtext-lexical/client';
import type { LexicalEditorViewMap as ReactLexicalEditorViewMap } from '@frogbotai/richtext-lexical/react';
import { expectTypeOf } from 'vitest';

expectTypeOf<LexicalEditorViewMap>().toMatchTypeOf<ReactLexicalEditorViewMap>();
expectTypeOf<DefaultNodeTypes>().toBeObject();
expectTypeOf<SerializedBlockNode>().toBeObject();
expectTypeOf<ViewMapBlockComponentProps>().toBeObject();
