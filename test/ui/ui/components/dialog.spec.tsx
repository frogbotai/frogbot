import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../../../packages/ui/src/index';

it('opens, focuses, and closes the dialog from the keyboard', async () => {
  const user = userEvent.setup();
  render(
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Update settings.</DialogDescription>
        <button>Save</button>
      </DialogContent>
    </Dialog>,
  );

  await user.tab();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('dialog').className).toContain('fb-dialog__content');
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open dialog' }));
});

it('supports content without an overlay or close button', async () => {
  render(
    <Dialog open onOpenChange={vi.fn()}>
      <DialogContent showOverlay={false} withCloseButton={false} aria-label="Plain dialog" />
    </Dialog>,
  );
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  expect(document.querySelector('.fb-dialog__overlay')).toBeNull();
});
