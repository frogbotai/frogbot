import { getPayloadPopulateFn } from '@payloadcms/richtext-lexical';
import type { Frogbot, FrogbotRequest } from 'frogbot';
import type { PayloadRequest } from 'payload';

type PopulateFn = Awaited<ReturnType<typeof getPayloadPopulateFn>>;
type CommonArgs = Omit<Parameters<typeof getPayloadPopulateFn>[0], 'payload' | 'req'>;
type Args = CommonArgs &
  ({ frogbot: Frogbot; req?: never } | { frogbot?: never; req: FrogbotRequest });
type RuntimeRequest = FrogbotRequest & PayloadRequest;

export async function getFrogbotPopulateFn(args: Args): Promise<PopulateFn> {
  const hasFrogbot = args.frogbot !== undefined;
  const hasRequest = args.req !== undefined;

  if (hasFrogbot === hasRequest) {
    throw new Error('FrogBot rich text population requires exactly one of frogbot or req.');
  }

  const req =
    args.req ??
    (await args.frogbot.createRequest(
      args.locale === undefined ? undefined : { locale: args.locale },
    ));
  const { frogbot: _frogbot, ...options } = args;

  return getPayloadPopulateFn({
    ...options,
    req: req as RuntimeRequest,
  });
}
