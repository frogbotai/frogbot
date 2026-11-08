import { getCachedFrogBot } from 'frogbot';

import { hasSampleData } from '../seed';
import { SeedButton } from './SeedButton';

/** Shows the Seed button on the dashboard while the app has no sample data. */
export async function SeedPanel() {
  const frogbot = getCachedFrogBot();

  if (frogbot && (await hasSampleData({ frogbot }))) return null;

  return <SeedButton />;
}
