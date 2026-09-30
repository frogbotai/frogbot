'use client';

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
} from '@frogbotai/ui';
import { FilePart } from '@frogbotai/ui/chat';
import { ThemeProvider } from '@frogbotai/ui/theme';

const variants = ['default', 'outline', 'link', 'ghost', 'destructive'] as const;

export default function LinkCheckPage() {
  return (
    <ThemeProvider mode="light">
      <div data-testid="link-check" style={{ color: 'rgb(10, 120, 60)', padding: '1rem' }}>
        {variants.map((variant) => (
          <div key={variant}>
            <Button data-testid={`button-${variant}-button`} type="button" variant={variant}>
              Help
            </Button>
            <Button asChild variant={variant}>
              <a data-testid={`button-${variant}-link`} href="/help">
                Help
              </a>
            </Button>
          </div>
        ))}
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger data-testid="tab-active-button" value="active">
              Active
            </TabsTrigger>
            <TabsTrigger data-testid="tab-button" value="button">
              Tab
            </TabsTrigger>
            <TabsTrigger asChild value="link">
              <a data-testid="tab-link" href="/tab">
                Tab
              </a>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs defaultValue="link-active">
          <TabsList>
            <TabsTrigger asChild value="link-active">
              <a data-testid="tab-active-link" href="/tab-active">
                Active
              </a>
            </TabsTrigger>
            <TabsTrigger value="other">Other</TabsTrigger>
          </TabsList>
        </Tabs>
        <div>
          <Toggle data-testid="toggle-button">Toggle</Toggle>
          <Toggle asChild>
            <a data-testid="toggle-link" href="/toggle">
              Toggle
            </a>
          </Toggle>
          <Toggle data-testid="toggle-on-button" defaultPressed>
            On
          </Toggle>
          <Toggle asChild defaultPressed>
            <a data-testid="toggle-on-link" href="/toggle-on">
              On
            </a>
          </Toggle>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-testid="menu-trigger" type="button" variant="outline">
              Menu
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem data-testid="menu-div">Settings</DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a data-testid="menu-link" href="/logout">
                Log out
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div data-testid="context-trigger" style={{ padding: '1rem' }}>
              Context area
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem data-testid="context-div">Rename</ContextMenuItem>
            <ContextMenuItem asChild>
              <a data-testid="context-link" href="/open">
                Open
              </a>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div data-testid="file-part">
          <FilePart
            part={{
              type: 'file',
              mediaType: 'application/pdf',
              url: '/report.pdf',
              filename: 'report.pdf',
            }}
          />
        </div>
      </div>
    </ThemeProvider>
  );
}
