import type { FrogbotRequest } from 'frogbot';
import type { PieceOption } from 'frogbot/pieces';
import { z } from 'zod';

import { type DriveRunArgs, type GoogleDriveClient, requestOptions } from '../client.js';
import { downloadDriveFile } from '../files.js';
import {
  type DriveFile,
  fileOutput,
  folderMimeType,
  id,
  savedFileOutput,
  sharedDrive,
} from '../schemas.js';

export function queryLiteral(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

async function listPages({
  client,
  req,
  query,
  includeSharedDrives,
}: {
  client: GoogleDriveClient;
  req: FrogbotRequest;
  query: string;
  includeSharedDrives: boolean;
}): Promise<{ files: DriveFile[]; incompleteSearch: boolean }> {
  const files: DriveFile[] = [];
  const tokens = new Set<string>();
  let pageToken: string | undefined;
  let incompleteSearch = false;
  do {
    const response = await client.files.list(
      {
        q: query,
        fields: 'nextPageToken,incompleteSearch,files(*)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: includeSharedDrives,
        corpora: includeSharedDrives ? 'allDrives' : 'user',
        pageSize: 1000,
        pageToken,
      },
      requestOptions(req),
    );
    files.push(...z.array(fileOutput).parse(response.data.files ?? []));
    incompleteSearch ||= response.data.incompleteSearch ?? false;
    pageToken = response.data.nextPageToken ?? undefined;
    if (pageToken) {
      if (tokens.has(pageToken)) throw new Error('[frogbot] Google Drive repeated a page token.');
      tokens.add(pageToken);
    }
  } while (pageToken);
  return { files, incompleteSearch };
}

export async function folderOptions({
  client,
  req,
  input,
}: {
  client: GoogleDriveClient;
  req: FrogbotRequest;
  input: { includeSharedDrives?: boolean };
}): Promise<PieceOption[]> {
  const result = await listPages({
    client,
    req,
    query: `mimeType = '${folderMimeType}' and trashed = false`,
    includeSharedDrives: input.includeSharedDrives ?? false,
  });
  return result.files.flatMap((file) =>
    file.id ? [{ value: file.id, label: file.name ?? file.id }] : [],
  );
}

const listFilesInput = z.object({
  folderId: id,
  depth: z.number().int().min(1).default(1),
  includeTrashed: z.boolean().default(false),
  downloadFiles: z.boolean().default(false),
  ...sharedDrive,
});
const listFilesOutput = z.object({
  files: z.array(fileOutput),
  incompleteSearch: z.boolean(),
  downloadedFiles: z.array(savedFileOutput).optional(),
  downloadErrors: z.array(z.object({ fileId: z.string(), message: z.string() })).optional(),
});
export type ListFilesInput = z.input<typeof listFilesInput>;
export type ListFilesOutput = z.output<typeof listFilesOutput>;
export const listFiles = {
  slug: 'listFiles' as const,
  description:
    'List a Drive folder recursively to the requested depth, optionally downloading files into FrogBot.',
  input: listFilesInput,
  output: listFilesOutput,
  idempotent: false,
  async run({ client, input, req }: DriveRunArgs<typeof listFilesInput>): Promise<ListFilesOutput> {
    const result: ListFilesOutput = { files: [], incompleteSearch: false };
    const pending = [{ folderId: input.folderId, level: 1 }];
    const visited = new Set<string>();
    for (let index = 0; index < pending.length; index++) {
      const folder = pending[index]!;
      if (visited.has(folder.folderId)) continue;
      visited.add(folder.folderId);
      const query = `${queryLiteral(folder.folderId)} in parents${input.includeTrashed ? '' : ' and trashed = false'}`;
      const page = await listPages({
        client,
        req,
        query,
        includeSharedDrives: input.includeSharedDrives,
      });
      result.files.push(...page.files);
      result.incompleteSearch ||= page.incompleteSearch;
      if (folder.level < input.depth) {
        for (const file of page.files) {
          if (file.id && file.mimeType === folderMimeType) {
            pending.push({ folderId: file.id, level: folder.level + 1 });
          }
        }
      }
    }
    if (input.downloadFiles) {
      result.downloadedFiles = [];
      result.downloadErrors = [];
      for (const file of result.files) {
        if (file.mimeType === folderMimeType) continue;
        try {
          if (!file.id) throw new Error('[frogbot] Google Drive file is missing its ID.');
          result.downloadedFiles.push(
            await downloadDriveFile({
              client,
              req,
              fileId: file.id,
              metadata: file,
              includeSharedDrives: input.includeSharedDrives,
            }),
          );
        } catch (error) {
          req.signal?.throwIfAborted();
          result.downloadErrors.push({
            fileId: file.id ?? '',
            message: error instanceof Error ? error.message : 'Download failed.',
          });
        }
      }
    }
    return result;
  },
};

const searchFilesInput = z.object({
  query: z.string(),
  queryTerm: z.enum(['name', 'fullText', 'mimeType']).default('name'),
  operator: z.enum(['contains', '=']).default('contains'),
  type: z.enum(['all', 'file', 'folder']).default('all'),
  parentFolderId: id.optional(),
  ...sharedDrive,
});
export type SearchFilesInput = z.input<typeof searchFilesInput>;
export const searchFiles = {
  slug: 'searchFiles' as const,
  description:
    'Search all pages of Google Drive files or folders by name, full text, or MIME type.',
  input: searchFilesInput,
  output: z.array(fileOutput),
  idempotent: true,
  options: { parentFolderId: folderOptions },
  async run({ client, input, req }: DriveRunArgs<typeof searchFilesInput>): Promise<DriveFile[]> {
    const query = [`${input.queryTerm} ${input.operator} ${queryLiteral(input.query)}`];
    if (input.parentFolderId) query.push(`${queryLiteral(input.parentFolderId)} in parents`);
    if (input.type !== 'all') {
      query.push(`mimeType ${input.type === 'file' ? '!=' : '='} '${folderMimeType}'`);
    }
    return (
      await listPages({
        client,
        req,
        query: query.join(' and '),
        includeSharedDrives: input.includeSharedDrives,
      })
    ).files;
  },
};
