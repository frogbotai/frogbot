import type { TypedEditorState } from '@frogbotai/richtext-lexical';

import type { PostNodeTypes } from './views';

export type Post = {
  content?: TypedEditorState<PostNodeTypes> | null;
};
