import { render, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessageList } from '../../../../packages/ui/src/chat/message-list';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import { SourceList } from '../../../../packages/ui/src/chat/source-list';

const adapter = { loadManifest: () => new Promise(() => undefined) } as never;
const sourceHref = ({ collection, id }: { collection: string; id: number | string }) =>
  `/admin/collections/${collection}/${id}`;

const record = (id: number | string, title: string) => ({
  type: 'source-document' as const,
  sourceId: `articles:${id}`,
  mediaType: 'application/json',
  title,
  providerMetadata: { frogbot: { collection: 'articles', id } },
});

const answer: UIMessage = {
  id: 'a1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-search_articles_content',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { query: 'frogs' },
      output: { hits: [{ id: 1, score: 1 }] },
    },
    record(1, 'Frog care'),
    record('b 2', 'Pond tips'),
    { type: 'text', text: 'Frogs need clean water.' },
  ],
};

describe('SourceList', () => {
  it('links record sources to the href the provider builds', () => {
    render(
      <ChatProvider adapter={adapter} sourceHref={sourceHref}>
        <SourceList parts={[record(1, 'Frog care')]} />
      </ChatProvider>,
    );

    expect(screen.getByRole('link', { name: 'Frog care' }).getAttribute('href')).toBe(
      '/admin/collections/articles/1',
    );
  });

  it('shows record sources as text without an href builder', () => {
    render(<SourceList parts={[record(1, 'Frog care')]} />);

    expect(screen.getByText('Frog care').tagName).toBe('SPAN');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a document source without a record as text even with an href builder', () => {
    render(
      <ChatProvider adapter={adapter} sourceHref={sourceHref}>
        <SourceList
          parts={[
            { type: 'source-document', sourceId: 'd', mediaType: 'application/pdf', title: 'Doc' },
          ]}
        />
      </ChatProvider>,
    );

    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders nothing for a message without sources', () => {
    const { container } = render(<SourceList parts={[{ type: 'text' }]} />);

    expect(container.innerHTML).toBe('');
  });

  it('puts web and record sources in one list', () => {
    const { container } = render(
      <SourceList
        parts={[
          { type: 'source-url', sourceId: 'u', url: 'https://frogs.example', title: 'Frogs' },
          record(1, 'Frog care'),
        ]}
      />,
    );

    expect(container.querySelectorAll('[data-part="sources"] > li')).toHaveLength(2);
  });

  it('lists sources once, after the answer text and outside the tool card', () => {
    const { container } = render(
      <ChatProvider adapter={adapter} sourceHref={sourceHref}>
        <MessageList messages={[answer]} />
      </ChatProvider>,
    );

    const lists = container.querySelectorAll('[data-part="sources"]');
    const text = screen.getByText('Frogs need clean water.');

    expect(lists).toHaveLength(1);
    expect(lists[0].closest('.fb-tool-card')).toBeNull();
    expect(text.compareDocumentPosition(lists[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      [...lists[0].querySelectorAll('a')].map((link) => [
        link.textContent,
        link.getAttribute('href'),
      ]),
    ).toEqual([
      ['Frog care', '/admin/collections/articles/1'],
      ['Pond tips', '/admin/collections/articles/b 2'],
    ]);
  });
});
