import { createFileHelper } from '@frogbotai/piece-file-helper';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const fileHelper = createFileHelper();

const check = fileHelper.checkFileType({ input: { file: 1, mimeType: 'text/plain' }, req });

expectTypeOf<Parameters<typeof fileHelper.checkFileType>[0]['input']>().toEqualTypeOf<{
  file: string | number;
  mimeType: string;
}>();
expectTypeOf(check).toEqualTypeOf<Promise<{ mimeType: string; isMatch: boolean }>>();

const _checkFileTypeRejectsCreateFileInput = () =>
  // @ts-expect-error checkFileType does not accept createFile input
  fileHelper.checkFileType({ input: { content: 'Hello', fileName: 'hello.txt' }, req });

expectTypeOf(fileHelper.getFileName({ input: { file: 1 }, req })).toEqualTypeOf<
  Promise<{ fileName: string }>
>();
