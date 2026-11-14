import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  SidePanelBar,
  SidePanelMenuItem,
  SidePanelMenuNote,
  useSidePanelEscape,
} from '../../../../packages/ui/src/index';

function Panel({ onClose, menu = true }: { menu?: boolean; onClose: () => void }) {
  useSidePanelEscape(onClose);

  return (
    <SidePanelBar
      menu={
        menu ? (
          <>
            <SidePanelMenuItem>Copy link</SidePanelMenuItem>
            <SidePanelMenuItem onSelect={() => undefined}>Track time</SidePanelMenuItem>
            <SidePanelMenuNote>Saved 2:15 PM</SidePanelMenuNote>
            <SidePanelMenuItem danger>Delete</SidePanelMenuItem>
          </>
        ) : undefined
      }
      onClose={onClose}
      onExpand={vi.fn()}
      status={<span>Saved</span>}
      title="Budget feature"
    />
  );
}

describe('SidePanelBar', () => {
  it('keeps the right side in order: status, more, expand, close', () => {
    const { container } = render(<Panel onClose={vi.fn()} />);
    const end = container.querySelector('.fb-side-panel-bar__end')!;
    const children = [...end.children].map(
      (node) => node.getAttribute('aria-label') ?? node.textContent,
    );

    expect(children).toEqual(['Saved', 'More options', 'Expand', 'Close']);
  });

  it('hides the more button when the menu has no items', () => {
    render(<Panel menu={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('opens the menu with its items, the note and a danger item', async () => {
    const user = userEvent.setup();
    render(<Panel onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    const menu = await screen.findByRole('menu');

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Copy link', 'Track time', 'Delete']);
    expect(within(menu).getByText('Saved 2:15 PM')).toBeTruthy();
    expect(within(menu).getByText('Delete').className).toContain('--danger');
  });

  it('closes on Esc, but an open menu takes the first Esc', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(<Panel onClose={close} />);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(close).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('ignores an Esc another layer already handled', () => {
    const close = vi.fn();
    render(<Panel onClose={close} />);

    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' });
    event.preventDefault();
    document.body.dispatchEvent(event);

    expect(close).not.toHaveBeenCalled();
  });

  it('shows the title only when the body has none, or it scrolled out', () => {
    const { rerender } = render(<SidePanelBar title="Budget feature" titleInBody />);

    expect(screen.queryByText('Budget feature')).toBeNull();

    rerender(<SidePanelBar title="Budget feature" titleInBody titleScrolledOut />);

    expect(screen.getByText('Budget feature')).toBeTruthy();

    rerender(<SidePanelBar title="Budget feature" />);

    expect(screen.getByText('Budget feature')).toBeTruthy();
  });

  it('leads with a back link, or the collection name with nothing behind the panel', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const { rerender } = render(
      <SidePanelBar
        back={{ label: 'Budget feature', onBack }}
        context="Tasks"
        title="Spec the cap rules"
        titleInBody
        titleScrolledOut
      />,
    );

    expect(screen.queryByText('Tasks')).toBeNull();
    expect(screen.getByText('Spec the cap rules')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back to Budget feature' }));

    expect(onBack).toHaveBeenCalledTimes(1);

    rerender(<SidePanelBar context="Tasks" title="Budget feature" titleInBody />);

    expect(screen.getByText('Tasks')).toBeTruthy();
    expect(screen.queryByText('Budget feature')).toBeNull();
  });
});
