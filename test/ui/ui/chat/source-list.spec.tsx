import { render, screen, within } from '@testing-library/react';
import type { UIMessage } from 'ai';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { MessageList } from '../../../../packages/ui/src/chat/message-list';
import { MessagePart } from '../../../../packages/ui/src/chat/message-part';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import { SourceList } from '../../../../packages/ui/src/chat/source-list';

const adapter = { loadManifest: () => new Promise(() => undefined) } as never;
const sourceHref = ({ collection, id }: { collection: string; id: number | string }) =>
  `/admin/collections/${collection}/${id}`;

function withHref(children: ReactNode) {
  return (
    <ChatProvider adapter={adapter} sourceHref={sourceHref}>
      {children}
    </ChatProvider>
  );
}

const refunds = {
  type: 'source-document',
  sourceId: 'articles:12',
  mediaType: 'application/json',
  title: 'Refund policy',
  providerMetadata: { frogbot: { collection: 'articles', id: 12 } },
} as const;

const web = {
  type: 'source-url',
  sourceId: 'web-1',
  url: 'https://example.com/shipping',
  title: 'Shipping times',
} as const;

const answer: UIMessage = {
  id: 'a1',
  role: 'assistant',
  parts: [
    {
      type: 'dynamic-tool',
      toolName: 'search_articles',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { query: 'refunds' },
      output: { hits: [{ id: 12, score: 1 }] },
    },
    refunds,
    { type: 'text', text: 'Refunds take five days.' },
    web,
  ],
};

describe('SourceList', () => {
  it("links a tool's record to the href the provider gives", () => {
    render(withHref(<SourceList parts={[refunds]} />));

    expect(screen.getByRole('link', { name: 'Refund policy' }).getAttribute('href')).toBe(
      '/admin/collections/articles/12',
    );
  });

  it('shows the title as text without a sourceHref or a record', () => {
    const { container } = render(
      <SourceList
        parts={[
          refunds,
          { type: 'source-document', sourceId: 'doc', mediaType: 'text/plain', title: 'Manual' },
        ]}
      />,
    );

    expect(screen.getByText('Refund policy').tagName).toBe('SPAN');
    expect(screen.getByText('Manual').tagName).toBe('SPAN');
    expect(container.querySelectorAll('[data-part="sources"] li')).toHaveLength(2);
  });

  it('renders nothing without sources', () => {
    const { container } = render(<SourceList parts={[{ type: 'text', text: 'Hi' }]} />);

    expect(container.innerHTML).toBe('');
  });

  it('lists the sources after the answer, outside the tool card, with web sources', () => {
    const { container } = render(withHref(<MessageList messages={[answer]} />));
    const list = container.querySelector<HTMLElement>('[data-part="sources"]')!;

    expect(list).toBeTruthy();
    expect(list.closest('.fb-tool-card')).toBeNull();
    expect(container.querySelectorAll('[data-part="sources"]')).toHaveLength(1);
    expect(
      screen.getByText('Refunds take five days.').compareDocumentPosition(list) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Refund policy', 'Shipping times']);
  });

  it('shows no list for a message without sources', () => {
    const { container } = render(
      <MessageList
        messages={[{ id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] }]}
      />,
    );

    expect(container.querySelector('[data-part="sources"]')).toBeNull();
  });
});

describe('MessagePart', () => {
  it('leaves source parts to the source list', () => {
    const { container } = render(
      <>
        <MessagePart part={refunds} />
        <MessagePart part={web} />
      </>,
    );

    expect(container.innerHTML).toBe('');
  });
});
