'use client';

import { useState } from 'react';

import LinkSquareIcon from '../icons/icons/LinkSquareIcon.js';
import { useChatProvider } from './provider.js';

/** One link row: the page, its title and an optional snippet. */
export type LinkListItem = {
  url: string;
  title?: string;
  snippet?: string;
};

export type LinkListProps = {
  items: readonly LinkListItem[];
  className?: string;
};

function linkHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
}

function Favicon({ host, url }: { host: string; url: string }) {
  const faviconUrl = useChatProvider()?.faviconUrl;
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : faviconUrl?.(url);

  if (!src) {
    return (
      <span className="fb-link-list__initial" aria-hidden>
        {host.charAt(0).toUpperCase()}
      </span>
    );
  }

  return <img className="fb-link-list__favicon" src={src} alt="" onError={() => setFailed(true)} />;
}

/** Rows of links, each opening in a new tab, with the site's favicon or its initial. */
export function LinkList({ className, items }: LinkListProps) {
  return (
    <ul className={`fb-link-list${className ? ` ${className}` : ''}`}>
      {items.map((item, index) => {
        const host = linkHost(item.url) ?? item.url;

        return (
          <li key={`${item.url}-${index}`} className="fb-link-list__item">
            <a className="fb-link-list__link" href={item.url} target="_blank" rel="noreferrer">
              <Favicon host={host} url={item.url} />
              <span className="fb-link-list__text">
                <span className="fb-link-list__line">
                  {item.title && <span className="fb-link-list__title">{item.title}</span>}
                  <span className="fb-link-list__host">{host}</span>
                  <LinkSquareIcon className="fb-link-list__open" aria-hidden />
                </span>
                {item.snippet && <span className="fb-link-list__snippet">{item.snippet}</span>}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
