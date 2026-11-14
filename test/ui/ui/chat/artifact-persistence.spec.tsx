import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ArtifactProvider, ArtifactViewer } from '../../../../packages/ui/src/chat/artifact';
import type { ArtifactPersistence } from '../../../../packages/ui/src/chat/artifact-registry';

describe('artifact persistence', () => {
  it('loads and saves through the injected accessor', async () => {
    const artifact = { id: 'a1', kind: 'external', title: 'Loaded artifact', content: 'content' };
    const persistence: ArtifactPersistence = {
      load: vi.fn(() => Promise.resolve(artifact)),
      save: vi.fn((value) => Promise.resolve(value)),
    };

    render(
      <ArtifactProvider persistence={persistence}>
        <ArtifactViewer id="a1" />
      </ArtifactProvider>,
    );

    await screen.findAllByText('Loaded artifact');

    expect(persistence.load).toHaveBeenCalledWith('a1');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(persistence.save).toHaveBeenCalledWith(artifact));
  });
});

describe('artifact viewer', () => {
  const artifact = { id: 'a1', kind: 'external', title: 'q3-plan.md', content: '# Q3 plan' };
  const persistence: ArtifactPersistence = {
    load: () => Promise.resolve(artifact),
    save: (value) => Promise.resolve(value),
  };

  it('uses the side panel bar: title always shown, Save, expand and close in order', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <ArtifactProvider persistence={persistence}>
        <ArtifactViewer id="a1" onClose={onClose} />
      </ArtifactProvider>,
    );

    await screen.findAllByText('q3-plan.md');
    const end = container.querySelector('.fb-side-panel-bar__end')!;

    expect(
      [...end.children].map((node) => node.getAttribute('aria-label') ?? node.textContent),
    ).toEqual(['Save', 'Expand', 'Close']);
    expect(container.querySelector('.fb-artifact__header')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));

    expect(container.querySelector('.fb-artifact__viewer--expanded')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Esc', async () => {
    const onClose = vi.fn();

    render(
      <ArtifactProvider persistence={persistence}>
        <ArtifactViewer id="a1" onClose={onClose} />
      </ArtifactProvider>,
    );

    await screen.findAllByText('q3-plan.md');
    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
