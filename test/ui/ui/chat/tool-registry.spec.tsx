import { fireEvent, render, screen } from '@testing-library/react';
import { isToolUIPart, readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import { assert, describe, expect, it } from 'vitest';

import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import { ToolPart } from '../../../../packages/ui/src/chat/tool-part';
import {
  resolveToolRenderer,
  type ToolRenderer,
} from '../../../../packages/ui/src/chat/tool-registry';

const First = () => <div>first</div>;
const Second = () => <div>second</div>;

describe('tool registry', () => {
  it('resolves the first exact registration', () => {
    const renderers: ToolRenderer[] = [
      { kind: 'search', render: First },
      { kind: 'search', render: Second },
    ];

    expect(resolveToolRenderer(renderers, 'search')?.render).toBe(First);
    expect(resolveToolRenderer(renderers, 'Search')).toBeUndefined();
  });

  it('renders unknown tools with the generic fallback', () => {
    render(
      <ToolPart
        part={{
          type: 'dynamic-tool',
          toolName: 'external',
          toolCallId: '1',
          state: 'input-available',
          input: { query: 'frog' },
        }}
      />,
    );

    expect(screen.getByText('external')).toBeTruthy();
    expect(screen.getByText(/frog/)).toBeTruthy();
  });

  it('can add and remove direct renderers without changing provider hook order', () => {
    const part = {
      type: 'dynamic-tool' as const,
      toolName: 'search',
      toolCallId: '1',
      state: 'input-available' as const,
      input: {},
    };

    const { rerender } = render(
      <ToolPart part={part} renderers={[{ kind: 'search', render: First }]} />,
    );

    expect(screen.getByText('first')).toBeTruthy();

    rerender(<ToolPart part={part} />);

    expect(screen.getByText('search')).toBeTruthy();
  });

  it('starts closed as a card with the name, input summary and status, and opens to input and output', () => {
    const { container } = render(
      <ToolPart
        part={{
          type: 'dynamic-tool',
          toolName: 'snapshot',
          toolCallId: '1',
          state: 'output-available',
          input: {
            url: 'https://frog.example',
            depth: 2,
            full: true,
            tags: ['a'],
            tab: 'main',
            x: 1,
          },
          output: 'x'.repeat(30_000),
        }}
      />,
    );

    const root = container.querySelector('[data-part="tool"]') as HTMLElement;
    const trigger = screen.getByRole('button', { name: /snapshot/ });

    expect(root.dataset.state).toBe('output-available');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(root.classList).toContain('fb-tool-card');
    expect(root.dataset.status).toBe('done');
    expect(container.querySelector('.fb-tool-card__title')?.textContent).toBe('snapshot');
    expect(container.querySelector('.fb-tool-card__subtitle')?.textContent).toBe(
      'https://frog.example depth=2 full=true tab=main',
    );
    expect(container.querySelector('.fb-tool-card__icon--done .lucide-wrench-icon')).toBeTruthy();
    expect(screen.queryByText('x'.repeat(30_000))).toBeNull();

    fireEvent.click(trigger);

    const blocks = [...container.querySelectorAll('.fb-tool-part__body pre')];

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(JSON.parse(blocks[0].textContent)).toMatchObject({ url: 'https://frog.example' });
    expect(blocks[1].textContent).toBe('x'.repeat(30_000));
  });

  it.each(['input-streaming', 'input-available'] as const)('shows a spinner while %s', (state) => {
    render(
      <ToolPart
        part={{ type: 'dynamic-tool', toolName: 'search', toolCallId: '1', state, input: {} }}
      />,
    );

    expect(screen.getByLabelText('Running')).toBeTruthy();
  });

  it('shows Failed and Denied with the error or reason in the body', () => {
    const { rerender } = render(
      <ToolPart
        part={{
          type: 'dynamic-tool',
          toolName: 'search',
          toolCallId: '1',
          state: 'output-error',
          input: { query: 'frog' },
          errorText: 'Rate limited',
        }}
      />,
    );

    expect(screen.getByText('Failed: search')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /search/ }));

    expect(screen.getByText('Rate limited')).toBeTruthy();

    rerender(
      <ToolPart
        part={{
          type: 'dynamic-tool',
          toolName: 'search',
          toolCallId: '1',
          state: 'output-denied',
          input: { query: 'frog' },
          approval: { id: 'a', approved: false, reason: 'Not now' },
        }}
      />,
    );

    expect(screen.getByText('Denied: search')).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
  });

  it('shows Denied for a stream that denies a call without an approval request', async () => {
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start', messageId: 'm' });

        controller.enqueue({
          type: 'tool-input-available',
          toolCallId: '1',
          toolName: 'search',
          input: { query: 'frog' },
          dynamic: true,
        });

        controller.enqueue({ type: 'tool-output-denied', toolCallId: '1' });
        controller.close();
      },
    });

    let message: UIMessage | undefined;

    for await (const next of readUIMessageStream({ stream })) message = next;

    const part = message?.parts.find(isToolUIPart);

    assert(part);

    expect(part.state).toBe('output-denied');
    expect(part).not.toHaveProperty('approval');

    render(<ToolPart part={part} />);
    fireEvent.click(screen.getByRole('button', { name: /search/ }));

    expect(screen.getByText('Denied: search')).toBeTruthy();
    expect(screen.getByText('Denied')).toBeTruthy();
  });

  it('renders MCP content in order: text, PNG images as data URLs, other items and keys as JSON', () => {
    const { container } = render(
      <ToolPart
        part={{
          type: 'dynamic-tool',
          toolName: 'screenshot',
          toolCallId: '1',
          state: 'output-available',
          input: {},
          output: {
            content: [
              { type: 'text', text: 'Captured' },
              { type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' },
              { type: 'image', data: 'JVBERi0=', mimeType: 'application/pdf' },
            ],
            isError: false,
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /screenshot/ }));

    const body = container.querySelector('.fb-tool-card__body .fb-tool-part__body') as HTMLElement;
    const images = body.querySelectorAll('img');

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect([...body.children].map((child) => child.tagName)).toEqual([
      'PRE',
      'PRE',
      'IMG',
      'PRE',
      'PRE',
    ]);
    expect(body.children[1].textContent).toBe('Captured');
    expect(JSON.parse(body.children[3].textContent)).toEqual({
      type: 'image',
      data: 'JVBERi0=',
      mimeType: 'application/pdf',
    });
    expect(JSON.parse(body.children[4].textContent)).toEqual({ isError: false });
  });

  it('lets a registered renderer win over the fallback', () => {
    render(
      <ChatProvider
        adapter={{ loadManifest: () => new Promise(() => undefined) } as never}
        toolRenderers={[{ kind: 'snapshot', render: First }]}
      >
        <ToolPart
          part={{
            type: 'dynamic-tool',
            toolName: 'snapshot',
            toolCallId: '1',
            state: 'output-available',
            input: {},
            output: 'page',
          }}
        />
      </ChatProvider>,
    );

    expect(screen.getByText('first')).toBeTruthy();
    expect(document.querySelector('[data-part="tool"]')).toBeNull();
  });
});
