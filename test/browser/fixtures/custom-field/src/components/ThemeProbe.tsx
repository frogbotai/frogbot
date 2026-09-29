'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@frogbotai/ui';
import { CodeBlock } from '@frogbotai/ui/chat';
import { ThemeProvider } from '@frogbotai/ui/theme';

export function ThemeProbe() {
  return (
    <div data-testid="theme-probe">
      <Button data-testid="theme-probe-default" type="button">
        Approve
      </Button>
      <Button data-testid="theme-probe-secondary" type="button" variant="secondary">
        Hold
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button data-testid="theme-probe-menu-trigger" type="button" variant="ghost">
            More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-testid="theme-probe-menu">
          <DropdownMenuItem>Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CodeBlock code="const status = 'draft';" data-testid="theme-probe-code" role="user" />
      <ThemeProvider mode="dark">
        <Button data-testid="theme-probe-dark-default" type="button">
          Publish
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-testid="theme-probe-dark-menu-trigger" type="button" variant="ghost">
              Options
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent data-testid="theme-probe-dark-menu">
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ThemeProvider>
    </div>
  );
}
