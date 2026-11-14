'use client';

import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react';

import ChevronLeftIcon from '../icons/icons/ChevronLeftIcon.js';
import MaximizeIcon from '../icons/icons/MaximizeIcon.js';
import MoreHorizontalIcon from '../icons/icons/MoreHorizontalIcon.js';
import XIcon from '../icons/icons/XIcon.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu.js';
import { sidePanelCrumbs } from './side-panel-crumbs.js';

const baseClass = 'fb-side-panel-bar';

/** The link back to the record or file the panel was opened from. */
export type SidePanelBarBack = {
  /** The parent's title, for example `Budget feature`. */
  label: string;
  onBack: () => void;
};

export interface SidePanelBarProps {
  /** A link back to the parent, when the panel was opened from inside itself. */
  back?: SidePanelBarBack;
  className?: string;
  /** What the record is, for example `Tasks`, when nothing is behind the panel. Ignored with `back`. */
  context?: string;
  /** The accessible names of the buttons, for translation. */
  labels?: { close?: string; expand?: string; more?: string };
  /** The ••• menu's items, such as `SidePanelMenuItem`s. Without any, the button is hidden. */
  menu?: ReactNode;
  onClose?: () => void;
  onExpand?: () => void;
  /** At most one thing before the menu: a state such as `Saved`, or a labelled button. */
  status?: ReactNode;
  title?: ReactNode;
  /** The body shows the title large, so the bar shows it only once that scrolls out. */
  titleInBody?: boolean;
  /** The body's large title has scrolled under the bar. */
  titleScrolledOut?: boolean;
}

function BarButton({
  icon,
  label,
  onClick,
  ...props
}: { icon: ReactNode; label: string } & ComponentProps<'button'>) {
  return (
    <button
      aria-label={label}
      className={`${baseClass}__button`}
      onClick={onClick}
      title={label}
      type="button"
      {...props}
    >
      {icon}
    </button>
  );
}

/**
 * The one top bar of every side panel. The right side never changes: the status slot, the •••
 * menu, expand and close, in that order. The left side never repeats a title the body shows: a
 * back link when the panel was drilled into, the collection's name when nothing is behind it,
 * and the title once the body's large title has scrolled out, or always when the body has none.
 */
export function SidePanelBar({
  back,
  className,
  context,
  labels,
  menu,
  onClose,
  onExpand,
  status,
  title,
  titleInBody = false,
  titleScrolledOut = false,
}: SidePanelBarProps) {
  const crumbs = sidePanelCrumbs({
    back: Boolean(back),
    context: Boolean(context),
    titleInBody,
    titleScrolledOut,
  });

  const showTitle = crumbs.title && title !== undefined && title !== null && title !== '';
  const more = labels?.more ?? 'More options';

  return (
    <div className={`${baseClass}${className ? ` ${className}` : ''}`}>
      <div className={`${baseClass}__start`}>
        {crumbs.lead === 'back' && back ? (
          <button
            aria-label={`Back to ${back.label}`}
            className={`${baseClass}__back`}
            onClick={back.onBack}
            title={back.label}
            type="button"
          >
            <ChevronLeftIcon aria-hidden size={16} />
            <span className={`${baseClass}__back-label`}>{back.label}</span>
          </button>
        ) : null}
        {crumbs.lead === 'context' ? (
          <span className={`${baseClass}__context`}>{context}</span>
        ) : null}
        {crumbs.lead && showTitle ? (
          <span aria-hidden className={`${baseClass}__separator`}>
            /
          </span>
        ) : null}
        {showTitle ? <span className={`${baseClass}__title`}>{title}</span> : null}
      </div>
      <div className={`${baseClass}__end`}>
        {status ? <div className={`${baseClass}__status`}>{status}</div> : null}
        {menu ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger aria-label={more} className={`${baseClass}__button`} title={more}>
              <MoreHorizontalIcon aria-hidden size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={`${baseClass}__menu`}>
              {menu}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {onExpand ? (
          <BarButton
            icon={<MaximizeIcon aria-hidden size={16} />}
            label={labels?.expand ?? 'Expand'}
            onClick={onExpand}
          />
        ) : null}
        {onClose ? (
          <BarButton
            icon={<XIcon aria-hidden size={16} />}
            label={labels?.close ?? 'Close'}
            onClick={onClose}
          />
        ) : null}
      </div>
    </div>
  );
}

/** An item in a side panel's ••• menu. `danger` colours it, as for delete. */
export function SidePanelMenuItem({
  className,
  danger,
  ...props
}: ComponentProps<typeof DropdownMenuItem> & { danger?: boolean }) {
  return (
    <DropdownMenuItem
      className={[danger && `${baseClass}__item--danger`, className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

/** A line of text at the end of a side panel's ••• menu, such as the last saved time. */
export function SidePanelMenuNote({ children }: { children: ReactNode }) {
  return <div className={`${baseClass}__note`}>{children}</div>;
}

/**
 * Closes a side panel on Esc, unless another layer already handled the key, focus is in an open
 * menu, listbox or dialog, or `ignore` returns true.
 */
export function useSidePanelEscape(
  onClose: (() => void) | undefined,
  ignore?: (event: KeyboardEvent) => boolean,
): void {
  const ref = useRef({ ignore, onClose });
  const active = Boolean(onClose);

  useEffect(() => {
    ref.current = { ignore, onClose };
  });

  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;

      const target = event.target instanceof Element ? event.target : null;

      if (target?.closest('[aria-expanded="true"], [role="menu"], [role="dialog"]')) return;
      if (ref.current.ignore?.(event)) return;

      ref.current.onClose?.();
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
