import config from '@frogbot-config';
import { createGatewayHandler, getFrogbot } from 'frogbot';

const handler = async (request: Request): Promise<Response> => {
  const frogbot = await getFrogbot({ config });
  return createGatewayHandler(frogbot)(request);
};

export {
  handler as DELETE,
  handler as GET,
  handler as OPTIONS,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
