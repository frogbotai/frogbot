import {
  createGoogleDrive,
  type ListFilesInput,
  type ListFilesOutput,
} from '@frogbotai/piece-google-drive';
import { expectTypeOf } from 'vitest';

const drive = createGoogleDrive({ auth: { accessToken: 'token' } });

const listed = drive.listFiles({ input: { folderId: 'folder', depth: 2, downloadFiles: true } });

expectTypeOf<Parameters<typeof drive.listFiles>[0]['input']>().toEqualTypeOf<ListFilesInput>();
expectTypeOf<Parameters<typeof drive.listFiles>[0]['input']['depth']>().toEqualTypeOf<
  number | undefined
>();
expectTypeOf(listed).toEqualTypeOf<Promise<ListFilesOutput>>();
expectTypeOf<Awaited<typeof listed>['incompleteSearch']>().toEqualTypeOf<boolean>();

const _listFilesRejectsSearchFilesInput = () =>
  // @ts-expect-error listFiles does not accept searchFiles input
  drive.listFiles({ input: { query: 'report' } });
