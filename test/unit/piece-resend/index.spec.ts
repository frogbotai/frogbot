import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceActionDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { pieceCapabilities } from '../../../packages/frogbot/src/pieces/types.js';
import { createResend, resendActions } from '../../../packages/pieces/piece-resend/src/index.js';

afterEach(() => vi.unstubAllGlobals());

describe('resend', () => {
  it('exposes all 22 native actions', () => {
    const resend = createResend({ auth: { apiKey: 'key' } });
    expect(pieceInstanceTools(resend)?.map(({ slug }) => slug)).toEqual(
      resendActions.map((action) => `resend_${action}`),
    );
    expect(resendActions).toHaveLength(22);
  });

  it('classifies retry-safe actions from the upstream contract', () => {
    const resend = createResend({ auth: { apiKey: 'key' } });
    const classifications = Object.fromEntries(
      resendActions.map((slug) => [slug, pieceActionDefinition(resend[slug])?.idempotent]),
    );
    expect(classifications).toEqual({
      send: false,
      sendBatchEmails: false,
      getEmailStatus: true,
      listEmails: true,
      cancelScheduledEmail: false,
      rescheduleEmail: false,
      createContact: false,
      updateContact: false,
      deleteContact: false,
      listContacts: true,
      listDomains: true,
      createDomain: false,
      deleteDomain: false,
      verifyDomain: false,
      listAudiences: true,
      createAudience: false,
      deleteAudience: false,
      listBroadcasts: true,
      createBroadcast: false,
      sendBroadcast: false,
      deleteBroadcast: false,
      customApiCall: undefined,
    });
  });

  it('uses the same authenticated transport for direct and tool calls', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const req = {
      frogbot: {
        connections: {
          resolvePieceCredential: vi
            .fn()
            .mockResolvedValue({ auth: { apiKey: 'sk-test' }, key: {} }),
        },
      },
      user: null,
    } as never;
    const resend = createResend({ auth: { apiKey: 'sk-test' } });
    const input = {
      to: ['to@example.com'],
      from_name: 'FrogBot',
      from: 'from@example.com',
      subject: 'Test',
      content_type: 'text',
      content: 'Body',
    };
    await resend.send({ input, req });
    await pieceInstanceTools(resend)?.[0]?.execute(input, { req } as never);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);
    expect(body).toMatchObject({
      from: 'FrogBot <from@example.com>',
      reply_to: 'from@example.com',
      text: 'Body',
    });
  });

  it('sends config email through the native email capability', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'email-id' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const auth = { apiKey: 'sk-test' };
    const req = {
      frogbot: {
        connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
      },
      user: null,
    } as never;
    const resend = createResend({
      auth,
      from: { address: 'from@example.com', name: 'FrogBot' },
    });
    const client = await resend.client({ req });
    await resend[pieceCapabilities].email.send({
      message: { to: 'to@example.com', subject: 'Subject', text: 'Body' },
      client,
      options: { from: { address: 'from@example.com', name: 'FrogBot' } },
      req,
    });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      from: 'FrogBot <from@example.com>',
      to: 'to@example.com',
      subject: 'Subject',
      text: 'Body',
    });
  });

  it('preserves batch endpoint, content conversion, and idempotency', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'email-id' }] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetch);
    const auth = { apiKey: 'sk-test' };
    const req = {
      frogbot: {
        connections: {
          resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }),
        },
      },
      user: null,
    } as never;
    await expect(
      createResend({ auth }).sendBatchEmails({
        input: {
          emails: [
            {
              from: 'from@example.com',
              to: 'to@example.com',
              subject: 'Subject',
              content_type: 'html',
              content: '<p>Body</p>',
            },
          ],
          idempotency_key: 'request-id',
        },
        req,
      }),
    ).resolves.toEqual([{ id: 'email-id' }]);
    expect(fetch.mock.calls[0]?.[0].pathname).toBe('/emails/batch');
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      'Idempotency-Key': 'request-id',
    });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual([
      {
        from: 'from@example.com',
        to: 'to@example.com',
        subject: 'Subject',
        html: '<p>Body</p>',
      },
    ]);
  });

  it('converts broadcast content and preserves scheduling fields', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'id' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const auth = { apiKey: 'sk-test' };
    const req = {
      frogbot: {
        connections: {
          resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }),
        },
      },
      user: null,
    } as never;
    const resend = createResend({ auth });
    await resend.createBroadcast({
      input: {
        audience_id: 'audience',
        from: 'from@example.com',
        subject: 'Subject',
        content_type: 'text',
        content: 'Body',
      },
      req,
    });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      audience_id: 'audience',
      from: 'from@example.com',
      subject: 'Subject',
      text: 'Body',
    });
    await resend.rescheduleEmail({
      input: { email_id: 'email', scheduled_at: '2030-01-01T00:00:00Z' },
      req,
    });
    expect(JSON.parse(fetch.mock.calls[1]?.[1]?.body as string)).toEqual({
      scheduled_at: '2030-01-01T00:00:00Z',
    });
  });

  it('preserves custom JSON, headers, query, and response metadata', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', 'X-Result': 'created' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const auth = { apiKey: 'sk-test' };
    const req = {
      frogbot: {
        connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
      },
      user: null,
    } as never;
    await expect(
      createResend({ auth }).customApiCall({
        input: {
          method: 'POST',
          url: '/custom',
          headers: { 'X-Custom': 'value' },
          queryParams: { page: 2 },
          body_type: 'json',
          body: { data: { name: 'FrogBot' } },
        },
        req,
      }),
    ).resolves.toMatchObject({ status: 201, body: { ok: true } });
    expect(fetch.mock.calls[0]?.[0].searchParams.get('page')).toBe('2');
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'X-Custom': 'value' });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({ name: 'FrogBot' });
  });

  it('encodes custom multipart forms and raw bodies', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const auth = { apiKey: 'sk-test' };
    const req = {
      frogbot: {
        connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
      },
      user: null,
    } as never;
    const resend = createResend({ auth });
    await resend.customApiCall({
      input: {
        method: 'POST',
        url: '/form',
        body_type: 'form_data',
        body: {
          data: [
            { fieldName: 'name', fieldType: 'text', textFieldValue: 'FrogBot' },
            {
              fieldName: 'file',
              fieldType: 'file',
              fileFieldValue: { data: new Uint8Array([1, 2]), filename: 'file.bin' },
            },
          ],
        },
      },
      req,
    });
    const form = fetch.mock.calls[0]?.[1]?.body as FormData;
    expect(form.get('name')).toBe('FrogBot');
    expect((form.get('file') as File).name).toBe('file.bin');
    await resend.customApiCall({
      input: { method: 'POST', url: '/raw', body_type: 'raw', body: { data: 'raw body' } },
      req,
    });
    expect(fetch.mock.calls[1]?.[1]?.body).toBe('raw body');
  });

  it('writes custom binary responses through configured file storage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      ),
    );
    const auth = { apiKey: 'sk-test' };
    const create = vi.fn().mockResolvedValue({ url: '/api/files/output.pdf' });
    const req = {
      frogbot: {
        config: { files: { slug: 'files' } },
        create,
        connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
      },
      user: null,
    } as never;
    await expect(
      createResend({ auth }).customApiCall({
        input: { method: 'GET', url: '/binary', response_is_binary: true },
        req,
      }),
    ).resolves.toMatchObject({ status: 200, body: '/api/files/output.pdf' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'files',
        file: expect.objectContaining({ name: 'output.pdf' }),
      }),
    );
  });

  it('surfaces Resend errors without swallowing response context', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: 'invalid recipient' }), { status: 422 }),
        ),
    );
    const req = {
      frogbot: {
        connections: {
          resolvePieceCredential: vi
            .fn()
            .mockResolvedValue({ auth: { apiKey: 'sk-test' }, key: {} }),
        },
      },
      user: null,
    } as never;
    await expect(
      createResend({ auth: { apiKey: 'sk-test' } }).send({
        input: {
          to: ['invalid'],
          from_name: 'FrogBot',
          from: 'from@example.com',
          subject: 'Subject',
          content_type: 'text',
          content: 'Body',
        },
        req,
      }),
    ).rejects.toThrow('Resend request failed (422): invalid recipient');
  });
});
