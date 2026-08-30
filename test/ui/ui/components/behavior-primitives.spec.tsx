import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Avatar,
  AvatarFallback,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Separator,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle,
} from '../../../../packages/ui/src/index';

it('renders the behavior primitive BEM surfaces', () => {
  render(
    <>
      <Label htmlFor="check">Check</Label>
      <Checkbox id="check" />
      <Switch aria-label="Switch" />
      <Toggle>Toggle</Toggle>
      <Separator />
      <RadioGroup>
        <RadioGroupItem value="one" aria-label="One" />
      </RadioGroup>
      <Avatar>
        <AvatarFallback>FB</AvatarFallback>
      </Avatar>
      <ScrollArea style={{ height: 20 }}>Content</ScrollArea>
    </>,
  );
  expect(screen.getByText('Check').className).toContain('fb-label');
  expect(screen.getByRole('checkbox').className).toContain('fb-checkbox');
  expect(screen.getByRole('switch').className).toContain('fb-switch');
  expect(screen.getByText('FB').className).toContain('fb-avatar__fallback');
});

it('supports keyboard-driven disclosure primitives', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Accordion type="single" collapsible>
        <AccordionItem value="one">
          <AccordionTrigger>Accordion</AccordionTrigger>
          <AccordionContent>Details</AccordionContent>
        </AccordionItem>
      </Accordion>
      <Collapsible>
        <CollapsibleTrigger>Collapsible</CollapsibleTrigger>
        <CollapsibleContent>More</CollapsibleContent>
      </Collapsible>
    </>,
  );
  await user.click(screen.getByText('Accordion'));
  expect(screen.getByText('Details')).toBeTruthy();
  await user.click(screen.getByText('Collapsible'));
  expect(screen.getByText('More')).toBeTruthy();
});

it('opens popover and context menu surfaces', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Popover>
        <PopoverTrigger>Popover</PopoverTrigger>
        <PopoverContent>Popover content</PopoverContent>
      </Popover>
      <ContextMenu>
        <ContextMenuTrigger>Target</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Action</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </>,
  );
  await user.click(screen.getByText('Popover'));
  expect(screen.getByText('Popover content').className).toContain('fb-popover__content');
  fireEvent.contextMenu(screen.getByText('Target'));
  expect(await screen.findByRole('menu')).toBeTruthy();
});

it('switches tabs with the keyboard', async () => {
  const user = userEvent.setup();
  render(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
      </TabsList>
      <TabsContent value="one">First</TabsContent>
      <TabsContent value="two">Second</TabsContent>
    </Tabs>,
  );
  screen.getByRole('tab', { name: 'One' }).focus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Two' }).getAttribute('data-state')).toBe('active');
});
