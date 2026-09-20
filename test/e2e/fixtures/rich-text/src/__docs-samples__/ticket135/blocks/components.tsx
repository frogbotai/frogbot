'use client';

import type {
  LexicalBlockClientProps,
  LexicalBlockLabelClientProps,
  LexicalInlineBlockClientProps,
  LexicalInlineBlockLabelClientProps,
} from '@frogbotai/richtext-lexical';
import {
  BlockCollapsible,
  BlockEditButton,
  BlockRemoveButton,
  InlineBlockContainer,
  InlineBlockEditButton,
  InlineBlockLabel,
  InlineBlockRemoveButton,
} from '@frogbotai/richtext-lexical/client';
import { useFormFields } from '@frogbotai/ui';

export function BannerBlock(_props: LexicalBlockClientProps) {
  const content = useFormFields(([fields]) => fields.content?.value);
  const style = useFormFields(([fields]) => fields.style?.value);

  return (
    <BlockCollapsible removeButton={false}>
      <div
        style={{
          background: 'var(--theme-base-100)',
          border: '1px solid var(--theme-base-300)',
          borderRadius: 8,
          color: 'var(--theme-base-800)',
          padding: 16,
        }}
      >
        <strong>{String(style ?? 'info')} banner</strong>
        <p>{String(content ?? 'No content')}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <BlockEditButton />
          <BlockRemoveButton />
        </div>
      </div>
    </BlockCollapsible>
  );
}

export function MentionBlock(_props: LexicalInlineBlockClientProps) {
  return (
    <InlineBlockContainer>
      <InlineBlockLabel />
      <InlineBlockEditButton />
      <InlineBlockRemoveButton />
    </InlineBlockContainer>
  );
}

export function MentionBadge(_props: LexicalInlineBlockClientProps) {
  const username = useFormFields(([fields]) => fields.username?.value);

  return (
    <span
      style={{
        alignItems: 'center',
        background: 'var(--theme-base-150)',
        borderRadius: 12,
        color: 'var(--theme-base-800)',
        display: 'inline-flex',
        gap: 4,
        padding: '2px 8px',
      }}
    >
      @{String(username ?? 'username')}
      <InlineBlockEditButton />
      <InlineBlockRemoveButton />
    </span>
  );
}

export function BannerLabel(_props: LexicalBlockLabelClientProps) {
  const title = useFormFields(([fields]) => fields.title?.value);

  return <span>Banner: {String(title ?? 'Untitled')}</span>;
}

export function MentionLabel(_props: LexicalInlineBlockLabelClientProps) {
  const username = useFormFields(([fields]) => fields.username?.value);

  return <span>Mention: @{String(username ?? 'username')}</span>;
}
