import { withFrogbot } from '@frogbotai/next/config';

const nextConfig = {
  serverExternalPackages: [
    '@activepieces/piece-linear',
    '@activepieces/piece-resend',
  ],
};

export default withFrogbot(nextConfig, { devBundleServerPackages: false });
