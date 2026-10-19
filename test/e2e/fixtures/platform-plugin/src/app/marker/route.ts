import config from '@frogbot-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { custom } = await (await config)._internal.payloadConfig;

  return Response.json({ marker: custom?.platformMarker ?? null });
}
