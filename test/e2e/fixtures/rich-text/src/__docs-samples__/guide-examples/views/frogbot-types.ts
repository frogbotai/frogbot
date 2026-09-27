import type { SerializedEditorState } from '@frogbotai/richtext-lexical/lexical';

import type { PostNodeTypes } from './views';

export type Post = {
  content?: SerializedEditorState<PostNodeTypes> | null;
};
