import {
  addDataAndFileToRequest as addPayloadDataAndFileToRequest,
  addLocalesToRequestFromData as addPayloadLocalesToRequestFromData,
  headersWithCors as payloadHeadersWithCors,
  type PayloadRequest,
} from 'payload';

import { toPayloadRequest } from '../seams/request.js';
import type { FrogBotRequest } from '../types/request.js';

export function addDataAndFileToRequest(req: FrogBotRequest): Promise<void> {
  return addPayloadDataAndFileToRequest(toPayloadRequest(req));
}

export function addLocalesToRequestFromData(req: FrogBotRequest): void {
  addPayloadLocalesToRequestFromData(toPayloadRequest(req));
}

export function headersWithCors({
  headers,
  req,
}: {
  headers: Headers;
  req: Partial<FrogBotRequest>;
}): Headers {
  return payloadHeadersWithCors({ headers, req: req as Partial<PayloadRequest> });
}
