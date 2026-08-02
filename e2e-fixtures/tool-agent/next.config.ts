import { withFrogbot } from '@frogbotai/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@activepieces/piece-brave-search',
    '@activepieces/piece-exa',
    '@frogbotai/piece-brave-search',
    '@frogbotai/piece-exa',
  ],
};

export default withFrogbot(nextConfig, { devBundleServerPackages: false });
