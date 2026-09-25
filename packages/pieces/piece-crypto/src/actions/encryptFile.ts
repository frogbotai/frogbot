import type { FrogBotRequest } from 'frogbot';
import type { PieceRunArgs } from 'frogbot/pieces';
import { createMessage, encrypt, readKey } from 'openpgp';
import { z } from 'zod';

const fileId = z.union([z.string(), z.number()]);
const inputSchema = z.object({
  file: fileId.meta({ label: 'File' }),
  publicKey: z.string().meta({ label: 'Public Key' }),
});
const output = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), filename: z.string().min(1), file: fileId }),
  z.object({ success: z.literal(false), error: z.string().min(1) }),
]);

async function loadFile(req: FrogBotRequest, id: string | number) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) {
    throw new Error('Crypto file encryption requires a configured files collection.');
  }

  const doc = await req.frogbot.findByID({ collection, id, depth: 0, req, overrideAccess: false });

  if (typeof doc.url !== 'string') throw new Error(`File '${id}' is unavailable.`);

  const config = await req.frogbot.config._internal.payloadConfig;
  const base = new URL(config.serverURL || req.url!);
  const url = new URL(doc.url, base);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid file URL.');
  }

  const headers = new Headers();

  if (url.origin === base.origin) {
    for (const name of ['authorization', 'cookie']) {
      const value = req.headers.get(name);

      if (value) headers.set(name, value);
    }
  }

  const response = await fetch(url, {
    headers,
    signal: req.signal ?? undefined,
    redirect: 'error',
  });

  if (!response.ok) throw new Error(`File '${id}' is unavailable (${response.status}).`);

  return {
    data: new Uint8Array(await response.arrayBuffer()),
    name: String(doc.filename ?? 'file'),
  };
}

export const encryptFile = {
  slug: 'encryptFile',
  label: 'Encrypt File',
  description: 'Encrypt a file with an ASCII-armored OpenPGP public key.',
  input: inputSchema,
  output,
  async run({
    input,
    req,
  }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>): Promise<
    z.output<typeof output>
  > {
    try {
      const source = await loadFile(req, input.file);
      const publicKey = await readKey({ armoredKey: input.publicKey });
      const encrypted = await encrypt({
        message: await createMessage({ binary: source.data }),
        encryptionKeys: publicKey,
        format: 'armored',
      });
      const filename = `${source.name}.pgp`;
      const data = Buffer.from(encrypted);
      const collection = req.frogbot.config.files?.slug;

      if (!collection) {
        throw new Error('Crypto file encryption requires a configured files collection.');
      }

      req.signal?.throwIfAborted();

      const doc = await req.frogbot.create({
        collection,
        data: {},
        req,
        file: { data, mimetype: 'application/pgp-encrypted', name: filename, size: data.length },
        overrideAccess: false,
      });

      return { success: true, filename, file: doc.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Encryption failed',
      };
    }
  },
};
