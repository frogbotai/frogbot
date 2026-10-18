'use client';

import { Children, type ComponentProps, type ReactNode } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/collapsible.js';
import ChevronDownIcon from '../icons/icons/ChevronDownIcon.js';
import LoadingIcon from '../icons/icons/LoadingIcon.js';
import { type IconName, iconRegistry } from '../icons/registry.js';
import { LinkList, type LinkListItem } from './link-list.js';
import type { ToolPartValue, ToolRenderer, ToolRendererProps } from './tool-registry.js';

/** Where a tool call is: running, finished, failed, or refused by the user. */
export type ToolCardStatus = 'running' | 'done' | 'error' | 'denied';

export type ToolCardProps = Omit<ComponentProps<typeof Collapsible>, 'title' | 'children'> & {
  /** The tool's icon, by its registry name; green when done, red when failed or denied. */
  icon: IconName;
  status: ToolCardStatus;
  title: ReactNode;
  subtitle?: ReactNode;
  /** The collapsible body; without it the card has no chevron. */
  children?: ReactNode;
};

const PREFIX: Partial<Record<ToolCardStatus, string>> = {
  error: 'Failed: ',
  denied: 'Denied: ',
};

/** A tool call as a rounded card: status icon, title, optional subtitle and a collapsible body. */
export function ToolCard({
  children,
  className,
  icon,
  status,
  subtitle,
  title,
  ...props
}: ToolCardProps) {
  const Icon = iconRegistry[icon];
  const body = Children.toArray(children).length > 0;

  const header = (
    <>
      <span className={`fb-tool-card__icon fb-tool-card__icon--${status}`}>
        {status === 'running' ? (
          <LoadingIcon className="fb-tool-card__spinner" aria-label="Running" />
        ) : (
          <Icon aria-hidden />
        )}
      </span>
      <span className="fb-tool-card__text">
        <span className="fb-tool-card__title">
          {PREFIX[status]}
          {title}
        </span>
        {subtitle !== undefined && subtitle !== null && subtitle !== '' && (
          <span className="fb-tool-card__subtitle">{subtitle}</span>
        )}
      </span>
      {body && <ChevronDownIcon className="fb-tool-card__chevron" aria-hidden />}
    </>
  );

  return (
    <Collapsible
      data-status={status}
      className={`fb-tool-card${className ? ` ${className}` : ''}`}
      {...props}
    >
      {body ? (
        <CollapsibleTrigger className="fb-tool-card__header">{header}</CollapsibleTrigger>
      ) : (
        <div className="fb-tool-card__header">{header}</div>
      )}
      {body && <CollapsibleContent className="fb-tool-card__body">{children}</CollapsibleContent>}
    </Collapsible>
  );
}

/** The card status for a tool part's state. */
export function toolCardStatus(part: ToolPartValue): ToolCardStatus {
  if (part.state === 'output-available') return 'done';
  if (part.state === 'output-error') return 'error';
  if (part.state === 'output-denied') return 'denied';

  return 'running';
}

/** What a tool's card shows for one call. */
export type ToolCardDescription = {
  icon: IconName;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Rows of links, shown first in the body. */
  links?: readonly LinkListItem[];
  body?: ReactNode;
};

/** A `ToolRenderer` that draws `kind`'s calls as a `ToolCard` described by `describe`. */
export function toolCard(
  kind: string,
  describe: (part: ToolPartValue) => ToolCardDescription,
): ToolRenderer {
  function ToolCardRenderer({ part }: ToolRendererProps) {
    const { body, icon, links, subtitle, title } = describe(part);

    return (
      <ToolCard
        data-part="tool"
        icon={icon}
        status={toolCardStatus(part)}
        title={title}
        subtitle={subtitle}
      >
        {links && links.length > 0 && <LinkList items={links} />}
        {body}
      </ToolCard>
    );
  }

  return { kind, render: ToolCardRenderer };
}
