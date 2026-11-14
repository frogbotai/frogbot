'use client';

import { useConfig, usePathname } from '@payloadcms/ui';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../../../components/button.js';

const CHECK_INTERVAL_MS = 5000;
const CHUNK_ERROR =
  /ChunkLoadError|Loading (CSS )?chunk|Failed to load chunk|dynamically imported module/;

export type BuildNoticeProps = {
  /** The ID of the build that served this page; without one, as in `next dev`, nothing is checked. */
  buildId?: string;
};

function isChunkError(error: unknown) {
  return error instanceof Error && CHUNK_ERROR.test(`${error.name}: ${error.message}`);
}

/**
 * Shows "A new version is available" and a Refresh button once a newer production build went
 * live, by comparing `buildId` with the `x-frogbot-build` header the server sends now. It checks
 * when the tab regains focus or the admin navigates (at most every 5 seconds), and right away when
 * a script or style chunk fails to load. It never reloads by itself, so a half-written draft is
 * never lost.
 */
export function BuildNotice({ buildId }: BuildNoticeProps) {
  const { config } = useConfig();
  const pathname = usePathname();
  const [updated, setUpdated] = useState(false);
  const lastCheck = useRef(-Infinity);
  const checkRef = useRef<() => void>(() => undefined);
  const lastPath = useRef(pathname);
  const healthURL = `${config.routes.api.replace(/\/+$/, '')}/health`;

  useEffect(() => {
    if (!buildId || updated) return;

    let active = true;

    const fetchBuild = () => {
      lastCheck.current = Date.now();

      fetch(healthURL, { cache: 'no-store', credentials: 'same-origin' })
        .then((response) => {
          const liveBuild = response.headers.get('x-frogbot-build');

          if (active && liveBuild && liveBuild !== buildId) setUpdated(true);
        })
        .catch(() => undefined);
    };

    const check = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastCheck.current < CHECK_INTERVAL_MS) return;

      fetchBuild();
    };

    const onError = (event: ErrorEvent) => {
      if (isChunkError(event.error)) fetchBuild();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkError(event.reason)) fetchBuild();
    };

    checkRef.current = check;
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      active = false;
      checkRef.current = () => undefined;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [buildId, healthURL, updated]);

  useEffect(() => {
    if (pathname === lastPath.current) return;

    lastPath.current = pathname;
    checkRef.current();
  }, [pathname]);

  return (
    <div className="fb-build-notice" role="status">
      {updated && (
        <div className="fb-build-notice__card">
          <span className="fb-build-notice__text">A new version is available</span>
          <Button onClick={() => window.location.reload()} size="sm" type="button">
            Refresh
          </Button>
        </div>
      )}
    </div>
  );
}
