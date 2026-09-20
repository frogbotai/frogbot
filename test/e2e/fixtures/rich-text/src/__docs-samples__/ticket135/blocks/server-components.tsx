import type {
  LexicalBlockLabelServerProps,
  LexicalBlockServerProps,
  LexicalInlineBlockLabelServerProps,
  LexicalInlineBlockServerProps,
} from '@frogbotai/richtext-lexical';

export async function BannerBlock({ path, req }: LexicalBlockServerProps) {
  const currentUser = req.user;
  const files = await req.frogbot.find({
    collection: 'files',
    limit: 1,
    req,
  });

  return (
    <section>
      <strong>{String(currentUser?.email ?? 'Editor')}</strong>
      <span>{files.totalDocs} files available</span>
      <span>Editing {path}</span>
    </section>
  );
}

export function BannerLabel(_props: LexicalBlockLabelServerProps) {
  return <span>Banner</span>;
}

export function InlineBlock(_props: LexicalInlineBlockServerProps) {
  return <span>Mention</span>;
}

export function InlineBlockLabel(_props: LexicalInlineBlockLabelServerProps) {
  return <span>Mention label</span>;
}
