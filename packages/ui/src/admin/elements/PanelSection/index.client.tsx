'use client';

import './index.css';

import type { ReactNode } from 'react';

import PlusSignIcon from '../../../icons/icons/PlusSignIcon.js';
import { PanelIconButton } from '../PanelIconButton/index.client.js';

export type PanelSectionProps = {
  /** The add button's label and tooltip. Default "Add". */
  addLabel?: string;
  children?: ReactNode;
  className?: string;
  heading: ReactNode;
  /** Shows an add button beside the heading. */
  onAdd?: () => void;
};

/** A titled block for the record panel or edit page, such as related records or activity. */
export function PanelSection({
  addLabel = 'Add',
  children,
  className,
  heading,
  onAdd,
}: PanelSectionProps) {
  return (
    <section className={['fb-panel-section', className].filter(Boolean).join(' ')}>
      <header className="fb-panel-section__header">
        <h3 className="fb-panel-section__heading">{heading}</h3>
        {onAdd ? (
          <PanelIconButton icon={<PlusSignIcon size={16} />} label={addLabel} onClick={onAdd} />
        ) : null}
      </header>
      <div className="fb-panel-section__content">{children}</div>
    </section>
  );
}
