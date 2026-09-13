import { withFrogbot } from '@frogbotai/next/config';

const nextConfig = {
  serverExternalPackages: [
    '@activepieces/piece-data-summarizer',
    '@activepieces/piece-date-helper',
    '@activepieces/piece-linear',
    '@activepieces/piece-pdf',
    '@activepieces/piece-resend',
  ],
};

export default withFrogbot(nextConfig, { devBundleServerPackages: false });
