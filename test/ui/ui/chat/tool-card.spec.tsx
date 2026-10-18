import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import { ToolCard, toolCard } from '../../../../packages/ui/src/chat/tool-card';
import type { ToolPartValue } from '../../../../packages/ui/src/chat/tool-registry';

const adapter = { loadManifest: () => new Promise(() => undefined) } as never;

const part = (state: ToolPartValue['state'], extra: object = {}) =>
  ({
    type: 'dynamic-tool',
    toolName: 'web_search',
    toolCallId: '1',
    state,
    input: { query: 'tree frogs' },
    ...extra,
  }) as ToolPartValue;

const search = toolCard('web_search', (call) => ({
  icon: 'web',
  title: `“${(call.input as { query: string }).query}”`,
  subtitle: call.state === 'output-available' ? '2 results' : undefined,
  links:
    call.state === 'output-available'
      ? [
          { url: 'https://www.frogs.example/a', title: 'Frogs' },
          { url: 'https://amphibians.example/b', title: 'Tree frogs', snippet: 'Care guide' },
        ]
      : undefined,
}));

function renderCall(state: ToolPartValue['state'], extra?: object) {
  const Render = search.render;

  return render(<Render part={part(state, extra)} />);
}

describe('toolCard', () => {
  it('registers under its kind', () => {
    expect(search.kind).toBe('web_search');
  });

  it('shows a spinner and no status icon while running', () => {
    const { container } = renderCall('input-available');

    expect(screen.getByLabelText('Running')).toBeTruthy();
    expect(container.querySelector('.fb-tool-card')?.getAttribute('data-status')).toBe('running');
    expect(container.querySelector('.lucide-web')).toBeNull();
    expect(container.querySelector('.fb-tool-card__chevron')).toBeNull();
  });

  it("shows the tool's icon in the done colour with its title and subtitle", () => {
    const { container } = renderCall('output-available', { output: {} });

    expect(container.querySelector('.fb-tool-card__icon--done .lucide-web')).toBeTruthy();
    expect(container.querySelector('.fb-tool-card__title')?.textContent).toBe('“tree frogs”');
    expect(container.querySelector('.fb-tool-card__subtitle')?.textContent).toBe('2 results');
    expect(screen.queryByLabelText('Running')).toBeNull();
  });

  it('prefixes failed and denied calls and colours their icon', () => {
    const { container, rerender } = renderCall('output-error', { errorText: 'Rate limited' });

    expect(container.querySelector('.fb-tool-card__icon--error .lucide-web')).toBeTruthy();
    expect(container.querySelector('.fb-tool-card__title')?.textContent).toBe(
      'Failed: “tree frogs”',
    );

    const Render = search.render;

    rerender(<Render part={part('output-denied')} />);

    expect(container.querySelector('.fb-tool-card__icon--denied')).toBeTruthy();
    expect(container.querySelector('.fb-tool-card__title')?.textContent).toBe(
      'Denied: “tree frogs”',
    );
  });

  it('starts closed and opens to its links', () => {
    const { container } = renderCall('output-available', { output: {} });
    const trigger = screen.getByRole('button', { name: /tree frogs/ });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.fb-link-list')).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      [...container.querySelectorAll('.fb-link-list__host')].map((host) => host.textContent),
    ).toEqual(['frogs.example', 'amphibians.example']);
    expect(screen.getByText('Care guide')).toBeTruthy();
  });
});

describe('ToolCard', () => {
  it('has no button or chevron without a body', () => {
    const { container } = render(<ToolCard icon="cursor" status="done" title="Clicked Submit" />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.fb-tool-card__chevron')).toBeNull();
    expect(container.querySelector('.fb-tool-card__subtitle')).toBeNull();
  });

  it('opens its body from the header', () => {
    render(
      <ToolCard icon="cursor" status="done" title="Clicked Submit">
        <p>Details</p>
      </ToolCard>,
    );

    expect(screen.queryByText('Details')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Clicked Submit/ }));

    expect(screen.getByText('Details')).toBeTruthy();
  });

  it('renders inside a provider like any other part', () => {
    render(
      <ChatProvider adapter={adapter}>
        <ToolCard icon="keyboard" status="running" title="Pressing Enter" />
      </ChatProvider>,
    );

    expect(screen.getByText('Pressing Enter')).toBeTruthy();
  });
});
