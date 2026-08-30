'use client';

import type { ReactElement, ReactNode } from 'react';
import { cloneElement, useState } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../components/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/dropdown-menu';
import DeleteIcon from '../icons/icons/DeleteIcon';
import MoreHorizontalIcon from '../icons/icons/MoreHorizontalIcon';
import PencilIcon from '../icons/icons/PencilIcon';

export type ChatRowMenuItemsProps = {
  onRename: () => void;
  onDelete: () => void;
  context?: boolean;
};

export function ChatRowMenuItems({ context, onDelete, onRename }: ChatRowMenuItemsProps) {
  const Item = context ? ContextMenuItem : DropdownMenuItem;
  return (
    <>
      <Item onSelect={onRename}>
        <PencilIcon />
        <span>Rename</span>
      </Item>
      <Item className="fb-chat-row-actions__delete" onSelect={onDelete}>
        <DeleteIcon />
        <span>Delete</span>
      </Item>
    </>
  );
}

export type ChatRowActionsProps = {
  children: ReactElement<{ children?: ReactNode }>;
  onRename: () => void;
  onDelete: () => void;
};

export function ChatRowActions({ children, onDelete, onRename }: ChatRowActionsProps) {
  const [open, setOpen] = useState(false);
  const row = cloneElement(
    children,
    undefined,
    children.props.children,
    <DropdownMenu open={open} onOpenChange={setOpen} modal>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Chat actions"
          className={`fb-chat-row-actions__trigger${open ? ' fb-chat-row-actions__trigger--open' : ''}`}
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <MoreHorizontalIcon />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom">
        <ChatRowMenuItems onDelete={onDelete} onRename={onRename} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ChatRowMenuItems context onDelete={onDelete} onRename={onRename} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
