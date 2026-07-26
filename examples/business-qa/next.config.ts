import { withFrogbot } from '@frogbotai/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@activepieces/piece-data-summarizer',
    '@activepieces/piece-date-helper',
    '@activepieces/piece-google-calendar',
    '@activepieces/piece-google-drive',
    '@activepieces/piece-google-sheets',
    '@activepieces/piece-linear',
    '@activepieces/piece-pdf',
    '@activepieces/piece-resend',
  ],
};

export default withFrogbot(nextConfig, { devBundleServerPackages: false });
