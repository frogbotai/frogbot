import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ChatPlatformAdapter } from '../../../../packages/ui/src/chat/adapter';
import { ArtifactProvider } from '../../../../packages/ui/src/chat/artifact';
import type { DataRenderer } from '../../../../packages/ui/src/chat/data-part';
import { isFlagPart, renderFlagPart } from '../../../../packages/ui/src/chat/flag-parts';
import { MessagePart, type MessagePartValue } from '../../../../packages/ui/src/chat/message-part';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import { CompactionPart } from '../../../../packages/ui/src/exports/chat';

const adapter = {
  loadManifest: () => new Promise(() => undefined),
} as unknown as ChatPlatformAdapter;

function renderWith(dataRenderers: readonly DataRenderer[], part: MessagePartValue) {
  return render(
    <ChatProvider adapter={adapter} dataRenderers={dataRenderers}>
      <MessagePart part={part} renderData={isFlagPart(part) ? renderFlagPart : undefined} />
    </ChatProvider>,
  );
}

function compaction(data: unknown): MessagePartValue {
  return { type: 'data-compaction', data };
}

describe('data and boundary parts', () => {
  it('renders data by default or through a consumer renderer', () => {
    const part = { type: 'data-weather' as const, data: { temperature: 72 } };
    const { rerender } = render(<MessagePart part={part} />);

    expect(screen.getByText(/"temperature": 72/).className).toBe('fb-data-part');

    rerender(
      <MessagePart
        part={part}
        renderData={({ data }) => (
          <span>{String((data as { temperature: number }).temperature)} degrees</span>
        )}
      />,
    );

    expect(screen.getByText('72 degrees')).toBeTruthy();
  });

  it('does not render step boundaries', () => {
    const { container } = render(<MessagePart part={{ type: 'step-start' }} />);

    expect(container.innerHTML).toBe('');
  });

  it('streams custom-rendered data into artifacts', () => {
    const onStreamPart = vi.fn();

    render(
      <ArtifactProvider registry={[{ kind: 'weather', render: () => null, onStreamPart }]}>
        <MessagePart
          part={{ type: 'data-weather', data: 72 }}
          renderData={() => <span>Custom</span>}
        />
      </ArtifactProvider>,
    );

    expect(screen.getByText('Custom')).toBeTruthy();
    expect(onStreamPart).toHaveBeenCalledOnce();
  });

  it('renders a data part through the first registered renderer of its kind', () => {
    renderWith(
      [
        { kind: 'compaction', render: () => <span>First compaction</span> },
        { kind: 'compaction', render: () => <span>Second compaction</span> },
      ],
      compaction({ status: 'running', reason: 'auto' }),
    );

    expect(screen.getByText('First compaction')).toBeTruthy();
    expect(screen.queryByText('Second compaction')).toBeNull();
  });

  it('keeps flag parts and unmatched parts unchanged', () => {
    const renderers = [{ kind: 'paste', render: () => <span>Registered</span> }];
    const { container } = renderWith(renderers, {
      type: 'data-paste',
      data: { text: 'Pasted', filename: 'pasted-1.txt' },
    });

    expect(screen.queryByText('Registered')).toBeNull();
    expect(container.querySelector('.fb-data-part')).toBeNull();

    renderWith(renderers, { type: 'data-weather', data: { temperature: 72 } });

    expect(screen.getByText(/"temperature": 72/).className).toBe('fb-data-part');
  });
});

describe('CompactionPart', () => {
  const registered = [{ kind: 'compaction', render: CompactionPart }];

  it('shows the summary between the dividers with the usage once completed', () => {
    const { container } = renderWith(
      registered,
      compaction({
        status: 'completed',
        reason: 'auto',
        summary: 'The user is **deploying** to staging.',
        tokens: { input: 12_000, output: 1_200 },
      }),
    );

    const dividers = [...container.querySelectorAll('.fb-separator-text__label')].map(
      (label) => label.textContent,
    );

    expect(dividers).toEqual(['Compaction started', 'Chat compacted · 12K in · 1.2K out']);
    expect(screen.getByText('deploying').tagName).toBe('STRONG');
  });

  it('omits the usage without tokens', () => {
    const { container } = renderWith(
      registered,
      compaction({
        status: 'completed',
        reason: 'manual',
        summary: 'Done',
        tokens: { input: 0, output: 0 },
      }),
    );

    expect(container.querySelectorAll('.fb-separator-text__label')[1].textContent).toBe(
      'Chat compacted',
    );
  });

  it('shows Compacting… without usage or a closing divider while running', () => {
    const { container } = renderWith(
      registered,
      compaction({ status: 'running', reason: 'auto', tokens: { input: 5, output: 5 } }),
    );

    expect(screen.getByRole('status').textContent).toBe('Compacting…');
    expect(container.querySelectorAll('.fb-separator-text__label')).toHaveLength(1);
    expect(container.textContent).not.toContain(' in · ');
  });

  it('shows Compaction failed and the error', () => {
    renderWith(
      registered,
      compaction({ status: 'failed', reason: 'auto', error: 'The model timed out.' }),
    );

    expect(screen.getByText('Compaction failed')).toBeTruthy();
    expect(screen.getByText('The model timed out.')).toBeTruthy();
  });

  it('falls back to JSON for other data', () => {
    renderWith(registered, compaction({ status: 'unknown' }));

    expect(screen.getByText(/"status": "unknown"/).className).toBe('fb-data-part');
  });
});
