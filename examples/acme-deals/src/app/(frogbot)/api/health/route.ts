import config from '@frogbot-config';
import { getFrogBot } from 'frogbot';

export const dynamic = 'force-dynamic';

const headers = { 'cache-control': 'no-store' };

export const GET = async (): Promise<Response> => {
  try {
    await getFrogBot({ config });
  } catch (error) {
    console.error('[frogbot] Health check failed:', error);

    return Response.json({ status: 'error' }, { status: 503, headers });
  }

  return Response.json({ status: 'ok' }, { headers });
};
