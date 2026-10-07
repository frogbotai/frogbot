import { describe, expect, it, vi } from 'vitest';

import type {
  ChannelQuestionCall,
  QuestionInput,
  QuestionRecord,
} from '../../../packages/frogbot/src/exports/pieces.js';
import {
  answeredComment,
  escapeBlock,
  escapeInline,
  GITHUB_COMMENT_LIMIT,
  questionPages,
} from '../../../packages/pieces/piece-github/src/questions/comments.js';
import { readCommand } from '../../../packages/pieces/piece-github/src/questions/grammar.js';
import { githubQuestions } from '../../../packages/pieces/piece-github/src/questions/index.js';

type Hooks = Required<typeof githubQuestions>;

const threadId = 'github:frogbotai/frogbot:issue:12';

const color = {
  header: 'Color',
  question: 'Which color?',
  options: [{ label: 'Red', description: 'Warm' }, { label: 'Blue' }, { label: 'Green' }],
  custom: true,
};

const size = {
  header: 'Size',
  question: 'Which size?',
  options: [{ label: 'S' }, { label: 'L' }],
  multiple: true,
  custom: false,
};

const strict = {
  header: 'Plan',
  question: 'Which plan?',
  options: [{ label: 'Free' }, { label: 'Pro' }],
  custom: false,
};

function call(...questions: Array<QuestionInput['questions'][number]>): ChannelQuestionCall {
  return {
    toolCallId: 'call-1',
    toolName: 'question',
    input: { questions: questions.length > 0 ? questions : [color] },
    messageId: 'assistant-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-26T00:00:00.000Z',
  };
}

function record({
  messages = [{ id: '100', postedAt: '2026-09-26T10:00:00.000Z', question: 0 }],
  revision = 0,
  state = { q: 0, answers: [], by: [] },
}: Partial<QuestionRecord> = {}): QuestionRecord {
  return { messages, revision, state };
}

function reply({
  body,
  bot = false,
  id = '200',
  login = 'octocat',
  text = body,
}: {
  body: string;
  bot?: boolean;
  id?: string;
  login?: string;
  text?: string;
}) {
  return {
    type: 'message' as const,
    message: {
      id,
      threadId,
      text,
      raw: { type: 'issue_comment', comment: { id: Number(id), body } },
      author: { userId: '42', userName: login, fullName: login, isBot: bot, isMe: false },
      metadata: { dateSent: new Date('2026-09-26T10:01:00Z'), edited: false },
    },
  } as never;
}

function parse({
  body,
  question = record(),
  settled = false,
  target = call(),
  ...rest
}: {
  body: string;
  question?: QuestionRecord;
  settled?: boolean;
  target?: ChannelQuestionCall;
  id?: string;
  text?: string;
  bot?: boolean;
  login?: string;
}) {
  return githubQuestions.parse({
    call: target,
    interaction: reply({ body, ...rest }),
    question,
    settled,
  });
}

function at(id: string): string {
  return new Date(Date.UTC(2026, 8, 26, 10) + Number(id) * 1_000).toISOString();
}

function github({
  failEdits = false,
  failPostAt,
  start = 100,
}: { failEdits?: boolean; failPostAt?: number; start?: number } = {}) {
  const posts: string[] = [];
  const edits: Array<{ id: string; body: string }> = [];
  const deleted: string[] = [];
  let next = start;

  const adapter = {
    postMessage: vi.fn((_thread: string, { raw }: { raw: string }) => {
      if (posts.length === failPostAt) return Promise.reject(new Error('GitHub is down'));

      posts.push(raw);

      const id = String(next++);

      return Promise.resolve({
        id,
        threadId,
        raw: { comment: { id: Number(id), created_at: at(id) } },
      });
    }),
    editMessage: vi.fn((_thread: string, id: string, { raw }: { raw: string }) => {
      if (failEdits) return Promise.reject(new Error('GitHub is down'));

      edits.push({ id, body: raw });

      return Promise.resolve({ id, threadId, raw: {} });
    }),
    deleteMessage: vi.fn((_thread: string, id: string) => {
      deleted.push(id);

      return Promise.resolve();
    }),
  };

  const error = vi.fn();

  return {
    adapter,
    deleted,
    edits,
    error,
    posts,
    args: {
      client: {} as never,
      req: { frogbot: { logger: { error } } } as never,
      thread: { id: threadId, adapter } as never,
    },
  };
}

function rendered(value: string): string {
  return value.replaceAll('\u200b', '').replace(/\\(.)/g, '$1');
}

describe('GitHub question comments', () => {
  it('shows the header, prompt, numbered options with descriptions, and every reply form', () => {
    expect(questionPages({ call: call(color), q: 0 })).toEqual([
      [
        '### Color',
        'Which color?',
        '1. **Red** — Warm\n2. **Blue**\n3. **Green**',
        [
          'Reply in a new comment:',
          '- `/answer 1` to choose an option',
          '- `/answer "your answer"` to answer in your own words',
          '- `/dismiss` to decline this question',
        ].join('\n'),
      ].join('\n\n'),
    ]);
  });

  it('numbers questions in a set and offers several choices only where allowed', () => {
    const [page] = questionPages({ call: call(color, size), q: 1 });

    expect(page).toContain('### Size · Question 2 of 2');
    expect(page).toContain('- `/answer 1, 2` to choose several');
    expect(page).not.toContain('your own words');
    expect(page).toContain('- `/dismiss` to decline these questions');
  });

  it('keeps model text from formatting, mentioning, linking, or converting emoji', () => {
    const label = '*Bold* _it_ [x](y) <b> `c` @team #12 {{emoji:wave}} a|b ~s~ &copy; :+1:';

    const line = escapeInline(label);

    expect(line).not.toMatch(/(^|[^\\])[*_`[\]<>|~&:{]/);
    expect(line).not.toMatch(/@team|#12/);
    expect(rendered(line)).toBe(label);
  });

  it('keeps prompt lines from becoming headings, lists, or quotes', () => {
    const prompt = '# Title\n- item\n> quote\n1. first\n+ plus';

    const block = escapeBlock(prompt);

    expect(block.split('\n').map((line) => line.slice(0, 2))).toEqual([
      '\\#',
      '\\-',
      '\\>',
      '1\\',
      '\\+',
    ]);
    expect(rendered(block)).toBe(prompt);
  });

  it('shows every option label exactly, in order, including markdown characters', () => {
    const labels = ['a*b', 'c_d', '[e]', '@f', 'g`h', 'Ünïcödé 🐸'];
    const target = call({ ...color, options: labels.map((label) => ({ label })) });

    const lines = questionPages({ call: target, q: 0 })[0]
      .split('\n')
      .filter((line) => /^\d+\. /.test(line));

    expect(lines.map((line) => rendered(line.replace(/^\d+\. \*\*|\*\*$/g, '')))).toEqual(labels);
  });

  it('continues a question that exceeds the comment limit in more comments without losing an option', () => {
    const options = Array.from({ length: 120 }, (_, index) => ({
      label: `Option ${index + 1}`,
      description: 'd'.repeat(40),
    }));

    const target = call({ ...color, options });

    const pages = questionPages({ call: target, limit: 1_000, q: 0 });
    const numbered = pages.flatMap((page) =>
      page.split('\n').filter((line) => /^\d+\. /.test(line)),
    );

    expect(pages.length).toBeGreaterThan(5);
    expect(pages.every((page) => page.length <= 1_000)).toBe(true);
    expect(pages.slice(1).every((page) => page.startsWith('**Color** (continued)'))).toBe(true);
    expect(numbered.map((line) => rendered(line.split('**')[1]))).toEqual(
      options.map(({ label }) => label),
    );
    expect(numbered.map((line) => Number(line.split('.')[0]))).toEqual(
      options.map((_, index) => index + 1),
    );
    expect(pages.at(-1)).toContain('- `/dismiss` to decline this question');
    expect(pages.slice(0, -1).some((page) => page.includes('/dismiss'))).toBe(false);
  });

  it('splits a single label longer than a comment across comments', () => {
    const label = 'x'.repeat(GITHUB_COMMENT_LIMIT * 2);

    const pages = questionPages({ call: call({ ...color, options: [{ label }] }), q: 0 });

    expect(pages.every((page) => page.length <= GITHUB_COMMENT_LIMIT)).toBe(true);
    expect(pages.join('').split('x').length - 1).toBe(label.length);
  });

  it('never ends a comment inside an escape when a run of backslashes crosses a page', () => {
    const label = '\\'.repeat(301);

    const pages = questionPages({
      call: call({ ...color, options: [{ label }] }),
      limit: 120,
      q: 0,
    });

    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every((page) => /\\*$/.exec(page)![0].length % 2 === 0)).toBe(true);
    expect(pages.join('').split('\\').length - 1).toBe(label.length * 2);
  });

  it('keeps a trailing # in a header and breaks GH- issue references', () => {
    const target = call({ ...color, header: 'Pick #', question: 'See GH-12 and gh-3' });

    const [page] = questionPages({ call: target, q: 0 });

    expect(page.split('\n')[0]).toBe('### Pick \\#');
    expect(page).not.toMatch(/GH-12|gh-3/);
    expect(rendered(page.split('\n\n')[1])).toBe('See GH-12 and gh-3');
  });

  it('never starts a comment with a reply command, so the bot cannot answer itself', () => {
    const target = call({ ...color, header: '/answer 1', question: '/dismiss' });

    const bodies = [
      ...questionPages({ call: target, q: 0 }),
      answeredComment({ answer: { header: '/answer 1', selected: ['Red'] }, call: target, q: 0 }),
    ];

    expect(bodies.map((body) => readCommand(body).kind)).toEqual(['none', 'none']);
  });
});

describe('GitHub reply parsing', () => {
  it.each([
    ['/answer 2', { selected: ['Blue'] }],
    ['/ANSWER   3', { selected: ['Green'] }],
    ['  /answer 1  ', { selected: ['Red'] }],
    ['/answer 1, 1', { selected: ['Red'] }],
    ['/answer "Teal, please"', { selected: [], custom: 'Teal, please' }],
    ['/answer “Teal”', { selected: [], custom: 'Teal' }],
    ['/answer Teal', { selected: [], custom: 'Teal' }],
    ['/answer "3"', { selected: [], custom: '3' }],
  ])('reads %j as an answer', (body, answer) => {
    expect(parse({ body })).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Color', ...answer }] },
    });
  });

  it('maps several indexes back to their labels in option order', () => {
    const target = call({ ...size, options: [{ label: 'S' }, { label: 'M' }, { label: 'L' }] });

    expect(parse({ body: '/answer 3,1  2', target })).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Size', selected: ['S', 'M', 'L'] }] },
    });
  });

  it.each([
    ['/answer', 'Add your answer after /answer, for example /answer 1.'],
    ['/answer 4', "There's no option 4. Choose a number from 1 to 3."],
    ['/answer 0', "There's no option 0. Choose a number from 1 to 3."],
    ['/answer 1, 2', '“Color” takes one answer. Reply with a single option number.'],
    [
      '/answer 2 because it is calm',
      'Use option numbers only, for example /answer 2. To answer in your own words, put your answer in quotes.',
    ],
    ['/answer ""', 'Type your answer between the quotes.'],
    ['/dismiss now', 'Reply /dismiss on its own to decline.'],
  ])('rejects %j with a reason', (body, reason) => {
    expect(parse({ body })).toEqual({ kind: 'rejected', reason });
  });

  it.each(['/answer "Teal', '/answer "', '/answer “Teal„ please'])(
    'asks for closing quotes on %j',
    (body) => {
      expect(parse({ body })).toEqual({
        kind: 'rejected',
        reason: 'Put your whole answer between quotes, for example /answer "Teal".',
      });
    },
  );

  it('quotes a very large option number as typed', () => {
    expect(parse({ body: '/answer 99999999999999999999999' })).toEqual({
      kind: 'rejected',
      reason: "There's no option 99999999999999999999999. Choose a number from 1 to 3.",
    });
  });

  it.each(['/answer Enterprise', '/answer "Enterprise"', '/answer "Enterprise'])(
    'rejects typed text %j where only listed options are allowed',
    (body) => {
      expect(parse({ body, target: call(strict) })).toEqual({
        kind: 'rejected',
        reason:
          '“Plan” only accepts the listed options. Reply with an option number, for example /answer 1.',
      });
    },
  );

  it('reads /dismiss', () => {
    expect(parse({ body: '/Dismiss' })).toEqual({ kind: 'dismiss' });
  });

  it.each([
    'I think 2',
    '/answering 1',
    '> /answer 1',
    '@frogbot /answer 1',
    '`/answer 1`',
    '/answer1',
  ])('leaves %j as ordinary discussion', (body) => {
    expect(parse({ body })).toEqual({ kind: 'ignore' });
  });

  it('ignores commands from bots and non-reply interactions', () => {
    expect(parse({ body: '/answer 1', bot: true })).toEqual({ kind: 'ignore' });
    expect(
      githubQuestions.parse({
        call: call(),
        interaction: { type: 'action', event: { actionId: 'x' } } as never,
        question: record(),
        settled: false,
      }),
    ).toEqual({ kind: 'ignore' });
  });

  it('reads the raw comment body, so markdown characters in a typed answer survive', () => {
    expect(parse({ body: '/answer "a *b* c"', text: '/answer "a b c"' })).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Color', selected: [], custom: 'a *b* c' }] },
    });
  });

  it('sends any command on an answered question to stale, and leaves discussion alone', () => {
    expect(parse({ body: '/answer 1', settled: true })).toEqual({ kind: 'stale' });
    expect(parse({ body: '/answer 99', settled: true })).toEqual({ kind: 'stale' });
    expect(parse({ body: 'thanks!', settled: true })).toEqual({ kind: 'ignore' });
  });

  it('sends a reply written before the current question comment to stale', () => {
    const question = record({
      messages: [
        { id: '100', postedAt: '2026-09-26T10:00:00.000Z', question: 0 },
        { id: '150', postedAt: '2026-09-26T10:00:05.000Z', question: 1 },
      ],
      state: { q: 1, answers: [{ header: 'Color', selected: ['Red'] }], by: ['octocat'] },
    });

    expect(parse({ body: '/answer 1', id: '149', question, target: call(color, size) })).toEqual({
      kind: 'stale',
    });
    expect(parse({ body: '/answer 1', id: '151', question, target: call(color, size) })).toEqual({
      kind: 'answer',
      output: {
        answers: [
          { header: 'Color', selected: ['Red'] },
          { header: 'Size', selected: ['S'] },
        ],
      },
    });
  });

  it('walks a question set one answer at a time and records who answered each', () => {
    const target = call(color, size, strict);

    const first = parse({ body: '/answer 2', target, login: 'alice' });

    expect(first).toEqual({
      kind: 'partial',
      state: { q: 1, answers: [{ header: 'Color', selected: ['Blue'] }], by: ['alice'] },
    });

    const second = githubQuestions.parse({
      call: target,
      interaction: reply({ body: '/answer 1, 2', login: 'bob' }),
      question: record({ state: (first as { state: unknown }).state }),
      settled: false,
    });

    expect(second).toEqual({
      kind: 'partial',
      state: {
        q: 2,
        answers: [
          { header: 'Color', selected: ['Blue'] },
          { header: 'Size', selected: ['S', 'L'] },
        ],
        by: ['alice', 'bob'],
      },
    });

    expect(
      githubQuestions.parse({
        call: target,
        interaction: reply({ body: '/answer 2' }),
        question: record({ state: (second as { state: unknown }).state }),
        settled: false,
      }),
    ).toEqual({
      kind: 'answer',
      output: {
        answers: [
          { header: 'Color', selected: ['Blue'] },
          { header: 'Size', selected: ['S', 'L'] },
          { header: 'Plan', selected: ['Pro'] },
        ],
      },
    });
  });
});

describe('GitHub question hooks', () => {
  it('render posts the first question and records its comment and posting time', async () => {
    const api = github();

    const result = await githubQuestions.render({
      ...api.args,
      calls: [call(color, size), { ...call(strict), toolCallId: 'call-2' }],
    });

    expect(api.posts).toEqual(questionPages({ call: call(color, size), q: 0 }));
    expect(result).toEqual([
      {
        calls: ['call-1'],
        messages: [{ id: '100', postedAt: at('100'), question: 0 }],
        state: { q: 0, answers: [], by: [] },
      },
    ]);
  });

  it('render posts every comment of an oversize question', async () => {
    const api = github();
    const options = Array.from({ length: 3_000 }, (_, index) => ({
      label: `Option ${index + 1} ${'x'.repeat(30)}`,
    }));

    const [result] = await githubQuestions.render({
      ...api.args,
      calls: [call({ ...color, options })],
    });

    expect(api.posts.length).toBeGreaterThan(1);
    expect(result.messages.map(({ id, question }) => ({ id, question }))).toEqual(
      api.posts.map((_, index) => ({ id: String(100 + index), question: 0 })),
    );
  });

  it('render deletes the comments it posted when a later comment of the question fails', async () => {
    const api = github({ failPostAt: 2 });
    const options = Array.from({ length: 3_000 }, (_, index) => ({
      label: `Option ${index + 1} ${'x'.repeat(30)}`,
    }));

    await expect(
      githubQuestions.render({ ...api.args, calls: [call({ ...color, options })] }),
    ).rejects.toThrow('GitHub is down');
    expect(api.deleted).toEqual(['100', '101']);
  });

  it('updated posts the next question, closes the answered one, and appends it without an interaction', async () => {
    const api = github({ start: 150 });
    const target = call(color, size);

    const change = await (githubQuestions as Hooks).updated({
      ...api.args,
      call: target,
      question: record({
        revision: 1,
        state: { q: 1, answers: [{ header: 'Color', selected: ['Blue'] }], by: ['alice'] },
      }),
    });

    expect(api.posts).toEqual(questionPages({ call: target, q: 1 }));
    expect(api.edits).toEqual([
      {
        id: '100',
        body: answeredComment({
          answer: { header: 'Color', selected: ['Blue'] },
          by: 'alice',
          call: target,
          q: 0,
        }),
      },
    ]);
    expect(api.edits[0].body).toContain('<sub>Answered by `@alice`</sub>');
    expect(change).toEqual({
      messages: [
        { id: '100', postedAt: '2026-09-26T10:00:00.000Z', question: 0 },
        { id: '150', postedAt: at('150'), question: 1 },
      ],
    });
  });

  it('updated throws while the next question is not posted', async () => {
    const api = github({ failPostAt: 0 });

    await expect(
      (githubQuestions as Hooks).updated({
        ...api.args,
        call: call(color, size),
        question: record({ state: { q: 1, answers: [], by: [] } }),
      }),
    ).rejects.toThrow('GitHub is down');
    expect(api.adapter.editMessage).not.toHaveBeenCalled();
  });

  it('updated logs a failed close and still returns the posted question', async () => {
    const api = github({ failEdits: true, start: 150 });

    const change = await (githubQuestions as Hooks).updated({
      ...api.args,
      call: call(color, size),
      question: record({ state: { q: 1, answers: [], by: [] } }),
    });

    expect(change).toMatchObject({ messages: [{ question: 0 }, { question: 1 }] });
    expect(api.error).toHaveBeenCalledWith(
      expect.objectContaining({ piece: 'github', toolCallId: 'call-1', commentId: '100' }),
      '[piece-github] Could not close a question comment.',
    );
  });

  it('settled closes every comment of the call and remembers who answered', async () => {
    const api = github();
    const target = call(color, size);

    const change = await githubQuestions.settled({
      ...api.args,
      call: target,
      actor: {
        user: null,
        channel: { piece: 'github', account: 'github', id: '7', username: 'bob' },
      },
      outcome: {
        output: {
          answers: [
            { header: 'Color', selected: ['Blue'] },
            { header: 'Size', selected: ['L'] },
          ],
        },
      },
      question: record({
        messages: [
          { id: '100', postedAt: '', question: 0 },
          { id: '101', postedAt: '', question: 1 },
          { id: '102', postedAt: '', question: 1 },
        ],
        state: { q: 1, answers: [{ header: 'Color', selected: ['Blue'] }], by: ['alice'] },
      }),
    });

    expect(api.edits.map(({ id }) => id)).toEqual(['100', '101', '102']);
    expect(api.edits[0].body).toContain('✅ **Blue**');
    expect(api.edits[0].body).toContain('Answered by `@alice`');
    expect(api.edits[1].body).toContain('✅ **L**');
    expect(api.edits[1].body).toContain('Answered by `@bob`');
    expect(api.edits[2].body).toBe('**Size** (continued): this question is closed.');
    expect(change).toEqual({
      state: {
        q: 1,
        answers: [{ header: 'Color', selected: ['Blue'] }],
        by: ['alice'],
        closed: { dismissed: false, by: 'bob' },
      },
    });
  });

  it('settled shows a dismissal and keeps earlier answers', async () => {
    const api = github();

    const change = await githubQuestions.settled({
      ...api.args,
      call: call(color, size),
      actor: { user: null, channel: { piece: 'github', id: '7', username: 'bob' } },
      outcome: { dismissed: true },
      question: record({
        messages: [
          { id: '100', postedAt: '', question: 0 },
          { id: '101', postedAt: '', question: 1 },
        ],
        state: { q: 1, answers: [{ header: 'Color', selected: ['Blue'] }], by: ['alice'] },
      }),
    });

    expect(api.edits[0].body).toContain('✅ **Blue**');
    expect(api.edits[1].body).toContain('🚫 **Dismissed**');
    expect(api.edits[1].body).toContain('<sub>Dismissed by `@bob`</sub>');
    expect(change).toMatchObject({ state: { closed: { dismissed: true, by: 'bob' } } });
  });

  it('settled logs a failed edit and still returns who closed the question', async () => {
    const api = github({ failEdits: true });

    const change = await githubQuestions.settled({
      ...api.args,
      call: call(),
      actor: null,
      outcome: { output: { answers: [{ header: 'Color', selected: [], custom: 'Teal' }] } },
      question: record(),
    });

    expect(api.error).toHaveBeenCalledWith(
      expect.objectContaining({ piece: 'github', toolCallId: 'call-1', commentId: '100' }),
      '[piece-github] Could not close a question comment.',
    );
    expect(change).toEqual({ state: { q: 0, answers: [], by: [], closed: { dismissed: false } } });
  });

  it('settled without an actor shows the answer without a login', async () => {
    const api = github();

    await githubQuestions.settled({
      ...api.args,
      call: call(),
      actor: null,
      outcome: { output: { answers: [{ header: 'Color', selected: [], custom: 'Teal' }] } },
      question: record(),
    });

    expect(api.edits).toEqual([
      { id: '100', body: expect.stringMatching(/✅ \*\*“Teal”\*\*\n\n<sub>Answered<\/sub>$/) },
    ]);
  });

  it('rejected replies with the reason and how to answer', async () => {
    const api = github();

    await (githubQuestions as Hooks).rejected({
      ...api.args,
      call: call(),
      interaction: reply({ body: '/answer 9' }),
      question: record(),
      reason: "There's no option 9 for “@team”.",
    });

    expect(api.posts).toEqual([
      [
        "`@octocat` There's no option 9 for “@\u200bteam”.",
        [
          'Reply in a new comment:',
          '- `/answer 1` to choose an option',
          '- `/answer "your answer"` to answer in your own words',
          '- `/dismiss` to decline this question',
        ].join('\n'),
      ].join('\n\n'),
    ]);
  });

  it('rejected leaves out instructions for a question that is not posted yet', async () => {
    const api = github();

    await (githubQuestions as Hooks).rejected({
      ...api.args,
      call: call(color, size),
      interaction: reply({ body: '/answer 1' }),
      question: record({ revision: 1, state: { q: 1, answers: [], by: [] } }),
      reason: 'The next question is still posting — try again in a moment.',
    });

    expect(api.posts).toEqual([
      '`@octocat` The next question is still posting — try again in a moment. Nothing was recorded, so read the next question before you answer again.',
    ]);
  });

  it('denied tells the commenter without mentioning them', async () => {
    const api = github();

    await (githubQuestions as Hooks).denied({
      ...api.args,
      call: call(),
      interaction: reply({ body: '/answer 1', login: 'mallory' }),
      question: record(),
    });

    expect(api.posts).toEqual(["`@mallory` doesn't have access to answer this question."]);
  });

  it.each([
    [
      'names who answered',
      record({ state: { q: 0, answers: [], by: [], closed: { dismissed: false, by: 'bob' } } }),
      '200',
      '`@octocat` This question was already answered by `@bob`.',
    ],
    [
      'names who dismissed',
      record({ state: { q: 0, answers: [], by: [], closed: { dismissed: true, by: 'bob' } } }),
      '200',
      '`@octocat` This question was already dismissed by `@bob`.',
    ],
    [
      'points an earlier reply at the current question',
      record({
        messages: [
          { id: '100', postedAt: '', question: 0 },
          { id: '150', postedAt: '', question: 1 },
        ],
        state: { q: 1, answers: [], by: [] },
      }),
      '120',
      '`@octocat` That reply was for an earlier question. Answer question 2 of 2 instead.',
    ],
    [
      'tells a reply sent before the question was posted',
      record(),
      '99',
      '`@octocat` That reply was sent before this question was posted. Reply again to answer it.',
    ],
    [
      'falls back when nothing is known',
      record(),
      '200',
      '`@octocat` This question is no longer open.',
    ],
  ])('stale %s', async (_, question, id, text) => {
    const api = github();

    await (githubQuestions as Hooks).stale({
      ...api.args,
      call: call(color, size),
      interaction: reply({ body: '/answer 1', id }),
      question,
    });

    expect(api.posts).toEqual([text]);
  });
});
