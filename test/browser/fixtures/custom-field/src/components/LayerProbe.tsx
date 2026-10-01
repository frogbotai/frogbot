'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@frogbotai/ui';
import { ThemeProvider } from '@frogbotai/ui/theme';

function ProbeMenu({ testId }: { testId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid={`${testId}-trigger`} type="button" variant="ghost">
          Menu
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-testid={testId}>
        <DropdownMenuItem>Archive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LayerProbe() {
  return (
    <div data-testid="layer-probe">
      <Button className="text-red-600 bg-blue-500" data-testid="layer-utility" type="button">
        Delete
      </Button>
      <span className="text-red-600 bg-blue-500" data-testid="layer-utility-reference">
        Reference
      </span>
      <Button asChild className="underline">
        <a data-testid="layer-utility-link" href="/x">
          Docs
        </a>
      </Button>
      <Button data-testid="layer-default" type="button">
        Approve
      </Button>
      <Button asChild>
        <a data-testid="layer-link" href="/x">
          Help
        </a>
      </Button>
      <ProbeMenu testId="layer-menu" />
      <Dialog>
        <DialogTrigger asChild>
          <Button data-testid="layer-dialog-trigger" type="button" variant="secondary">
            Open
          </Button>
        </DialogTrigger>
        <DialogContent data-testid="layer-dialog">
          <DialogTitle>Probe</DialogTitle>
          <DialogDescription>Layer probe dialog</DialogDescription>
        </DialogContent>
      </Dialog>
      <ThemeProvider mode="dark">
        <ProbeMenu testId="layer-dark-menu" />
      </ThemeProvider>
      <div className="billing">
        <ProbeMenu testId="layer-billing-menu" />
      </div>
    </div>
  );
}
