import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { file, root } from './ruleTester';

const eslint = new ESLint({ cwd: root });

const MESSAGE = 'Throw a FrogBotError';

async function errorBodyBans(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: file(filePath) });

  return result.messages.filter(
    (message) => message.ruleId === 'no-restricted-syntax' && message.message.startsWith(MESSAGE),
  );
}

describe('hand-built error bodies', () => {
  it.each([
    ['an error string', "export const answer = () => Response.json({ error: 'No' });"],
    [
      'an errors array with a status',
      "export const answer = () => Response.json({ errors: [{ message: 'No' }] }, { status: 400 });",
    ],
    ['a Next response', "export const answer = () => NextResponse.json({ error: 'No' });"],
  ])('rejects %s in package source', async (_name, code) => {
    expect(await errorBodyBans('packages/frogbot/src/endpoints/answer.ts', code)).toHaveLength(1);
  });

  it.each([
    ['a success body', 'export const answer = () => Response.json({ ok: true });'],
    [
      'a status in the init',
      'export const answer = () => Response.json({ ok: 1 }, { status: 200 });',
    ],
  ])('allows %s', async (_name, code) => {
    expect(await errorBodyBans('packages/frogbot/src/endpoints/answer.ts', code)).toHaveLength(0);
  });

  it("allows the gateway's provider envelopes and the body Dojo reads", async () => {
    const code = "export const answer = () => Response.json({ error: { message: 'No' } });";

    expect(
      await errorBodyBans('packages/gateway/src/routes/messages/handler.ts', code),
    ).toHaveLength(0);
    expect(await errorBodyBans('packages/plugins/plugin-dojo/src/export.ts', code)).toHaveLength(0);
  });

  it('leaves tests alone', async () => {
    expect(
      await errorBodyBans(
        'test/unit/frogbot/answer.spec.ts',
        "export const answer = () => Response.json({ error: 'No' });",
      ),
    ).toHaveLength(0);
  });
});
