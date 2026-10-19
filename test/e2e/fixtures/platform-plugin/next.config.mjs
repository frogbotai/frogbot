import { withFrogBot } from '@frogbotai/next/config';

const nextConfig = {
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' } : {}),
};

export default withFrogBot(nextConfig, { devBundleServerPackages: false });
