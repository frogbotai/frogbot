import { withFrogbot } from '@frogbotai/next/config';

const nextConfig = {
  // The Dockerfile sets NEXT_OUTPUT=standalone to build a self-contained
  // server (`node server.js`). Local `next build` / `next start` are unaffected.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' } : {}),
};

export default withFrogbot(nextConfig, { devBundleServerPackages: false });
