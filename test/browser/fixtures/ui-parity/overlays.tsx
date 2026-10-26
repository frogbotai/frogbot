import { createRoot } from 'react-dom/client';

import { ComposerSelect } from '../../../../packages/ui/src/chat/composer-select';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
} from '../../../../packages/ui/src/index';
import { ThemeProvider } from '../../../../packages/ui/src/theme/provider';

const noop = () => {};

type Open = 'menus, popovers and tooltips' | 'open selects' | 'dialogs';

function Overlays({ open }: { open: Open }) {
  const menus = open === 'menus, popovers and tooltips';

  return (
    <div id="g" style={{ display: 'flex', gap: 120, padding: 16, alignItems: 'flex-start' }}>
      <ComposerSelect
        aria-label="Agent"
        value="build"
        options={[
          { value: 'build', label: 'Build', icon: 'wrench' },
          { value: 'plan', label: 'Plan', icon: 'check-list' },
        ]}
        onChange={noop}
      />
      <DropdownMenu open={menus} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Label</DropdownMenuLabel>
          <DropdownMenuItem>Rename</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={menus}>
        <PopoverTrigger asChild>
          <Button variant="outline">Popover</Button>
        </PopoverTrigger>
        <PopoverContent>
          <p>Popover body</p>
        </PopoverContent>
      </Popover>
      <Select open={open === 'open selects'} value="a">
        <SelectTrigger aria-label="Select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
          <SelectItem value="b">Beta</SelectItem>
        </SelectContent>
      </Select>
      <Tooltip label="Tooltip text" open={menus}>
        <Button variant="ghost">Tip</Button>
      </Tooltip>
      <Dialog open={open === 'dialogs'}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog title</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const { galleryTheme, galleryOverlay } = document.documentElement.dataset;

createRoot(document.getElementById('root')!).render(
  <ThemeProvider mode={galleryTheme === 'dark' ? 'dark' : 'light'}>
    <Overlays open={(galleryOverlay as Open | undefined) ?? 'dialogs'} />
  </ThemeProvider>,
);
