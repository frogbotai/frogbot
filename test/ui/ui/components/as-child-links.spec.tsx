import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { FilePart } from '../../../../packages/ui/src/chat/file-part';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
  Toggle,
} from '../../../../packages/ui/src/index';

function expectAnchor({
  className,
  name,
  role = 'link',
}: {
  className: string;
  name: string;
  role?: 'link' | 'menuitem' | 'tab';
}) {
  const link = screen.getByRole(role, { name });

  expect(link.tagName).toBe('A');
  expect(link.className).toContain(className);
  expect(link.closest('button')).toBeNull();
}

it('Button asChild puts its classes on the anchor for outline and link variants', () => {
  render(
    <>
      <Button asChild variant="outline">
        <a href="/outline">Outline</a>
      </Button>
      <Button asChild variant="link">
        <a href="/link">Link</a>
      </Button>
    </>,
  );

  expectAnchor({ className: 'fb-button fb-button--outline', name: 'Outline' });
  expectAnchor({ className: 'fb-button--link', name: 'Link' });
});

it('DropdownMenuItem asChild puts its class on the anchor', () => {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <a href="/logout">Log out</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );

  expectAnchor({ className: 'fb-dropdown-menu__item', name: 'Log out', role: 'menuitem' });
});

it('ContextMenuItem asChild puts its class on the anchor', async () => {
  render(
    <ContextMenu>
      <ContextMenuTrigger>Target</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem asChild>
          <a href="/item">Item</a>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>,
  );

  fireEvent.contextMenu(screen.getByText('Target'));

  expect(await screen.findByRole('menu')).toBeTruthy();
  expectAnchor({ className: 'fb-context-menu__item', name: 'Item', role: 'menuitem' });
});

it('TabsTrigger and Toggle asChild put their class on the anchor', () => {
  render(
    <>
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger asChild value="two">
            <a href="/two">Two</a>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Toggle asChild>
        <a href="/toggle">Toggle</a>
      </Toggle>
    </>,
  );

  expectAnchor({ className: 'fb-tabs__trigger', name: 'Two', role: 'tab' });
  expectAnchor({ className: 'fb-toggle', name: 'Toggle' });
});

it('FilePart renders a non-image file as a download anchor', () => {
  render(
    <FilePart
      part={{
        type: 'file',
        mediaType: 'application/pdf',
        url: '/report.pdf',
        filename: 'report.pdf',
      }}
    />,
  );

  expectAnchor({ className: 'fb-file-part--download', name: 'report.pdf' });
});
