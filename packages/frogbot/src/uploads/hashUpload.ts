import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export type HashUploadProps = {
  data?: Uint8Array;
  tempFilePath?: string;
};

export async function hashUpload({ data, tempFilePath }: HashUploadProps): Promise<string> {
  const hash = createHash('sha256');

  if (data?.byteLength || !tempFilePath) return hash.update(data ?? new Uint8Array()).digest('hex');

  for await (const chunk of createReadStream(tempFilePath)) hash.update(chunk as Buffer);

  return hash.digest('hex');
}
