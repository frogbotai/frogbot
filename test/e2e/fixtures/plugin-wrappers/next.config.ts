import { withFrogBot } from '@frogbotai/next/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default withFrogBot(nextConfig, { devBundleServerPackages: false });
