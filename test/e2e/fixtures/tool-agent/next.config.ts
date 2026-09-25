import { withFrogBot } from '@frogbotai/next/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@frogbotai/piece-brave-search', '@frogbotai/piece-exa'],
};

export default withFrogBot(nextConfig, { devBundleServerPackages: false });
