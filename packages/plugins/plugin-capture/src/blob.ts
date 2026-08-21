import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';

import type { CaptureRecord } from './types.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export async function encodeCapture(capture: CaptureRecord): Promise<Uint8Array> {
  return gzipAsync(JSON.stringify(capture));
}

export async function decodeCapture(bytes: Uint8Array): Promise<CaptureRecord> {
  return JSON.parse((await gunzipAsync(bytes)).toString('utf8')) as CaptureRecord;
}

export function captureBlobKey(captureId: string, date = new Date()): string {
  return `${date.toISOString().slice(0, 10)}/${captureId}.json.gz`;
}
