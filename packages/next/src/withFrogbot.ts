import type { NextConfig } from 'next';
import { withPayload } from '@payloadcms/next/withPayload';

type WithFrogbotOptions = {
  devBundleServerPackages?: boolean;
};

export function withFrogbot(nextConfig: NextConfig = {}, options: WithFrogbotOptions = {}): NextConfig {
  return withPayload(nextConfig, options);
}
