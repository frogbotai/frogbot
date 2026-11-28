import { problemResponse } from '../../../packages/frogbot/src/errors/afterError.js';

/** Runs an endpoint handler as Payload's route does: a thrown error becomes its `Problem` response. */
export async function routed(run: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return problemResponse(error, {
      req: { headers: new Headers({ 'x-request-id': 'req_test' }) },
    });
  }
}
