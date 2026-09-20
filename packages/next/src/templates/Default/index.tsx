import {
  DefaultTemplate as PayloadDefaultTemplate,
  type DefaultTemplateProps as PayloadDefaultTemplateProps,
} from '@payloadcms/next/templates';
import type { FrogbotRequest } from 'frogbot';

export type DefaultTemplateProps = Omit<
  PayloadDefaultTemplateProps,
  'globalSlug' | 'payload' | 'req'
> & {
  req: FrogbotRequest;
};

type IssuedRequest = FrogbotRequest & {
  [key: symbol]: unknown;
};

function getIssuedRuntime(req: FrogbotRequest): PayloadDefaultTemplateProps['payload'] {
  const issued = req as IssuedRequest;
  const payload = issued[Symbol.for('@frogbotai/request-runtime')];

  if (!issued.frogbot || !payload || typeof payload !== 'object') {
    throw new Error(
      '[frogbot] DefaultTemplate requires the request issued for the current admin page.',
    );
  }

  return payload as PayloadDefaultTemplateProps['payload'];
}

export function DefaultTemplate({ req, ...props }: DefaultTemplateProps) {
  return <PayloadDefaultTemplate {...props} payload={getIssuedRuntime(req)} req={req as never} />;
}
