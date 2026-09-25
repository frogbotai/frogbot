import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SerializedEditorState } from '@frogbotai/richtext-lexical/lexical';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { htmlArticlesSlug, restrictedNotesSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function paragraph(text: string): SerializedEditorState {
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 1,
              mode: 'normal',
              style: '',
              text,
              type: 'text',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  };
}

function relationship(id: number | string): SerializedEditorState {
  return {
    root: {
      children: [
        {
          format: '',
          relationTo: restrictedNotesSlug,
          type: 'relationship',
          value: id,
          version: 2,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  };
}

describe('lexicalHTMLField integration [sqlite]', () => {
  let booted: BootedFrogBot;
  let pendingTransaction: null | number | string = null;

  async function renderRelationship({
    depth,
    draft,
    id,
    req,
    showHiddenFields,
  }: {
    depth?: number;
    draft?: boolean;
    id: number | string;
    req: Awaited<ReturnType<BootedFrogBot['frogbot']['createRequest']>>;
    showHiddenFields?: boolean;
  }) {
    const collection = booted.payload.collections[htmlArticlesSlug].config;
    const field = collection.fields.find(
      (candidate) => 'name' in candidate && candidate.name === 'customHTML',
    );

    if (!field || !('hooks' in field)) throw new Error('Missing custom HTML field.');

    const afterRead = field.hooks?.afterRead?.[0];

    return afterRead!({
      collection: collection as never,
      context: {},
      currentDepth: 0,
      depth,
      draft,
      field,
      overrideAccess: false,
      req,
      showHiddenFields,
      siblingData: { content: relationship(id) },
    } as never);
  }

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'rich-text-html-field');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterEach(async () => {
    if (pendingTransaction) {
      await booted.frogbot.db.rollbackTransaction(pendingTransaction);
      pendingTransaction = null;
    }
  });

  it('generates formatted HTML at the top level and inside a group', async () => {
    const content = paragraph('Top level');
    const groupedContent = paragraph('Grouped');

    const created = await booted.frogbot.create({
      collection: htmlArticlesSlug,
      data: {
        content,
        details: { content: groupedContent },
        title: 'Generated HTML',
      },
      overrideAccess: true,
    });

    expect(created.contentHTML).toBe(
      '<div class="frogbot-richtext"><p><strong>Top level</strong></p></div>',
    );
    expect(created.details.contentHTML).toBe(
      '<div class="frogbot-richtext"><p><strong>Grouped</strong></p></div>',
    );
  });

  it('returns an empty string when the configured sibling is missing', async () => {
    const created = await booted.frogbot.create({
      collection: htmlArticlesSlug,
      data: { content: paragraph('Present'), title: 'Missing sibling' },
      overrideAccess: true,
    });

    expect(created.missingHTML).toBe('');
  });

  it('uses a custom converter function', async () => {
    const created = await booted.frogbot.create({
      collection: htmlArticlesSlug,
      data: { content: paragraph('Converted'), title: 'Custom converter' },
      overrideAccess: true,
    });

    expect(created.customHTML).toBe(
      '<div class="frogbot-richtext"><section data-converter="custom"><strong>Converted</strong></section></div>',
    );
  });

  it('regenerates HTML after updating and re-reading Lexical data', async () => {
    const created = await booted.frogbot.create({
      collection: htmlArticlesSlug,
      data: { content: paragraph('Before'), title: 'Updated HTML' },
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: htmlArticlesSlug,
      id: created.id,
      data: { content: paragraph('After') },
      overrideAccess: true,
    });

    const found = await booted.frogbot.findByID({
      collection: htmlArticlesSlug,
      id: created.id,
      overrideAccess: true,
    });

    expect(found.contentHTML).toBe(
      '<div class="frogbot-richtext"><p><strong>After</strong></p></div>',
    );
    expect(found.contentHTML).not.toContain('Before');
  });

  it('strips default HTML storage and preserves storeInDB HTML in SQLite', async () => {
    const created = await booted.frogbot.create({
      collection: htmlArticlesSlug,
      data: {
        content: paragraph('Generated'),
        contentHTML: '<p>must not persist</p>',
        storedHTML: '<p>persisted caller HTML</p>',
        title: 'Storage behavior',
      },
      overrideAccess: true,
    });

    const raw = await booted.frogbot.db.findOne<{
      contentHTML?: string | null;
      storedHTML?: string | null;
    }>({
      collection: htmlArticlesSlug,
      where: { id: { equals: created.id } },
    });

    expect(raw?.contentHTML).toBeNull();
    expect(raw?.storedHTML).toBe('<p>persisted caller HTML</p>');

    const found = await booted.frogbot.findByID({
      collection: htmlArticlesSlug,
      id: created.id,
      overrideAccess: true,
    });

    expect(found.contentHTML).toContain('Generated');
    expect(found.storedHTML).toContain('Generated');
  });

  it('uses the supplied request for access-aware population and omitted-depth fallback', async () => {
    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'reader@example.com', password: 'reader-password' },
      overrideAccess: true,
    });
    const note = await booted.frogbot.create({
      collection: restrictedNotesSlug,
      data: { title: 'Request-scoped note' },
      overrideAccess: true,
    });
    const authenticatedReq = await booted.frogbot.createRequest({
      user: { ...user, collection: usersSlug },
    });
    const anonymousReq = await booted.frogbot.createRequest();

    const visible = await renderRelationship({ id: note.id, req: authenticatedReq });
    const denied = await renderRelationship({ id: note.id, req: anonymousReq });

    expect(visible).toContain('Request-scoped note</a>');
    expect(denied).toContain('<span data-related="denied">denied</span>');
  });

  it('uses explicit depth and configured defaultDepth for nested population', async () => {
    const grandchild = await booted.frogbot.create({
      collection: restrictedNotesSlug,
      data: { title: 'Depth grandchild' },
      draft: false,
      overrideAccess: true,
    });
    const child = await booted.frogbot.create({
      collection: restrictedNotesSlug,
      data: { child: grandchild.id, title: 'Depth child' },
      draft: false,
      overrideAccess: true,
    });
    const parent = await booted.frogbot.create({
      collection: restrictedNotesSlug,
      data: { child: child.id, title: 'Depth parent' },
      draft: false,
      overrideAccess: true,
    });
    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'depth@example.com', password: 'depth-password' },
      overrideAccess: true,
    });
    const req = await booted.frogbot.createRequest({ user: { ...user, collection: usersSlug } });

    const depthZero = await renderRelationship({ depth: 0, id: parent.id, req });
    const depthOne = await renderRelationship({ depth: 1, id: parent.id, req });
    const defaultDepth = await renderRelationship({ id: parent.id, req });

    expect(depthZero).toContain('data-related="denied"');
    expect(depthOne).toContain('data-child="populated"');
    expect(defaultDepth).toContain('data-child="deep"');
  });

  it('preserves the request locale during population', async () => {
    const note = await booted.frogbot.create({
      collection: restrictedNotesSlug,
      data: { title: 'English title' },
      draft: false,
      locale: 'en',
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: restrictedNotesSlug,
      data: { title: 'Titulo espanol' },
      draft: false,
      id: note.id,
      locale: 'es',
      overrideAccess: true,
    });

    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'locale@example.com', password: 'locale-password' },
      overrideAccess: true,
    });
    const req = await booted.frogbot.createRequest({
      locale: 'es',
      user: { ...user, collection: usersSlug },
    });

    const html = await renderRelationship({ id: note.id, req });

    expect(html).toContain('Titulo espanol</a>');
    expect(html).not.toContain('English title');
  });

  it('passes draft state to population', async () => {
    const note = await booted.frogbot.create({
      collection: restrictedNotesSlug,
      data: { title: 'Published title' },
      draft: false,
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: restrictedNotesSlug,
      data: { title: 'Draft title' },
      draft: true,
      id: note.id,
      overrideAccess: true,
    });

    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'draft@example.com', password: 'draft-password' },
      overrideAccess: true,
    });
    const req = await booted.frogbot.createRequest({ user: { ...user, collection: usersSlug } });

    const published = await renderRelationship({ draft: false, id: note.id, req });
    const draft = await renderRelationship({ draft: true, id: note.id, req });

    expect(published).toContain('Published title</a>');
    expect(draft).toContain('Draft title</a>');
  });

  it('passes showHiddenFields to population', async () => {
    const note = await booted.frogbot.create({
      collection: restrictedNotesSlug,
      data: { secret: 'visible-secret', title: 'Hidden fields' },
      draft: false,
      overrideAccess: true,
    });
    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'hidden@example.com', password: 'hidden-password' },
      overrideAccess: true,
    });
    const req = await booted.frogbot.createRequest({ user: { ...user, collection: usersSlug } });

    const hidden = await renderRelationship({ id: note.id, req, showHiddenFields: false });
    const shown = await renderRelationship({ id: note.id, req, showHiddenFields: true });

    expect(hidden).toContain('data-secret="hidden"');
    expect(shown).toContain('data-secret="visible-secret"');
  });

  it('preserves transaction context for population', async () => {
    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'transaction@example.com', password: 'transaction-password' },
      overrideAccess: true,
    });
    const transactionID = await booted.frogbot.db.beginTransaction();

    expect(transactionID).toBeTruthy();

    pendingTransaction = transactionID;

    const req = await booted.frogbot.createRequest({ user: { ...user, collection: usersSlug } });

    req.transactionID = transactionID;

    const note = await booted.frogbot.create({
      collection: restrictedNotesSlug,
      data: { title: 'Uncommitted title' },
      draft: false,
      overrideAccess: true,
      req,
    });
    const html = await renderRelationship({ id: note.id, req });

    expect(html).toContain('Uncommitted title</a>');

    await booted.frogbot.db.rollbackTransaction(transactionID!);
    pendingTransaction = null;
  });
});
