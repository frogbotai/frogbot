'use client';

import { getTranslation } from '@payloadcms/translations';
import { useConfig, useStepNav, useTranslation } from '@payloadcms/ui';
import { useEffect, useRef } from 'react';

export function TabTitleSync(): null {
  const { config } = useConfig();
  const { stepNav } = useStepNav();
  const { i18n } = useTranslation();
  const titleRef = useRef<HTMLTitleElement | null>(null);

  const label = getTranslation(stepNav.at(-1)?.label ?? '', i18n);
  const text = typeof label === 'string' ? label.trim() : '';
  const suffix = config.admin.meta?.titleSuffix;

  const wantedTitle = text ? (suffix ? `${text} ${suffix}` : text) : '';

  useEffect(() => {
    if (!wantedTitle) {
      titleRef.current?.remove();
      titleRef.current = null;

      return;
    }

    const title = titleRef.current ?? document.createElement('title');

    titleRef.current = title;
    title.setAttribute('data-frogbot-tab-title', '');

    const syncTitle = () => {
      if (title.textContent !== wantedTitle) title.textContent = wantedTitle;

      if (document.head.querySelector('title') !== title) document.head.prepend(title);
    };

    syncTitle();

    const observer = new MutationObserver(syncTitle);

    observer.observe(document.head, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, [wantedTitle]);

  useEffect(() => {
    return () => {
      titleRef.current?.remove();
      titleRef.current = null;
    };
  }, []);

  return null;
}
