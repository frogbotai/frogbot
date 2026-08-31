import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import CheckIcon from '../../../../packages/ui/src/icons/icons/CheckIcon';
import {
  ConfirmationDialog,
  EditableText,
  SearchInput,
  Shortcut,
  StatusIconWithText,
  TextWithIcon,
} from '../../../../packages/ui/src/index';
it('runs a real confirmation flow', async () => {
  const user = userEvent.setup();
  const confirm = vi.fn();
  const close = vi.fn();
  render(
    <ConfirmationDialog
      open
      title="Delete?"
      description="This cannot be undone."
      primaryButtonText="Delete"
      secondaryButtonText="Cancel"
      onConfirm={confirm}
      onOpenChange={close}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledWith(false);
});
it('edits and commits text from the keyboard', async () => {
  const change = vi.fn();
  function Example() {
    const [editing, setEditing] = useState(false);
    return (
      <EditableText
        value="Name"
        readonly={false}
        isEditing={editing}
        setIsEditing={setEditing}
        onValueChange={change}
      />
    );
  }
  const user = userEvent.setup();
  render(<Example />);
  await user.click(screen.getByText('Name'));
  await user.keyboard('{Control>}a{/Control}Updated{Enter}');
  expect(change).toHaveBeenCalledWith('Updated');
});
it('clears search and renders compact composites', async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  render(
    <>
      <SearchInput value="query" onChange={change} />
      <Shortcut shortcutKey="k" withCtrl />
      <TextWithIcon icon={<CheckIcon />} text="Text" />
      <StatusIconWithText icon={CheckIcon} text="Ready" variant="success" />
    </>,
  );
  await user.click(screen.getByRole('button', { name: 'Clear' }));
  expect(change).toHaveBeenCalledWith('');
  expect(screen.getByText('Ready').parentElement?.className).toContain('fb-status-icon-text');
});
