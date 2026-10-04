import { withFrogBot } from '@frogbotai/next/config';

export default withFrogBot(
  { devIndicators: false, typescript: { ignoreBuildErrors: true } },
  { devBundleServerPackages: false },
);
