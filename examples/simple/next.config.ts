import { withFrogbot } from '@frogbotai/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default withFrogbot(nextConfig, { devBundleServerPackages: false });
