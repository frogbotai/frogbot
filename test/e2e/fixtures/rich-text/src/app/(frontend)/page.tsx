import config from '@frogbot-config';
import type { SerializedEditorState } from '@frogbotai/richtext-lexical/lexical';
import { RichText } from '@frogbotai/richtext-lexical/react';
import { getFrogbot } from 'frogbot';

export const dynamic = 'force-dynamic';

const converters = ({ defaultConverters }: any) => ({
  ...defaultConverters,
  blocks: {
    callout: ({ node }: any) => (
      <aside data-testid="rendered-callout">
        <h2>{node.fields.title}</h2>
        <RichText converters={converters} data={node.fields.body} />
      </aside>
    ),
  },
  inlineBlocks: {
    inlineBadge: ({ node }: any) => (
      <span data-testid="rendered-inline-badge">{node.fields.label}</span>
    ),
  },
});

export default async function Page() {
  const frogbot = await getFrogbot({ config });
  const posts = await frogbot.find({ collection: 'posts', limit: 1, sort: '-createdAt' });
  const post = posts.docs[0];

  if (!post) return <main data-testid="empty-post">No post saved</main>;

  return (
    <main>
      <h1>{typeof post.title === 'string' ? post.title : ''}</h1>
      <article data-testid="rendered-rich-text">
        <RichText converters={converters} data={post.content as SerializedEditorState} />
      </article>
    </main>
  );
}
