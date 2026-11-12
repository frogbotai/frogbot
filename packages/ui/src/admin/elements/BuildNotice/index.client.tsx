'use client';

import { useConfig } from '@payloadcms/ui';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../../../components/button.js';

const CHECK_INTERVAL_MS = 5000;

/**
 * Shows "Updated, reload" when the tab regains focus after a newer production build went live,
 * by comparing the build ID inlined in this bundle with the `x-frogbot-build` header the server
 * sends now. It never reloads by itself, so a half-written draft is never lost.
 */
export function BuildNotice() {
  const { config } = useConfig();
  const [updated, setUpdated] = useState(false);
  const lastCheck = useRef(-Infinity);
  const healthURL = `${config.routes.api.replace(/\/+$/, '')}/health`;

  useEffect(() => {
    const currentBuild = process.env.FROGBOT_BUILD_ID;

    if (!currentBuild || updated) return;

    let active = true;

    const check = () => {
      if (document.visibilityState === 'hidden') return;

      const now = Date.now();

      if (now - lastCheck.current < CHECK_INTERVAL_MS) return;

      lastCheck.current = now;

      fetch(healthURL, { cache: 'no-store', credentials: 'same-origin' })
        .then((response) => {
          const liveBuild = response.headers.get('x-frogbot-build');

          if (active && liveBuild && liveBuild !== currentBuild) setUpdated(true);
        })
        .catch(() => undefined);
    };

    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);

    return () => {
      active = false;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [healthURL, updated]);

  return (
    <div className="fb-build-notice" role="status">
      {updated && (
        <div className="fb-build-notice__card">
          <span className="fb-build-notice__text">Updated, reload</span>
          <Button onClick={() => window.location.reload()} size="sm" type="button">
            Reload
          </Button>
        </div>
      )}
    </div>
  );
}
