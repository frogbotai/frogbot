import config from '@frogbot-config';
import { getFrogbot } from 'frogbot';
import { notFound } from 'next/navigation';

import { pagesSlug } from '../../../../shared';
import { PageClient } from './page.client';

type Args = {
  params: Promise<{ slug: string }>;
};

export default async function Page({ params }: Args) {
  const { slug } = await params;
  const frogbot = await getFrogbot({ config });
  const result = await frogbot.find({
    collection: pagesSlug,
    where: { slug: { equals: slug } },
    draft: true,
    limit: 1,
  });
  const page = result.docs[0];

  if (!page) {
    notFound();
  }

  return <PageClient page={page} />;
}
