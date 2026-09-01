'use client';

import type { ReactElement, ReactNode } from 'react';
import { cloneElement, useState } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../components/context-menu.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/dropdown-menu.js';
import DeleteIcon from '../icons/icons/DeleteIcon.js';
import MoreHorizontalIcon from '../icons/icons/MoreHorizontalIcon.js';
import PencilIcon from '../icons/icons/PencilIcon.js';

export type ChatRowMenuItemsProps = {
  onRename: () => void;
  onDelete: () => void;
  context?: boolean;
};

export function ChatRowMenuItems({ context, onDelete, onRename }: ChatRowMenuItemsProps) {
  const Item = context ? ContextMenuItem : DropdownMenuItem;
  return (
    <>
      <Item className="fb-slide-right-1" onSelect={onRename}>
        <PencilIcon />
        <span>Rename</span>
      </Item>
      <Item className="fb-chat-row-actions__delete fb-slide-right-1" onSelect={onDelete}>
        <DeleteIcon />
        <span>Delete</span>
      </Item>
    </>
  );
}

export type ChatRowActionsProps = {
  children: ReactElement<{ children?: ReactNode; className?: string }>;
  onRename: () => void;
  onDelete: () => void;
};

export function ChatRowActions({ children, onDelete, onRename }: ChatRowActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const open = menuOpen || contextOpen;
  const rowClassName = [
    children.props.className,
    'fb-chat-row-actions__row',
    'fb-slide-right-1',
    open ? 'fb-slide-active fb-chat-row-actions__row--open' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const row = cloneElement(
    children,
    { className: rowClassName },
    children.props.children,
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Chat actions"
          className={`fb-chat-row-actions__trigger${menuOpen ? ' fb-chat-row-actions__trigger--open' : ''}`}
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
    <ContextMenu onOpenChange={setContextOpen}>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ChatRowMenuItems context onDelete={onDelete} onRename={onRename} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
