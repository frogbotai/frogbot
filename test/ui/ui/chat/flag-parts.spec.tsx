import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { validateChatMessages } from '../../../../packages/frogbot/src/chat/validateMessages';
import { MessagePart } from '../../../../packages/ui/src/chat/message-part';

async function loadFlagParts() {
  return import('../../../../packages/ui/src/chat/flag-parts');
}

describe('flag parts', () => {
  it('renders pasted text instead of the JSON fallback', async () => {
    const { renderFlagPart } = await loadFlagParts();
    const { container } = render(
      <MessagePart
        part={{ type: 'data-paste', data: { text: 'Pasted content' } }}
        renderData={renderFlagPart}
      />,
    );

    expect(screen.getByText('Pasted content')).toBeTruthy();
    expect(screen.getByText('PASTED')).toBeTruthy();
    expect(container.querySelector('pre')).toBeNull();
  });

  it('renders a legacy inline paste as a text card that opens', async () => {
    const user = userEvent.setup();
    const { renderFlagPart } = await loadFlagParts();

    render(
      <MessagePart
        part={{ type: 'data-paste', data: { text: 'Pasted content', filename: 'pasted-1.txt' } }}
        renderData={renderFlagPart}
      />,
    );

    expect(screen.getByRole('group', { name: 'Pasted text, PASTED, ready' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Open Pasted text' }));

    expect(screen.getByRole('dialog', { name: 'Pasted text' })).toBeTruthy();
    expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe('Pasted content');
  });

  it('renders paste, page context, and prompt data distinctly', async () => {
    const { renderFlagPart } = await loadFlagParts();
    const { rerender } = render(
      <MessagePart
        part={{ type: 'data-paste', data: { text: 'Pasted content' } }}
        renderData={renderFlagPart}
      />,
    );

    expect(screen.getByTestId('attachment-card').dataset.state).toBe('text');

    rerender(
      <MessagePart
        part={{
          type: 'data-page-context',
          data: { tabId: 1, url: 'https://example.com', title: 'Example', content: 'Page content' },
        }}
        renderData={renderFlagPart}
      />,
    );

    expect(screen.getByTestId('data-page-context')).toBeTruthy();

    rerender(
      <MessagePart
        part={{ type: 'data-prompt', data: { id: 'prompt-1', title: 'Reusable prompt' } }}
        renderData={renderFlagPart}
      />,
    );

    expect(screen.getByTestId('data-prompt')).toBeTruthy();
  });

  it('renders its BEM inventory', async () => {
    const { renderFlagPart } = await loadFlagParts();
    const { rerender } = render(
      <MessagePart
        part={{ type: 'data-paste', data: { text: 'Pasted content' } }}
        renderData={renderFlagPart}
      />,
    );

    expect(screen.getByTestId('attachment-card').className).toBe(
      'fb-attachment-card fb-attachment-card--text',
    );
    expect(screen.getByText('Pasted content').className).toBe('fb-attachment-card__snippet');
    expect(screen.getByText('PASTED').className).toBe('fb-attachment-card__tag');

    rerender(
      <MessagePart
        part={{
          type: 'data-page-context',
          data: {
            tabId: 1,
            url: 'https://example.com',
            title: 'Example',
            content: 'Page content',
            favicon: '/favicon.ico',
          },
        }}
        renderData={renderFlagPart}
      />,
    );

    expect(screen.getByTestId('data-page-context').className).toBe(
      'fb-flag-part fb-flag-part--page-context',
    );
    expect(screen.getByText('Example').parentElement?.className).toBe('fb-flag-part__header');
    expect(screen.getByRole('presentation').className).toBe('fb-flag-part__favicon');
    expect(screen.getByRole('link').className).toBe('fb-flag-part__url');
    expect(screen.getByText('Page content').className).toBe('fb-flag-part__content');

    rerender(
      <MessagePart
        part={{ type: 'data-prompt', data: { id: 'prompt-1', title: 'Reusable prompt' } }}
        renderData={renderFlagPart}
      />,
    );

    expect(screen.getByTestId('data-prompt').className).toBe('fb-flag-part fb-flag-part--prompt');
    expect(screen.getByText('Reusable prompt').className).toBe(
      'fb-flag-part__preview fb-flag-part__preview--prompt',
    );
    expect(screen.getByText('PROMPT').className).toBe('fb-flag-part__label');
  });

  it('preserves data-paste while stripping unknown standard-part fields', async () => {
    const { renderFlagPart } = await loadFlagParts();

    expect(renderFlagPart).toBeTypeOf('function');

    const paste = {
      type: 'data-paste' as const,
      data: { text: 'Pasted content', filename: 'pasted.txt' },
    };

    const flaggedText = { type: 'text' as const, text: 'x', flag: 'paste' };
    const messages = await validateChatMessages([
      { id: 'paste', role: 'user', parts: [paste] },
      { id: 'text', role: 'user', parts: [flaggedText] },
    ]);

    expect(messages[0]?.parts[0]).toEqual(paste);
    expect(messages[1]?.parts[0]).toEqual({ type: 'text', text: 'x' });
  });
});
