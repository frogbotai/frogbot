const DOCS = 'https://docs.frogbot.ai';

/**
 * Payload's docs pages that its own messages link to, with the FrogBot page that answers the
 * same question. `scripts/check-messages.mjs` fails when a FrogBot page here goes missing.
 */
export const UPSTREAM_DOCS: Record<string, string> = {
  'email/overview': 'email/overview',
  'typescript/generating-types#block-interface-name-collisions':
    'typescript/generating-types#block-interface-name-collisions',
  'upload/overview#skip-safe-fetch': 'upload/overview#uploading-files-from-remote-urls',
  'upload/storage-adapters': 'upload/storage-adapters',
  'upload/transformers': 'upload/overview#image-sizes',
};

const CODEMOD_HINT =
  /Run `npx @payloadcms\/codemod --transform migrate-sharp-to-transformer` to migrate automatically, or see (\S+?)\.?$/m;

const DOCS_LINK = /https:\/\/payloadcms\.com\/docs\/([\w/-]+(?:#[\w-]+)?)/g;

const UPSTREAM_PACKAGE = /@payloadcms\/(transformer-sharp|storage-[\w-]+|richtext-lexical)\b/g;

/**
 * Rewrites a message from Payload so it points at FrogBot: its docs links go to the FrogBot page
 * that answers the same question (or the FrogBot docs home when there isn't one), its codemod
 * hint goes, and the packages it names become their `@frogbotai/` equivalents.
 */
export function toFrogBotMessage(message: string): string {
  return message
    .replace(CODEMOD_HINT, 'See $1.')
    .replace(DOCS_LINK, (_, page: string) => {
      const frogbotPage = UPSTREAM_DOCS[page] ?? UPSTREAM_DOCS[page.split('#')[0]];

      return frogbotPage ? `${DOCS}/${frogbotPage}` : DOCS;
    })
    .replace(UPSTREAM_PACKAGE, '@frogbotai/$1');
}
