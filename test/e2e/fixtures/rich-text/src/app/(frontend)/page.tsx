import config from '@frogbot-config';
import type { SerializedEditorState } from '@frogbotai/richtext-lexical/lexical';
import {
  type DefaultNodeTypes,
  type JSXConvertersFunction,
  RichText,
  type SerializedBlockNode,
  type SerializedInlineBlockNode,
} from '@frogbotai/richtext-lexical/react';
import { getFrogbot } from 'frogbot';

import type { Post } from '../../__docs-samples__/ticket135/views/frogbot-types';
import { PostBody } from '../../__docs-samples__/ticket135/views/PostBody';

export const dynamic = 'force-dynamic';

type CalloutNode = SerializedBlockNode<{
  blockType: 'callout';
  body: SerializedEditorState;
  title: string;
}>;

type InlineBadgeNode = SerializedInlineBlockNode<{
  blockType: 'inlineBadge';
  label: string;
}>;

type FrontendNodeTypes = DefaultNodeTypes | CalloutNode | InlineBadgeNode;

const converters: JSXConvertersFunction<FrontendNodeTypes> = ({ defaultConverters }) => ({
  ...defaultConverters,
  blocks: {
    callout: ({ node }) => (
      <aside data-testid="rendered-callout">
        <h2>{node.fields.title}</h2>
        <RichText converters={converters} data={node.fields.body} />
      </aside>
    ),
  },
  inlineBlocks: {
    inlineBadge: ({ node }) => <span data-testid="rendered-inline-badge">{node.fields.label}</span>,
  },
});

function hasEditorState(value: unknown): value is SerializedEditorState<FrontendNodeTypes> {
  return typeof value === 'object' && value !== null && 'root' in value;
}

function hasPostContent(value: unknown): value is NonNullable<Post['content']> {
  return typeof value === 'object' && value !== null && 'root' in value;
}

export default async function Page() {
  const frogbot = await getFrogbot({ config });
  const posts = await frogbot.find({ collection: 'posts', limit: 1, sort: '-createdAt' });
  const post = posts.docs[0];

  if (!post) return <main data-testid="empty-post">No post saved</main>;

  return (
    <main>
      <h1>{typeof post.title === 'string' ? post.title : ''}</h1>
      <article data-testid="rendered-rich-text">
        {hasEditorState(post.content) ? (
          <RichText converters={converters} data={post.content} />
        ) : null}
      </article>
      <article data-testid="rendered-view-content">
        <PostBody content={hasPostContent(post.viewContent) ? post.viewContent : null} />
      </article>
    </main>
  );
}
