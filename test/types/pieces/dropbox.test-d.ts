import { createDropbox } from '@frogbotai/piece-dropbox';
import { expectTypeOf } from 'vitest';

const dropbox = createDropbox({ auth: { accessToken: 'token' } });

const _file = dropbox.createTextFile({ input: { path: '/notes.txt', text: 'Hello' } });

expectTypeOf<Parameters<typeof dropbox.createTextFile>[0]['input']>().toEqualTypeOf<{
  path: string;
  text: string;
  autorename?: boolean | undefined;
  mute?: boolean | undefined;
  strictConflict?: boolean | undefined;
}>();

expectTypeOf<Awaited<typeof _file>['.tag']>().toEqualTypeOf<'file' | 'folder' | 'deleted'>();
expectTypeOf<Awaited<typeof _file>['name']>().toEqualTypeOf<string>();

const _createTextFileRejectsCopyFileInput = () =>
  // @ts-expect-error createTextFile does not accept copyFile input
  dropbox.createTextFile({ input: { fromPath: '/a.txt', toPath: '/b.txt' } });

const _copied = dropbox.copyFile({ input: { fromPath: '/a.txt', toPath: '/b.txt' } });

expectTypeOf<Awaited<typeof _copied>['metadata']['.tag']>().toEqualTypeOf<
  'file' | 'folder' | 'deleted'
>();

expectTypeOf<keyof typeof dropbox.triggers>().toEqualTypeOf<'newFolder'>();
expectTypeOf(dropbox.triggers.newFolder.type).toEqualTypeOf<'polling'>();

const app = { clientId: 'client', clientSecret: 'secret' };

createDropbox({ oauth: app, scopes: ({ defaultScopes }) => [...defaultScopes, 'sharing.read'] });

// @ts-expect-error share.read is not a Dropbox scope name
createDropbox({ oauth: app, scopes: ['share.read'] });
