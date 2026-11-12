'use client';

import { BuildNotice } from '@frogbotai/ui/admin';

/**
 * Gives the admin's build notice the build ID `withFrogBot` inlined into this client bundle.
 */
export function BuildNoticeListener() {
  return <BuildNotice buildId={process.env.FROGBOT_BUILD_ID} />;
}
