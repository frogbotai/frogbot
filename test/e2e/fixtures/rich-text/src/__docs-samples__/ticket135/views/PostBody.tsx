'use client';

import { RichText } from '@frogbotai/richtext-lexical/react';

import type { Post } from './frogbot-types';
import { postViews } from './views';

export function PostBody({ content }: { content: Post['content'] }) {
  if (!content) {
    return null;
  }

  return <RichText data={content} nodeMap={postViews.preview.nodes} />;
}
