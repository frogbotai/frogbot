'use client';

import './index.css';

import { Button } from '@payloadcms/ui';
import type { MouseEvent, ReactNode } from 'react';

export type PanelIconButtonProps = {
  className?: string;
  disabled?: boolean;
  /** An icon at 16px, such as `<LinkIcon size={16} />`. */
  icon: ReactNode;
  id?: string;
  /** The accessible name. Also the tooltip unless `tooltip` is set. */
  label: string;
  onClick?: (event: MouseEvent) => void;
  /** `false` hides the tooltip. */
  tooltip?: false | string;
};

/**
 * The record panel's square icon button: 32px, a muted icon, and a light border on hover, as on
 * a `PanelSection`'s add button.
 */
export function PanelIconButton({
  className,
  disabled,
  icon,
  id,
  label,
  onClick,
  tooltip,
}: PanelIconButtonProps) {
  return (
    <Button
      aria-label={label}
      buttonStyle="ghost"
      className={['fb-panel-icon-button', className].filter(Boolean).join(' ')}
      disabled={disabled}
      icon={icon}
      id={id}
      onClick={onClick}
      tooltip={tooltip === false ? undefined : (tooltip ?? label)}
    />
  );
}
