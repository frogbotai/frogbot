import { withFrogbot } from '@frogbotai/next/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@frogbotai/piece-brave-search', '@frogbotai/piece-exa'],
};

export default withFrogbot(nextConfig, { devBundleServerPackages: false });
