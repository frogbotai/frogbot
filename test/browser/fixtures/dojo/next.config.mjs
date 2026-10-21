import { withFrogBot } from '@frogbotai/next/config';

export default withFrogBot(
  { typescript: { ignoreBuildErrors: true } },
  { devBundleServerPackages: false },
);
