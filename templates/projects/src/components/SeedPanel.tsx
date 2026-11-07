import { getCachedFrogBot } from 'frogbot';

import { hasRecords } from '../seed';
import { SeedButton } from './SeedButton';

/** The dashboard's Seed panel, shown only while the app has none of the starter's records. */
export async function SeedPanel() {
  const frogbot = getCachedFrogBot();

  if (frogbot && (await hasRecords(frogbot))) return null;

  return <SeedButton />;
}
