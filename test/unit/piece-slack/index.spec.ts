import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pieceInstanceRuntime } from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';
import { getFile, uploadFile } from '../../../packages/pieces/piece-slack/src/actions.js';
import { createSlackClient } from '../../../packages/pieces/piece-slack/src/client.js';
import {
  createSlack,
  slackActionNames,
  slackTriggerNames,
} from '../../../packages/pieces/piece-slack/src/index.js';
import {
  channelMessageCreated,
  modalInteraction,
} from '../../../packages/pieces/piece-slack/src/triggers.js';
import {
  parseSlackWebhook,
  verifySlackWebhook,
} from '../../../packages/pieces/piece-slack/src/webhook.js';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

const signingSecret = 'slack-signing-secret';
const now = 1_789_200_000_000;

function signedRequest(body: string, timestamp = Math.floor(now / 1000)) {
  const signature = `v0=${createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex')}`;

  return new Request('https://example.com/hooks/slack', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-slack-request-timestamp': String(timestamp),
      'x-slack-signature': signature,
    },
    body,
  }) as FrogBotRequest;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Slack native piece', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  it('registers all actions and triggers and maps OAuth v2 tokens and accounts', async () => {
    expect(slackActionNames).toHaveLength(24);
    expect(slackTriggerNames).toHaveLength(14);

    const definition = pieceInstanceRuntime(createSlack()).definition;

    expect(definition.oauth?.authorizationUrl).toBe('https://slack.com/oauth/v2/authorize');
    expect(definition.oauth?.tokenUrl).toBe('https://slack.com/api/oauth.v2.access');
    expect(
      definition.oauth?.toAuth?.({
        tokens: {
          access_token: 'xoxb-bot',
          authed_user: { access_token: 'xoxp-user' },
          team: { id: 'T1' },
        },
      }),
    ).toEqual({ botToken: 'xoxb-bot', userToken: 'xoxp-user', teamId: 'T1' });
    await expect(
      definition.oauth?.account?.({
        tokens: { access_token: 'xoxb-bot' },
        client: { request: vi.fn().mockResolvedValue({ ok: true, team_id: 'T1', team: 'Frogs' }) },
        req: {} as FrogBotRequest,
      }),
    ).resolves.toEqual({ id: 'T1', label: 'Frogs' });
  });

  it('creates the Slack channel adapter from bot credentials', () => {
    const definition = pieceInstanceRuntime(
      createSlack({
        auth: { botToken: 'xoxb-test' },
        signingSecret,
      }),
    ).definition;
    const adapter = definition.channel?.adapter({
      auth: { botToken: 'xoxb-test' },
      options: { signingSecret },
    });

    expect(adapter?.name).toBe('slack');
  });

  it('requires the signing secret used by shared ingress even when an environment fallback exists', () => {
    vi.stubEnv('SLACK_SIGNING_SECRET', 'environment-secret');

    try {
      const definition = pieceInstanceRuntime(createSlack()).definition;

      expect(() =>
        definition.channel?.adapter({ auth: { botToken: 'xoxb-test' }, options: {} }),
      ).toThrow('signingSecret');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('ships a channel manifest templated by the piece instance slug', async () => {
    const manifest = await readFile(
      new URL('../../../packages/pieces/piece-slack/slack-manifest.yaml', import.meta.url),
      'utf8',
    );

    expect(manifest).toContain(
      "request_url: '{{FROGBOT_URL}}/api/webhooks/{{SLACK_INSTANCE_SLUG}}'",
    );
    expect(manifest).toContain('- users:read\n');
    expect(manifest).toContain('- users:read.email\n');
  });

  it('matches Slack authors to FrogBot users by profile email', async () => {
    const user = { id: 'user-1', email: 'frog@example.com' };
    const find = vi.fn().mockResolvedValue({ docs: [user] });
    const definition = pieceInstanceRuntime(createSlack()).definition;

    const identity = await definition.channel?.identity({
      author: { userId: 'U1' } as never,
      client: {
        request: vi.fn().mockResolvedValue({
          ok: true,
          user: { profile: { email: ' Frog@Example.com ' } },
        }),
      } as never,
      req: {
        frogbot: {
          config: {
            _internal: { payloadConfig: Promise.resolve({ admin: { user: 'members' } }) },
          },
          find,
        },
      } as unknown as FrogBotRequest,
    });

    expect(identity).toEqual({ ...user, collection: 'members' });
    expect(find).toHaveBeenCalledWith({
      collection: 'members',
      where: { email: { equals: 'frog@example.com' } },
      limit: 1,
      overrideAccess: true,
      req: expect.any(Object),
    });
  });

  it('keeps Slack authors anonymous when Slack has no email or FrogBot has no match', async () => {
    const definition = pieceInstanceRuntime(createSlack()).definition;
    const find = vi.fn().mockResolvedValue({ docs: [] });
    const req = {
      frogbot: {
        config: {
          _internal: { payloadConfig: Promise.resolve({ admin: { user: 'users' } }) },
        },
        find,
      },
    } as unknown as FrogBotRequest;

    await expect(
      definition.channel?.identity({
        author: { userId: 'U1' } as never,
        client: {
          request: vi.fn().mockResolvedValue({ ok: true, user: { profile: {} } }),
        } as never,
        req,
      }),
    ).resolves.toBeNull();
    expect(find).not.toHaveBeenCalled();

    await expect(
      definition.channel?.identity({
        author: { userId: 'U1' } as never,
        client: {
          request: vi.fn().mockResolvedValue({
            ok: true,
            user: { profile: { email: 'unknown@example.com' } },
          }),
        } as never,
        req,
      }),
    ).resolves.toBeNull();
  });

  it('propagates Slack identity lookup failures instead of granting anonymous access', async () => {
    const error = new Error('Slack API request failed: missing_scope');
    const definition = pieceInstanceRuntime(createSlack()).definition;

    await expect(
      definition.channel?.identity({
        author: { userId: 'U1' } as never,
        client: { request: vi.fn().mockRejectedValue(error) } as never,
        req: {} as FrogBotRequest,
      }),
    ).rejects.toBe(error);
  });

  it('uses the stored token and validates Slack responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ok: true, channel: 'C1' }))
      .mockResolvedValueOnce(Response.json({ ok: false, error: 'not_in_channel' }));
    vi.stubGlobal('fetch', fetch);
    const client = createSlackClient({ auth: { botToken: 'xoxb-test' } });

    await expect(client.request('chat.postMessage', { channel: 'C1' })).resolves.toMatchObject({
      ok: true,
    });
    expect(new Headers(fetch.mock.calls[0][1].headers).get('authorization')).toBe(
      'Bearer xoxb-test',
    );
    await expect(client.request('chat.postMessage')).rejects.toThrow('not_in_channel');
  });

  it('loads a local file safely and completes Slack external upload', async () => {
    const fetch = vi.fn(async (value: URL | RequestInfo) => {
      const url = String(value);

      if (url === 'https://example.com/files/test') return new Response('file contents');
      if (url === 'https://files.slack.com/upload/test') return new Response('ok');
      if (url.endsWith('/files.getUploadURLExternal')) {
        return Response.json({
          ok: true,
          upload_url: 'https://files.slack.com/upload/test',
          file_id: 'F1',
        });
      }

      return Response.json({ ok: true, files: [{ id: 'F1' }] });
    });
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    const req = {
      headers: new Headers({ authorization: 'Bearer local' }),
      signal,
      url: 'https://example.com/action',
      frogbot: {
        config: {
          files: { slug: 'files' },
          _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://example.com' }) },
        },
        findByID: vi.fn().mockResolvedValue({
          url: '/files/test',
          filename: 'test.txt',
        }),
      },
    } as unknown as FrogBotRequest;

    await expect(
      uploadFile.run({
        client: createSlackClient({ auth: { botToken: 'xoxb-test' } }),
        input: { file: { fileId: 'local-file' } },
        options: {},
        req,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://example.com/files/test'),
      expect.objectContaining({ redirect: 'error', signal }),
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://files.slack.com/upload/test'),
      expect.objectContaining({ redirect: 'error', signal }),
    );
  });

  it('persists downloaded Slack files with response metadata and request access', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'saved', url: '/files/saved' });
    const signal = new AbortController().signal;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          file: {
            id: 'F1',
            name: 'report.pdf',
            url_private_download: 'https://files.slack.com/files/report.pdf',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response('pdf bytes', {
          headers: { 'content-type': 'application/pdf; charset=binary' },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const req = {
      headers: new Headers(),
      signal,
      frogbot: { config: { files: { slug: 'files' } }, create },
    } as unknown as FrogBotRequest;

    const result = await getFile.run({
      client: createSlackClient({ auth: { botToken: 'xoxb-test' } }),
      input: { fileId: 'F1' },
      options: {},
      req,
    });

    expect(create).toHaveBeenCalledWith({
      collection: 'files',
      data: {},
      file: {
        data: Buffer.from('pdf bytes'),
        name: 'report.pdf',
        mimetype: 'application/pdf',
        size: 9,
      },
      req,
      overrideAccess: false,
    });
    expect(result.data).toEqual({
      id: 'saved',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      size: 9,
      url: '/files/saved',
    });
    expect(fetch).toHaveBeenLastCalledWith(
      new URL('https://files.slack.com/files/report.pdf'),
      expect.objectContaining({ redirect: 'error', signal }),
    );
  });

  it('answers challenges and accepts valid Slack retries within the timestamp window', async () => {
    const body = `\n${JSON.stringify({ challenge: 'challenge' }, null, 2)}\n`;
    const req = signedRequest(body);
    req.data = { challenge: 'challenge' };

    await expect(
      verifySlackWebhook({ req: req.clone() as FrogBotRequest, options: { signingSecret } }),
    ).resolves.toBe(true);
    await expect(
      verifySlackWebhook({ req: req.clone() as FrogBotRequest, options: { signingSecret } }),
    ).resolves.toBe(true);

    const response = await pieceInstanceRuntime(
      createSlack({ signingSecret }),
    ).definition.webhook?.handshake?.({ req, options: { signingSecret } });

    await expect(response?.text()).resolves.toBe('challenge');
  });

  it('rejects stale and altered signatures', async () => {
    const body = JSON.stringify({ event: { type: 'message' } });

    await expect(
      verifySlackWebhook({
        req: signedRequest(body, Math.floor(now / 1000) - 301),
        options: { signingSecret },
      }),
    ).resolves.toBe(false);

    const req = signedRequest(body);
    req.headers.set('x-slack-signature', `v0=${'0'.repeat(64)}`);

    await expect(verifySlackWebhook({ req, options: { signingSecret } })).resolves.toBe(false);
  });

  it('parses and filters Events API deliveries', async () => {
    const req = signedRequest('{}');
    req.data = {
      team_id: 'T1',
      event: { type: 'message', channel_type: 'channel', channel: 'C1', text: 'hello' },
    };

    expect(parseSlackWebhook(req)).toEqual({ event: 'message' });

    const emitted = await channelMessageCreated.run({
      client: createSlackClient({ auth: { botToken: 'xoxb-test', teamId: 'T1' } }),
      input: { channel: 'C1', ignoreBots: false },
      options: {},
      req,
    });

    expect(emitted[0]?.data).toMatchObject({ channel: 'C1' });
  });

  it('rejects a trigger delivery from another Slack workspace', async () => {
    const req = signedRequest('{}');
    req.data = {
      team_id: 'T2',
      event: { type: 'message', channel_type: 'channel', channel: 'C1', text: 'hello' },
    };

    await expect(
      channelMessageCreated.run({
        client: createSlackClient({ auth: { botToken: 'xoxb-test', teamId: 'T1' } }),
        input: { channel: 'C1', ignoreBots: false },
        options: {},
        req,
      }),
    ).resolves.toEqual([]);
  });

  it('parses modal interactions and strips their token', async () => {
    const req = signedRequest('payload=encoded');
    req.data = {
      payload: JSON.stringify({
        type: 'view_submission',
        token: 'secret',
        team: { id: 'T1' },
        view: { id: 'V1' },
      }),
    };

    expect(parseSlackWebhook(req)).toEqual({ event: 'modal_interaction' });

    const emitted = await modalInteraction.run({
      client: createSlackClient({ auth: { botToken: 'xoxb-test', teamId: 'T1' } }),
      input: { interactionType: 'view_submission' },
      options: {},
      req,
    });

    expect(emitted[0]?.data).toEqual({
      type: 'view_submission',
      team: { id: 'T1' },
      view: { id: 'V1' },
    });
  });
});
